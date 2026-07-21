"""
Structured logging configuration for CustomsTree.

Provides a single `configure_logging` entrypoint invoked once at application
startup, and a `get_logger` helper used throughout the codebase to guarantee
consistent, structured log output (timestamps, level, module name).
"""

from __future__ import annotations

import logging
import sys
from typing import Final

_LOG_FORMAT: Final[str] = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT: Final[str] = "%Y-%m-%d %H:%M:%S"


def configure_logging(level: str = "INFO") -> None:
    """Configure the root logger once at application startup. Idempotent."""
    root_logger = logging.getLogger()
    if root_logger.handlers:
        # Already configured (e.g. hot-reload) — avoid duplicate handlers.
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(fmt=_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root_logger.setLevel(level.upper())
    root_logger.addHandler(handler)

    # Quiet down noisy third-party loggers so signal isn't lost in transport chatter.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger. Use `get_logger(__name__)` in every module."""
    return logging.getLogger(name)
