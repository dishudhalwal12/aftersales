"""HTTP surface of the Laya decision service.

Two routes, and the split between them is deliberate:

* `GET /health` is open. Every shipped probe reads it without a credential, and it
  exposes no secret — only whether the checkpoint is resident.
* `POST /decision-sheet` needs `x-laya-secret`. Unset secret means the service answers
  503 rather than scoring customer messages for anyone who can reach the port.

Inference is synchronous and blocks, so it runs in a worker thread
(`asyncio.to_thread`). The event loop stays free to answer `/health` — and to refuse an
oversized body — while a decision computes.
"""

from __future__ import annotations

import asyncio
import hmac
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, Mapping, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import sheet as sheet_module
from .config import Config, read_config
from .engine import DecisionEngine, EngineNotReady
from .questions import DECISION_SHEET

SECRET_HEADER = "x-laya-secret"

SERVICE_NAME = "laya-decision-service"

# A customer message is capped at a few thousand characters; this bounds everything else
# a caller could put in the body before it is parsed.
MAX_BODY_BYTES = 256 * 1024


def _error(status: int, code: str, message: str) -> JSONResponse:
    """The same envelope the app's other integration clients already parse."""
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _authorized(provided: Optional[str], expected: str) -> bool:
    # Compared as bytes: `compare_digest` raises TypeError on a str holding non-ASCII,
    # and a header is decoded as latin-1, so a one-byte unauthenticated request could
    # otherwise turn into a 500.
    supplied = (provided or "").encode("utf-8", "surrogateescape")
    return hmac.compare_digest(supplied, expected.encode("utf-8", "surrogateescape"))


async def _read_body(request: Request) -> tuple[Optional[Any], Optional[str]]:
    """`(parsed_json, error)` — one of them is always None."""
    total = 0
    chunks = []
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BODY_BYTES:
            return None, "request body is too large"
        chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        return None, "request body must be valid JSON"
    try:
        return json.loads(raw), None
    except (ValueError, RecursionError):
        return None, "request body must be valid JSON"


def _read_message(body: Any, max_chars: int) -> tuple[Optional[str], Optional[str]]:
    """`(message, error)` — one of them is always None."""
    if not isinstance(body, Mapping):
        return None, "request body must be a JSON object with a 'message' field"
    message = body.get("message")
    if not isinstance(message, str):
        return None, "'message' must be a string"
    if len(message.strip()) == 0:
        return None, "'message' must not be empty"
    if len(message) > max_chars:
        return None, f"'message' is longer than {max_chars} characters"
    return message, None


def create_app(
    config: Optional[Config] = None,
    engine: Optional[DecisionEngine] = None,
    *,
    autoload: bool = True,
) -> FastAPI:
    resolved = config or read_config()
    decision_engine = engine or DecisionEngine(resolved)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        # The first load downloads the checkpoint, so it runs off the request path and
        # the service reports itself as loading until it finishes.
        if autoload and not decision_engine.ready:
            decision_engine.load_in_background()
        yield

    app = FastAPI(
        title=SERVICE_NAME,
        summary="Typed decisions about one customer message, computed locally on MLX",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": SERVICE_NAME,
            "model": decision_engine.model,
            "modelReady": decision_engine.ready,
            "loadError": decision_engine.load_error,
            "sheetVersion": sheet_module.SHEET_VERSION,
            "decisions": len(DECISION_SHEET),
            "secretConfigured": resolved.secret_configured,
        }

    @app.post("/decision-sheet")
    async def decision_sheet(request: Request) -> Any:
        if not resolved.secret_configured:
            return _error(
                503,
                "LAYA_NOT_CONFIGURED",
                "LAYA_SERVICE_SECRET is not set, so the service will not score messages.",
            )
        if not _authorized(request.headers.get(SECRET_HEADER), resolved.secret):
            return _error(401, "UNAUTHORIZED", "Missing or invalid x-laya-secret header.")

        body, body_error = await _read_body(request)
        if body_error is not None:
            return _error(400, "BAD_REQUEST", body_error)

        message, problem = _read_message(body, resolved.max_message_chars)
        if problem is not None or message is None:
            return _error(400, "BAD_REQUEST", problem or "invalid request")

        if not decision_engine.ready:
            await asyncio.to_thread(
                decision_engine.wait_ready, resolved.ready_timeout_seconds
            )
        if not decision_engine.ready:
            reason = decision_engine.load_error
            return _error(
                503,
                "LAYA_MODEL_NOT_READY",
                f"The checkpoint is not resident ({reason})." if reason
                else "The checkpoint is still loading; retry shortly.",
            )

        try:
            answers, latency_ms = await asyncio.to_thread(decision_engine.decide, message)
            return sheet_module.build_sheet(
                answers, model=decision_engine.model, latency_ms=latency_ms
            )
        except EngineNotReady as error:
            return _error(503, "LAYA_MODEL_NOT_READY", str(error))
        except sheet_module.AnswerShapeError as error:
            # A shape mismatch is a wiring bug between this service and the checkpoint.
            # The message names the question, which is what an operator needs; it carries
            # no customer text and no paths.
            return _error(500, "LAYA_BAD_ANSWER", f"the model's answer was unusable: {error}")
        except Exception:  # noqa: BLE001 — never leak weights, paths or OOM text
            return _error(500, "LAYA_INFERENCE_FAILED", "inference failed")

    return app
