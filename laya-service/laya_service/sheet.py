"""Turn raw model answers into the one shape the dashboard consumes.

`laya` answers each question type differently (`choice`/`probability` for a pick,
`score`/`legend` for a rubric, `noul` for a yes/no). The dashboard should not have to
know that, so every answer becomes the same record: a verdict in words, the strength
behind it, the model's confidence, and the options it was choosing between.

A malformed answer raises rather than being coerced: a sheet with a missing field is a
wiring bug between this service and the checkpoint, and papering over it would put an
invented verdict on a customer's ticket.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Sequence

from .questions import DECISION_SHEET, SheetQuestion

SHEET_VERSION = 1

PROVIDER = "laya-mlx"


class AnswerShapeError(ValueError):
    """The model's answer for one question is not the shape that question type promises."""


@dataclass(frozen=True)
class Decision:
    id: str
    kind: str
    title: str
    verdict: str
    probability: float
    confidence: float
    options: List[Dict[str, Any]]
    value: float | None = None

    def to_json(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "verdict": self.verdict,
            "probability": self.probability,
            "confidence": self.confidence,
            "options": self.options,
        }
        if self.value is not None:
            payload["value"] = self.value
        return payload


def _probability(value: Any) -> float:
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise AnswerShapeError(f"probability {number} is outside 0..1")
    return number


def _confidence(answer: Mapping[str, Any]) -> float:
    """The model's confidence. `answer_confidence` is the cross-type field when present."""
    for key in ("answer_confidence", "confidence"):
        if key in answer and answer[key] is not None:
            return _probability(answer[key])
    return 0.0


def _option(label: str, probability: Any) -> Dict[str, Any]:
    return {"label": label, "probability": _probability(probability)}


def _choice_decision(question: SheetQuestion, answer: Mapping[str, Any]) -> Decision:
    probabilities = answer.get("probabilities")
    picked = answer.get("choice")
    if not isinstance(probabilities, Mapping) or not probabilities:
        raise AnswerShapeError(f"{question.id}: choice answer has no probabilities")
    if not isinstance(picked, str) or picked not in probabilities:
        raise AnswerShapeError(f"{question.id}: choice {picked!r} is not one of its options")

    criteria = question.criteria
    order: Sequence[str] = list(criteria.keys()) if isinstance(criteria, Mapping) else list(
        probabilities.keys()
    )
    missing = [label for label in order if label not in probabilities]
    if missing:
        raise AnswerShapeError(
            f"{question.id}: the model returned no probability for {missing[0]!r}"
        )
    options = [_option(label, probabilities[label]) for label in order]

    return Decision(
        id=question.id,
        kind=question.kind,
        title=question.title,
        verdict=picked,
        probability=_probability(probabilities[picked]),
        confidence=_confidence(answer),
        options=options,
    )


def _score_decision(question: SheetQuestion, answer: Mapping[str, Any]) -> Decision:
    probabilities = answer.get("probabilities")
    expected = answer.get("score")
    if not isinstance(probabilities, Mapping) or not probabilities:
        raise AnswerShapeError(f"{question.id}: score answer has no probabilities")
    if not isinstance(expected, (int, float)) or isinstance(expected, bool):
        raise AnswerShapeError(f"{question.id}: score answer has no numeric level")

    legend = answer.get("legend")
    criteria = question.criteria
    levels: Sequence[str] = criteria if isinstance(criteria, (list, tuple)) else []
    if isinstance(legend, Mapping):
        # The model echoes the rubric back, which is the only place a caller sees the
        # actual wording it was scored against.
        levels = [str(legend[key]) for key in sorted(legend, key=int) if key in legend]
    if not levels:
        raise AnswerShapeError(f"{question.id}: score answer has no rubric levels")

    indexed = []
    for index, label in enumerate(levels):
        probability = probabilities.get(str(index))
        if probability is None:
            raise AnswerShapeError(f"{question.id}: level {index} has no probability")
        indexed.append(_option(label, probability))

    top = max(indexed, key=lambda option: option["probability"])
    span = max(1, len(levels) - 1)
    return Decision(
        id=question.id,
        kind=question.kind,
        title=question.title,
        verdict=top["label"],
        probability=top["probability"],
        confidence=_confidence(answer),
        options=indexed,
        value=round(min(1.0, max(0.0, float(expected) / span)), 4),
    )


def _noul_decision(question: SheetQuestion, answer: Mapping[str, Any]) -> Decision:
    raw = answer.get("noul")
    if isinstance(raw, bool):
        probability = 1.0 if raw else 0.0
    elif isinstance(raw, (int, float)):
        probability = _probability(raw)
    else:
        raise AnswerShapeError(f"{question.id}: noul answer carries no probability")

    return Decision(
        id=question.id,
        kind=question.kind,
        title=question.title,
        verdict=question.true_label if probability >= 0.5 else question.false_label,
        probability=probability,
        confidence=_confidence(answer),
        options=[],
    )


def build_decisions(answers: Mapping[str, Any]) -> List[Dict[str, Any]]:
    """Every catalog question, in display order, as a decision record.

    A catalog question the model did not answer is an error: the dashboard would show a
    silently shortened sheet, and "the model had nothing to say" is not a claim this
    service can support, because a missing answer here means a broken request.
    """

    decisions: List[Dict[str, Any]] = []
    for question in DECISION_SHEET:
        answer = answers.get(question.id)
        if not isinstance(answer, Mapping):
            raise AnswerShapeError(f"{question.id}: the model returned no answer")
        if answer.get("type") != question.kind:
            raise AnswerShapeError(
                f"{question.id}: expected a {question.kind} answer, got {answer.get('type')!r}"
            )

        if question.kind == "choice":
            decision = _choice_decision(question, answer)
        elif question.kind == "score":
            decision = _score_decision(question, answer)
        else:
            decision = _noul_decision(question, answer)

        decisions.append(decision.to_json())

    return decisions


def build_sheet(
    answers: Mapping[str, Any], *, model: str, latency_ms: float
) -> Dict[str, Any]:
    """The HTTP body: typed decisions plus the provenance a human needs to judge them."""
    return {
        "provider": PROVIDER,
        "model": model,
        "sheetVersion": SHEET_VERSION,
        "latencyMs": round(latency_ms, 1),
        "decisions": build_decisions(answers),
    }
