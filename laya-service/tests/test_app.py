"""The HTTP contract the Next.js backend depends on."""

from __future__ import annotations

from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from laya_service.app import SECRET_HEADER, create_app
from laya_service.config import read_config
from laya_service.sheet import AnswerShapeError

from .fakes import FakeEngine, pinned_answers

SECRET = "test-secret"


def build_client(engine: Any = None, **env: str) -> Iterator[TestClient]:
    config = read_config({"LAYA_SERVICE_SECRET": SECRET, **env})
    with TestClient(create_app(config, engine or FakeEngine())) as client:
        yield client


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield from build_client()


def post(client: TestClient, body: Any, secret: str = SECRET) -> Any:
    return client.post("/decision-sheet", json=body, headers={SECRET_HEADER: secret})


def test_health_is_open_and_reports_no_secret(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "laya-decision-service"
    assert body["modelReady"] is True
    assert body["decisions"] == 8
    assert body["sheetVersion"] == 1
    assert body["secretConfigured"] is True
    assert SECRET not in response.text


def test_health_reports_a_checkpoint_that_failed_to_load() -> None:
    engine = FakeEngine(ready=False, load_error="OSError: no such model")
    for client in build_client(engine):
        body = client.get("/health").json()
        assert body["modelReady"] is False
        assert "no such model" in body["loadError"]


def test_inference_is_refused_when_no_secret_is_configured() -> None:
    config = read_config({})
    with TestClient(create_app(config, FakeEngine())) as client:
        response = post(client, {"message": "I was billed twice."}, secret="anything")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "LAYA_NOT_CONFIGURED"


@pytest.mark.parametrize("secret", ["wrong-secret", ""])
def test_a_wrong_secret_is_rejected(client: TestClient, secret: str) -> None:
    response = post(client, {"message": "hello"}, secret=secret)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_a_request_without_the_secret_header_is_rejected(client: TestClient) -> None:
    response = client.post("/decision-sheet", json={"message": "hello"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({}, "'message' must be a string"),
        ({"message": ""}, "'message' must not be empty"),
        ({"message": "   "}, "'message' must not be empty"),
        ({"message": 42}, "'message' must be a string"),
        (["not", "an", "object"], "must be a JSON object"),
    ],
)
def test_a_malformed_body_is_refused(client: TestClient, body: Any, expected: str) -> None:
    response = post(client, body)
    assert response.status_code == 400
    assert expected in response.json()["error"]["message"]


def test_a_message_longer_than_the_cap_is_refused() -> None:
    for client in build_client(LAYA_MAX_MESSAGE_CHARS="10"):
        response = post(client, {"message": "x" * 11})
        assert response.status_code == 400
        assert "longer than 10" in response.json()["error"]["message"]


def test_an_oversized_body_is_refused_before_it_is_parsed(client: TestClient) -> None:
    response = client.post(
        "/decision-sheet",
        content=b'{"message": "' + b"a" * 300_000 + b'"}',
        headers={SECRET_HEADER: SECRET, "content-type": "application/json"},
    )
    assert response.status_code == 400
    assert "too large" in response.json()["error"]["message"]


def test_a_body_that_is_not_json_is_refused(client: TestClient) -> None:
    response = client.post(
        "/decision-sheet",
        content=b"not json at all",
        headers={SECRET_HEADER: SECRET, "content-type": "application/json"},
    )
    assert response.status_code == 400
    assert "valid JSON" in response.json()["error"]["message"]


def test_a_valid_request_returns_the_whole_sheet(client: TestClient) -> None:
    response = post(client, {"message": "I was billed twice. Please refund the duplicate today."})
    assert response.status_code == 200

    body = response.json()
    assert body["provider"] == "laya-mlx"
    assert body["model"] == "fake-model"
    assert body["sheetVersion"] == 1
    assert body["latencyMs"] == pytest.approx(12.5)
    assert [decision["id"] for decision in body["decisions"]][0] == "urgent_now"
    assert len(body["decisions"]) == 8


def test_the_message_reaches_the_engine_unchanged() -> None:
    engine = FakeEngine()
    for client in build_client(engine):
        message = "  Billed twice — please refund.  "
        assert post(client, {"message": message}).status_code == 200
        assert engine.calls == [message]


def test_a_checkpoint_that_never_loads_is_a_503_not_a_hang() -> None:
    engine = FakeEngine(ready=False, load_error="OSError: weights missing")
    for client in build_client(engine, LAYA_READY_TIMEOUT_SECONDS="0"):
        response = post(client, {"message": "hello"})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "LAYA_MODEL_NOT_READY"
        assert "weights missing" in response.json()["error"]["message"]


def test_an_unusable_answer_names_the_question_and_leaks_nothing_else() -> None:
    engine = FakeEngine(error=AnswerShapeError("intent: choice answer has no probabilities"))
    for client in build_client(engine):
        response = post(client, {"message": "hello"})
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "LAYA_BAD_ANSWER"
        assert "intent" in response.json()["error"]["message"]


def test_an_inference_failure_does_not_echo_internals() -> None:
    engine = FakeEngine(error=RuntimeError("/Users/someone/.cache/huggingface: out of memory"))
    for client in build_client(engine):
        response = post(client, {"message": "hello"})
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "LAYA_INFERENCE_FAILED"
        assert "huggingface" not in response.text
        assert "out of memory" not in response.text


def test_a_real_answer_set_round_trips_through_the_route() -> None:
    for client in build_client(FakeEngine(pinned_answers())):
        body = post(client, {"message": "Billed twice."}).json()
        urgent = next(d for d in body["decisions"] if d["id"] == "urgent_now")
        assert urgent["verdict"] == "urgent"
