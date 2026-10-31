"""Config parsing: a value that cannot be honoured stops the service, quietly wrong does not."""

from __future__ import annotations

import pytest

from laya_service.config import (
    DEFAULT_HOST,
    DEFAULT_MAX_MESSAGE_CHARS,
    DEFAULT_MODEL,
    DEFAULT_PORT,
    DEFAULT_READY_TIMEOUT_SECONDS,
    ConfigError,
    read_config,
)


def test_defaults_are_truthful() -> None:
    config = read_config({})
    assert config.host == DEFAULT_HOST
    assert config.port == DEFAULT_PORT
    assert config.model == DEFAULT_MODEL
    assert config.max_message_chars == DEFAULT_MAX_MESSAGE_CHARS
    assert config.ready_timeout_seconds == DEFAULT_READY_TIMEOUT_SECONDS
    assert config.secret == ""
    assert config.secret_configured is False


def test_a_secret_makes_the_service_usable() -> None:
    config = read_config({"LAYA_SERVICE_SECRET": "  s3cret  "})
    assert config.secret == "s3cret"
    assert config.secret_configured is True


def test_blank_values_mean_unset() -> None:
    config = read_config(
        {"LAYA_PORT": "  ", "LAYA_MODEL": "", "LAYA_SERVICE_SECRET": "", "LAYA_HOST": ""}
    )
    assert config.port == DEFAULT_PORT
    assert config.model == DEFAULT_MODEL
    assert config.host == DEFAULT_HOST


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        ("LAYA_PORT", "eighty", "must be an integer"),
        ("LAYA_PORT", "0", "must be between 1 and 65535"),
        ("LAYA_PORT", "70000", "must be between 1 and 65535"),
        ("LAYA_MAX_MESSAGE_CHARS", "0", "must be between 1 and 50000"),
        ("LAYA_READY_TIMEOUT_SECONDS", "soon", "must be a number"),
        ("LAYA_READY_TIMEOUT_SECONDS", "-1", "must be between 0.0 and 300.0"),
    ],
)
def test_a_value_that_cannot_be_honoured_is_refused(key: str, value: str, message: str) -> None:
    with pytest.raises(ConfigError) as error:
        read_config({key: value})
    assert message in str(error.value)


def test_the_model_can_be_pinned_to_a_local_path() -> None:
    assert read_config({"LAYA_MODEL": "/models/laya"}).model == "/models/laya"
