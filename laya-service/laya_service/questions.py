"""The decision sheet: the typed questions this service asks about one customer message.

This catalog is the model's real interface. Wording, option order and option
descriptions are part of the contract with the checkpoint, so they live next to the
model rather than in the TypeScript app: the app sends a message and receives named
decisions, and a wording change here is a deliberate model change, not a frontend edit.

Ordering is the display order. `urgent_now` is first on purpose — it is the headline
the dashboard shows as "urgent" or "not urgent".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Literal, Mapping, Sequence, Union

QuestionKind = Literal["choice", "score", "noul"]


@dataclass(frozen=True)
class SheetQuestion:
    """One question, plus the label the dashboard needs for its answer."""

    id: str
    kind: QuestionKind
    title: str
    instructions: str
    criteria: Union[Sequence[str], Mapping[str, str], None] = None
    # For `noul` only: how the two answers read in the dashboard.
    true_label: str = "yes"
    false_label: str = "no"

    def to_laya(self) -> Dict[str, Any]:
        """The question in the shape `laya.predict` accepts."""
        question: Dict[str, Any] = {"type": self.kind, "instructions": self.instructions}
        if self.criteria is not None:
            question["criteria"] = self.criteria
        return question


def _choice(
    question_id: str, title: str, instructions: str, options: Mapping[str, str]
) -> SheetQuestion:
    return SheetQuestion(
        id=question_id,
        kind="choice",
        title=title,
        instructions=instructions,
        criteria=options,
    )


def _score(
    question_id: str, title: str, instructions: str, levels: Sequence[str]
) -> SheetQuestion:
    return SheetQuestion(
        id=question_id, kind="score", title=title, instructions=instructions, criteria=list(levels)
    )


def _noul(
    question_id: str,
    title: str,
    instructions: str,
    *,
    true_label: str = "yes",
    false_label: str = "no",
) -> SheetQuestion:
    return SheetQuestion(
        id=question_id,
        kind="noul",
        title=title,
        instructions=instructions,
        true_label=true_label,
        false_label=false_label,
    )


# Eight questions: one choice, two scores, five yes/no propositions. Well inside the
# package's 64-question and 512-option ceilings, and ~15% of the 1024-token context.
DECISION_SHEET: tuple[SheetQuestion, ...] = (
    _noul(
        "urgent_now",
        "Needs attention now",
        "Does `message` need a human response within the hour?",
        true_label="urgent",
        false_label="not urgent",
    ),
    _score(
        "urgency",
        "Urgency",
        "How urgent is the request in `message`?",
        [
            "no time pressure",
            "needs attention soon",
            "blocking issue or hard deadline",
        ],
    ),
    _choice(
        "intent",
        "Intent",
        "What does the customer want in `message`?",
        {
            "refund": "money returned or a duplicate charge reversed",
            "technical_help": "a bug, outage or integration problem",
            "billing_question": "a question about an invoice, plan or payment method",
            "information": "general information, pricing or how-to",
            "cancellation": "wants to cancel or downgrade",
            "other": "none of the other options fits",
        },
    ),
    _score(
        "frustration",
        "Frustration",
        "How frustrated does the customer sound in `message`?",
        [
            "calm and neutral",
            "concerned but civil",
            "clearly annoyed",
            "very angry or using strong language",
        ],
    ),
    _noul(
        "human_requested",
        "Human requested",
        "Does the customer explicitly ask for a human, manager, or agent?",
    ),
    _noul(
        "sensitive_case",
        "Sensitive case",
        "Does `message` involve a money dispute, legal threat, safety risk, or medical issue?",
    ),
    _noul(
        "refund_requested",
        "Refund requested",
        "Does the customer ask for money back?",
    ),
    _noul(
        "churn_risk",
        "Churn risk",
        "Does `message` suggest the customer may leave for a competitor or cancel?",
    ),
)

# The state the questions read. Every instruction above names `message` in backticks,
# which is the preset convention for "read this field of the state".
STATE_FIELD = "message"


def questions_payload() -> Dict[str, Dict[str, Any]]:
    """The whole catalog in the shape `laya.predict` accepts, keyed by question id."""
    return {question.id: question.to_laya() for question in DECISION_SHEET}


def state_for(message: str) -> Dict[str, str]:
    """The state dict for one customer message."""
    return {STATE_FIELD: message}
