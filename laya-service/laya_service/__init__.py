"""Local typed-decision service for AfterSales AI.

`create_app` builds the HTTP app; `DecisionEngine` owns the resident MLX checkpoint.
Both are re-exported so a host can import the service without going through uvicorn.
"""

from .app import SECRET_HEADER, SERVICE_NAME, create_app
from .config import Config, ConfigError, read_config
from .engine import DecisionEngine, EngineNotReady
from .questions import DECISION_SHEET, SheetQuestion
from .sheet import SHEET_VERSION, AnswerShapeError, build_decisions, build_sheet

__all__ = [
    "AnswerShapeError",
    "Config",
    "ConfigError",
    "DECISION_SHEET",
    "DecisionEngine",
    "EngineNotReady",
    "SECRET_HEADER",
    "SERVICE_NAME",
    "SHEET_VERSION",
    "SheetQuestion",
    "build_decisions",
    "build_sheet",
    "create_app",
    "read_config",
]

__version__ = "0.1.0"
