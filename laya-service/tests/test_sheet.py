"""Answer shaping: the one place a raw model answer becomes a decision the UI can read."""

from __future__ import annotations

import copy

import pytest

from laya_service.questions import DECISION_SHEET
from laya_service.sheet import AnswerShapeError, build_decisions, build_sheet

from .fakes import generated_answers, pinned_answers


def by_id(decisions):
    return {decision["id"]: decision for decision in decisions}


def test_every_catalog_question_produces_a_decision_in_display_order() -> None:
    decisions = build_decisions(pinned_answers())
    assert [decision["id"] for decision in decisions] == [q.id for q in DECISION_SHEET]
    assert all(decision["title"] for decision in decisions)


def test_a_yes_no_question_reads_as_words_not_a_float() -> None:
    decisions = by_id(build_decisions(pinned_answers()))

    assert decisions["urgent_now"]["verdict"] == "urgent"
    assert decisions["urgent_now"]["probability"] == pytest.approx(0.9134)
    assert decisions["urgent_now"]["confidence"] == pytest.approx(0.9134)
    assert decisions["urgent_now"]["options"] == []

    assert decisions["human_requested"]["verdict"] == "no"
    assert decisions["refund_requested"]["verdict"] == "yes"
    assert decisions["sensitive_case"]["verdict"] == "no"
    assert decisions["churn_risk"]["verdict"] == "no"


def test_a_choice_carries_every_option_in_catalog_order() -> None:
    intent = by_id(build_decisions(pinned_answers()))["intent"]
    criteria = next(q.criteria for q in DECISION_SHEET if q.id == "intent")

    assert intent["verdict"] == "billing_question"
    assert intent["probability"] == pytest.approx(0.7211)
    assert [option["label"] for option in intent["options"]] == list(criteria)
    assert sum(option["probability"] for option in intent["options"]) == pytest.approx(1.0)


def test_a_score_keeps_its_rubric_and_its_expected_level() -> None:
    decisions = by_id(build_decisions(pinned_answers()))
    urgency = decisions["urgency"]
    frustration = decisions["frustration"]

    assert urgency["verdict"] == "blocking issue or hard deadline"
    assert urgency["probability"] == pytest.approx(0.7713)
    # 1.7412 on a three-level scale (0, 1, 2) is 87% of the way up.
    assert urgency["value"] == pytest.approx(0.8706)
    assert [option["label"] for option in urgency["options"]] == [
        "no time pressure",
        "needs attention soon",
        "blocking issue or hard deadline",
    ]

    assert frustration["verdict"] == "clearly annoyed"
    assert frustration["value"] == pytest.approx(0.7338)


def test_confidence_prefers_the_cross_type_field() -> None:
    # `confidence` on a score is normalised entropy; `answer_confidence` is the calibrated
    # number and is the one the sheet reports, so gating works across question types.
    urgency = by_id(build_decisions(pinned_answers()))["urgency"]
    assert urgency["confidence"] == pytest.approx(0.7713)


def test_a_catalog_built_answer_set_is_accepted() -> None:
    decisions = build_decisions(generated_answers())
    assert len(decisions) == len(DECISION_SHEET)


def test_a_missing_answer_is_an_error_not_a_shorter_sheet() -> None:
    answers = pinned_answers()
    del answers["churn_risk"]
    with pytest.raises(AnswerShapeError) as error:
        build_decisions(answers)
    assert "churn_risk" in str(error.value)


def test_an_answer_of_the_wrong_kind_is_refused() -> None:
    answers = pinned_answers()
    answers["urgent_now"] = {"type": "score", "score": 1.0, "probabilities": {"0": 1.0}}
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_a_choice_outside_its_options_is_refused() -> None:
    answers = copy.deepcopy(pinned_answers())
    answers["intent"]["choice"] = "wants_a_pony"
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_a_choice_missing_an_option_probability_is_refused() -> None:
    answers = copy.deepcopy(pinned_answers())
    del answers["intent"]["probabilities"]["other"]
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_a_probability_outside_zero_to_one_is_refused() -> None:
    answers = copy.deepcopy(pinned_answers())
    answers["refund_requested"]["noul"] = 1.4
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_a_score_without_levels_is_refused() -> None:
    answers = copy.deepcopy(pinned_answers())
    answers["frustration"].pop("legend")
    answers["frustration"].pop("probabilities")
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_a_yes_no_answer_without_a_probability_is_refused() -> None:
    answers = copy.deepcopy(pinned_answers())
    answers["churn_risk"].pop("noul")
    with pytest.raises(AnswerShapeError):
        build_decisions(answers)


def test_the_sheet_carries_its_provenance() -> None:
    sheet = build_sheet(pinned_answers(), model="aac6fef/laya-typed-decisions-mlx", latency_ms=13.44)
    assert sheet["provider"] == "laya-mlx"
    assert sheet["model"] == "aac6fef/laya-typed-decisions-mlx"
    assert sheet["sheetVersion"] == 1
    assert sheet["latencyMs"] == pytest.approx(13.4)
    assert len(sheet["decisions"]) == len(DECISION_SHEET)
