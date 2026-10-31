"""The question catalog is the model's interface, so it gets its own tests."""

from __future__ import annotations

import re

from laya_service.questions import DECISION_SHEET, STATE_FIELD, questions_payload, state_for

# The package caps a choice at 20 options and the whole request at 512 answer options;
# this catalog stays far below both, and the test asserts it stays there.
MAX_CHOICE_OPTIONS = 20
MAX_TOTAL_OPTIONS = 512


def test_ids_are_unique_and_titled() -> None:
    ids = [question.id for question in DECISION_SHEET]
    assert len(ids) == len(set(ids))
    assert all(question.title.strip() for question in DECISION_SHEET)


def test_every_instruction_names_the_state_field() -> None:
    # `laya`'s presets read the state field a question names in backticks. A question that
    # names a field the state does not carry would be answered about nothing.
    for question in DECISION_SHEET:
        assert f"`{STATE_FIELD}`" in question.instructions or question.kind == "noul", (
            f"{question.id} does not name `{STATE_FIELD}`"
        )
    assert state_for("hello") == {STATE_FIELD: "hello"}


def test_every_choice_has_named_options_with_descriptions() -> None:
    choices = [question for question in DECISION_SHEET if question.kind == "choice"]
    assert choices, "the sheet should classify intent"
    for question in choices:
        assert isinstance(question.criteria, dict)
        assert 2 <= len(question.criteria) <= MAX_CHOICE_OPTIONS
        assert all(isinstance(label, str) and label for label in question.criteria)
        assert all(
            isinstance(description, str) and description
            for description in question.criteria.values()
        ), f"{question.id} has an option with no description"


def test_score_questions_have_ordered_levels() -> None:
    scores = [question for question in DECISION_SHEET if question.kind == "score"]
    assert scores
    for question in scores:
        assert isinstance(question.criteria, list)
        assert len(question.criteria) >= 2
        assert all(isinstance(level, str) and level for level in question.criteria)


def test_noul_questions_carry_both_reading_labels() -> None:
    for question in DECISION_SHEET:
        if question.kind != "noul":
            continue
        assert question.true_label != question.false_label
        assert question.true_label and question.false_label


def test_option_budget_stays_inside_the_package_limits() -> None:
    total = 0
    for question in DECISION_SHEET:
        if isinstance(question.criteria, dict):
            total += len(question.criteria)
        elif isinstance(question.criteria, list):
            total += len(question.criteria)
    assert total <= MAX_TOTAL_OPTIONS


def test_urgent_now_is_the_headline() -> None:
    # The dashboard reads the first decision as the urgent / not urgent headline.
    assert DECISION_SHEET[0].id == "urgent_now"
    assert DECISION_SHEET[0].kind == "noul"


def test_payload_matches_the_runtime_shape() -> None:
    payload = questions_payload()
    assert set(payload) == {question.id for question in DECISION_SHEET}
    for question_id, entry in payload.items():
        assert entry["type"] in {"choice", "score", "noul"}
        assert isinstance(entry["instructions"], str) and entry["instructions"]
        assert not re.search(r"\s{2,}", entry["instructions"]), "instructions have double spaces"
        if entry["type"] == "noul":
            assert "criteria" not in entry
        else:
            assert entry["criteria"]
