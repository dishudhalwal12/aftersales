"""Environment parsing for the Laya decision service.

Every value has a truthful default. The one value with no default is the shared
secret: without it the service refuses inference rather than serving decisions to
anyone who can reach the port, which is the same rule the Baileys bridge follows.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

# The checkpoint this service is built around: ModernBERT-large, 1024-token context,
# fine-tuned on the upstream typed-decisions customer-service workflow.
DEFAULT_MODEL = "aac6fef/laya-typed-decisions-mlx"

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8100

# The app sends a single customer message; 4 000 characters matches the app's own
# inbound limit and leaves room for the question catalog inside the context window.
DEFAULT_MAX_MESSAGE_CHARS = 4_000

# A request that arrives while the checkpoint is still loading waits this long for it
# instead of answering 503 straight away, so the first ticket after a restart usually
# still gets a sheet.
DEFAULT_READY_TIMEOUT_SECONDS = 15.0


class ConfigError(ValueError):
    """A configured value cannot be honoured; the service must not start."""


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    secret: str
    model: str
    max_message_chars: int
    ready_timeout_seconds: float

    @property
    def secret_configured(self) -> bool:
        return len(self.secret) > 0


def _read_int(env: Mapping[str, str], key: str, default: int, minimum: int, maximum: int) -> int:
    raw = (env.get(key) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{key} must be an integer, got {raw!r}") from None
    if not minimum <= value <= maximum:
        raise ConfigError(f"{key} must be between {minimum} and {maximum}, got {value}")
    return value


def _read_float(
    env: Mapping[str, str], key: str, default: float, minimum: float, maximum: float
) -> float:
    raw = (env.get(key) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{key} must be a number, got {raw!r}") from None
    if not minimum <= value <= maximum:
        raise ConfigError(f"{key} must be between {minimum} and {maximum}, got {value}")
    return value


def read_config(env: Mapping[str, str] | None = None) -> Config:
    """Parse the environment. Raises `ConfigError` on a value that cannot be honoured."""
    source: Mapping[str, str] = os.environ if env is None else env
    return Config(
        host=(source.get("LAYA_HOST") or DEFAULT_HOST).strip(),
        port=_read_int(source, "LAYA_PORT", DEFAULT_PORT, 1, 65535),
        # Deliberately not stripped beyond surrounding whitespace: a secret with a
        # trailing newline pasted from a shell is a different secret, and hiding that
        # would make a mismatch look like a bug in the client.
        secret=(source.get("LAYA_SERVICE_SECRET") or "").strip(),
        model=(source.get("LAYA_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        max_message_chars=_read_int(
            source, "LAYA_MAX_MESSAGE_CHARS", DEFAULT_MAX_MESSAGE_CHARS, 1, 50_000
        ),
        ready_timeout_seconds=_read_float(
            source, "LAYA_READY_TIMEOUT_SECONDS", DEFAULT_READY_TIMEOUT_SECONDS, 0.0, 300.0
        ),
    )
