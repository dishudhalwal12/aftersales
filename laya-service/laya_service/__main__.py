"""`python -m laya_service` — run the decision service with uvicorn."""

from __future__ import annotations

import sys

import uvicorn
from dotenv import load_dotenv

from .app import create_app
from .config import ConfigError, read_config


def main() -> int:
    # A `.env` next to this package is a convenience for a human shell; a variable the
    # host already exported wins, which is how the Next.js app starts the service.
    load_dotenv(override=False)

    try:
        config = read_config()
    except ConfigError as error:
        print(f"laya-service: {error}", file=sys.stderr)
        return 2

    print(f"laya-service: model={config.model}")
    print(
        "laya-service: secret "
        + ("configured" if config.secret_configured else "MISSING (inference answers 503)")
    )
    print(f"laya-service: listening on http://{config.host}:{config.port}")

    uvicorn.run(
        create_app(config),
        host=config.host,
        port=config.port,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
