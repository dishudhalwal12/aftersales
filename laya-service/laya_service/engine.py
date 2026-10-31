"""The checkpoint holder.

The model is loaded once and kept resident: the model card is explicit that a hot-path
checkpoint should not be reloaded per request, and the first load downloads ~900 MB.
Inference is synchronous and runs on one model, so one lock serialises forward passes
and the FastAPI routes are plain `def` handlers — Starlette runs those on its thread
pool, which keeps the event loop free to answer `/health` while a decision computes.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, Dict, Mapping, Optional

from .config import Config
from .questions import questions_payload, state_for

# `laya.load(...)` is imported lazily so `import laya_service.app` (and its tests) never
# pays MLX's import cost, and so a host without the wheel still gets a service that
# reports itself unready instead of failing to start.
Loader = Callable[[str], Any]


class EngineNotReady(RuntimeError):
    """No resident checkpoint yet."""


class DecisionEngine:
    def __init__(self, config: Config, loader: Optional[Loader] = None) -> None:
        self._config = config
        self._loader = loader
        self._agent: Any = None
        self._load_error: Optional[str] = None
        self._ready = threading.Event()
        # Set on success *and* failure, so a request can tell "still downloading" from
        # "this host will never have a checkpoint" without waiting out its timeout.
        self._finished = threading.Event()
        self._lock = threading.Lock()

    # -- lifecycle ---------------------------------------------------------

    def load(self) -> None:
        """Build the checkpoint. Never raises: a failure is reported, not crashed on."""
        try:
            agent = (self._loader or _default_loader)(self._config.model)
        except Exception as error:  # noqa: BLE001 — the reason is surfaced on /health
            self._load_error = f"{type(error).__name__}: {error}"
            return
        finally:
            self._finished.set()
        self._agent = agent
        self._load_error = None
        self._ready.set()

    def load_in_background(self) -> threading.Thread:
        thread = threading.Thread(target=self.load, name="laya-load", daemon=True)
        thread.start()
        return thread

    def wait_ready(self, timeout: float) -> bool:
        """Block until the checkpoint is usable, the load failed, or `timeout` passes."""
        if self._ready.is_set():
            return True
        self._finished.wait(timeout=max(0.0, timeout))
        return self._ready.is_set()

    @property
    def ready(self) -> bool:
        return self._ready.is_set()

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    @property
    def model(self) -> str:
        return self._config.model

    # -- inference ---------------------------------------------------------

    def decide(self, message: str) -> tuple[Dict[str, Any], float]:
        """Raw model answers for one message, plus how long the forward pass took."""
        if not self.ready or self._agent is None:
            raise EngineNotReady(self._load_error or "the checkpoint is still loading")

        questions = questions_payload()
        state = state_for(message)
        # One forward pass at a time: the checkpoint is a single MLX allocation, and
        # concurrent passes would contend for the same GPU buffers for no throughput
        # gain on one message.
        with self._lock:
            started = time.perf_counter()
            result = self._agent.predict(state, questions)
            latency_ms = (time.perf_counter() - started) * 1000.0

        if not isinstance(result, Mapping):
            raise ValueError("the model returned a non-object result")
        answers = result.get("answers")
        if not isinstance(answers, Mapping):
            raise ValueError("the model returned no answers")
        return dict(answers), latency_ms


def _default_loader(model: str) -> Any:
    import laya_mlx as laya

    # FP16 is the checkpoint's own arithmetic. The model card notes FP32 is available for
    # closer agreement with the upstream PyTorch run; FP16 is what it ships validated for.
    return laya.load(model, dtype="float16")
