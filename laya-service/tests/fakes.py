"""Test doubles: a stand-in checkpoint so the HTTP contract is testable without MLX."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

from laya_service.questions import DECISION_SHEET


def pinned_answers() -> Dict[str, Any]:
    """The exact answer shapes `laya_mlx` 0.6.0 emits, for all eight questions.

    Pinned by hand rather than generated from the catalog: this is the shape that would
    change under us if the runtime changed, and the test should fail when it does.
    """
    return {
        "urgent_now": {
            "type": "noul",
            "noul": 0.9134,
            "confidence": 0.9134,
            "answer_confidence": 0.9134,
            "action": {"act_probability": 0.5},
        },
        "urgency": {
            "type": "score",
            "score": 1.7412,
            "legend": {
                "0": "no time pressure",
                "1": "needs attention soon",
                "2": "blocking issue or hard deadline",
            },
            "probabilities": {"0": 0.0312, "1": 0.1975, "2": 0.7713},
            "confidence": 0.4021,
            "answer_confidence": 0.7713,
            "action": {"act_probability": 0.5},
        },
        "intent": {
            "type": "choice",
            "choice": "billing_question",
            "probabilities": {
                "refund": 0.0812,
                "technical_help": 0.0704,
                "billing_question": 0.7211,
                "information": 0.0612,
                "cancellation": 0.0401,
                "other": 0.026,
            },
            "confidence": 0.5513,
            "answer_confidence": 0.7211,
            "action": {"act_probability": 0.5},
        },
        "frustration": {
            "type": "score",
            "score": 2.2013,
            "legend": {
                "0": "calm and neutral",
                "1": "concerned but civil",
                "2": "clearly annoyed",
                "3": "very angry or using strong language",
            },
            "probabilities": {"0": 0.0611, "1": 0.1802, "2": 0.5207, "3": 0.238},
            "confidence": 0.3104,
            "answer_confidence": 0.5207,
            "action": {"act_probability": 0.5},
        },
        "human_requested": {
            "type": "noul",
            "noul": 0.0612,
            "confidence": 0.9388,
            "answer_confidence": 0.9388,
            "action": {"act_probability": 0.5},
        },
        "sensitive_case": {
            "type": "noul",
            "noul": 0.3121,
            "confidence": 0.6879,
            "answer_confidence": 0.6879,
            "action": {"act_probability": 0.5},
        },
        "refund_requested": {
            "type": "noul",
            "noul": 0.8042,
            "confidence": 0.8042,
            "answer_confidence": 0.8042,
            "action": {"act_probability": 0.5},
        },
        "churn_risk": {
            "type": "noul",
            "noul": 0.2104,
            "confidence": 0.7896,
            "answer_confidence": 0.7896,
            "action": {"act_probability": 0.5},
        },
    }


def generated_answers() -> Dict[str, Any]:
    """A valid answer for every catalog question, built from the catalog itself."""
    answers: Dict[str, Any] = {}
    for question in DECISION_SHEET:
        if question.kind == "choice":
            labels = list(question.criteria or [])
            share = round(1.0 / len(labels), 4)
            probabilities = {label: share for label in labels}
            answers[question.id] = {
                "type": "choice",
                "choice": labels[0],
                "probabilities": probabilities,
                "confidence": share,
                "answer_confidence": share,
            }
        elif question.kind == "score":
            levels = list(question.criteria or [])
            share = round(1.0 / len(levels), 4)
            answers[question.id] = {
                "type": "score",
                "score": (len(levels) - 1) / 2,
                "legend": {str(i): label for i, label in enumerate(levels)},
                "probabilities": {str(i): share for i in range(len(levels))},
                "confidence": share,
                "answer_confidence": share,
            }
        else:
            answers[question.id] = {
                "type": "noul",
                "noul": 0.6,
                "confidence": 0.6,
                "answer_confidence": 0.6,
            }
    return answers


class FakeEngine:
    """A `DecisionEngine` with no checkpoint behind it."""

    def __init__(
        self,
        answers: Optional[Mapping[str, Any]] = None,
        *,
        ready: bool = True,
        load_error: Optional[str] = None,
        error: Optional[BaseException] = None,
    ) -> None:
        self.model = "fake-model"
        self.ready = ready
        self.load_error = load_error
        self.answers = dict(answers if answers is not None else pinned_answers())
        self.error = error
        self.calls: list[str] = []

    def load(self) -> None:
        return None

    def load_in_background(self) -> Any:
        return None

    def wait_ready(self, timeout: float) -> bool:
        return self.ready

    def decide(self, message: str) -> tuple[Dict[str, Any], float]:
        self.calls.append(message)
        if self.error is not None:
            raise self.error
        return dict(self.answers), 12.5
