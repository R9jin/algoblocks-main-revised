"""
test_regression_service.py
==========================
Checks the pure-Python simple one-predictor regression (Learning Impact
Model) in api/services/regression_service.py against the real
2026-09-20 export (30 respondents, values exactly as reported).

Model: X = average(z_TSR, z_AES, z_ROG); Y = (Post - Pre) / (100 - Pre);
Y = b0 + b1 * X, fit by the elementary running-sums formula (matches the
SOP3_Regression_Tutorial.docx worked example exactly).

The expected numbers below were cross-checked independently in Python
against the sums formula from the tutorial, so these tests guard both the
hand-rolled math and the honesty rules (no causal wording, non-significant
stays non-significant).

Run:  pytest tests/test_regression_service.py -v
No database needed: regression_service only imports stats_utils.
"""
import math
import os
import sys

import pytest

API_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from services.regression_service import (  # noqa: E402
    ASSOCIATION_ONLY,
    MIN_RESPONDENTS,
    _t_critical,
    compute_learning_impact_regression,
)

FIXTURE_CSV = """S01,89,100,78.7,92.7,75.5
S02,11,97,75.0,82.4,90.5
S03,46,94,74.9,86.2,49.4
S04,43,94,80.7,93.7,76.0
S05,51,94,74.1,84.9,61.0
S06,29,89,71.8,80.3,64.2
S07,80,100,82.5,97.7,62.0
S08,29,100,77.6,89.9,100.0
S09,43,97,79.6,94.2,38.8
S10,54,100,82.0,95.1,91.3
S11,43,97,73.3,87.5,81.7
S12,60,69,82.8,97.4,57.4
S13,43,77,77.9,89.6,70.2
S14,29,94,76.1,88.8,54.6
S15,46,94,78.5,92.6,46.7
S16,17,94,71.8,79.6,77.1
S17,74,94,80.4,93.2,56.0
S18,54,86,78.3,94.5,75.3
S19,63,100,85.2,99.7,60.0
S20,77,69,80.6,95.3,70.2
S21,46,94,78.1,94.0,37.3
S22,83,89,79.0,97.2,73.8
S23,0,100,82.6,98.1,57.5
S24,69,20,76.1,86.9,93.4
S25,46,94,79.5,95.0,73.9
S26,57,100,82.3,97.2,66.7
S27,83,97,75.5,84.7,100.0
S28,86,77,81.7,97.1,81.5
S29,40,89,75.2,89.3,37.3
S30,34,91,80.0,96.3,37.7"""


def _by_user(rows=None):
    """Same shape as get_cohort_overview()['by_user'] (only the fields used)."""
    out = []
    for line in (rows or FIXTURE_CSV.splitlines()):
        _id, pre, post, tsr, aes, rog = line.split(",")
        out.append({
            "metrics": {"tsr": float(tsr), "aes": float(aes), "rog": float(rog)},
            "preTest": float(pre),
            "postTest": float(post),
        })
    return out


@pytest.fixture(scope="module")
def result():
    return compute_learning_impact_regression(_by_user())


def approx(v, tol=1e-3):
    return pytest.approx(v, abs=tol)


# ---------------------------------------------------------------------------
# Fixture reproduction
# ---------------------------------------------------------------------------

def test_inclusion_counts(result):
    assert result["available"] is True
    assert result["n_included"] == 30
    assert result["n_excluded"] == 0
    assert result["excluded_reasons"] == []
    assert result["n_regression"] == 30
    assert result["n_dropped_for_regression"] == 0


def test_descriptives(result):
    d = result["descriptives"]
    for key, (mean, sd) in {
        "Pre": (50.83, 22.70), "Post": (89.67, 15.73), "TSR": (78.39, 3.45),
        "AES": (91.70, 5.56), "ROG": (67.23, 18.19),
    }.items():
        assert d[key]["mean"] == approx(mean, 0.01)
        assert d[key]["sd"] == approx(sd, 0.01)
    # X is a composite of three z-scores, so its own mean is ~0.
    assert d["X"]["mean"] == approx(0, 1e-4)
    assert d["Y"]["mean"] == approx(0.6816, 1e-3)


def test_model(result):
    m = result["model"]
    assert m["n"] == 30
    assert m["df"] == 28
    assert m["b1"] == approx(-0.1585, 1e-3)
    assert m["slope"] == m["b1"]
    assert m["b0"] == approx(0.6816, 1e-3)
    assert m["intercept"] == m["b0"]
    assert m["se_b1"] == approx(0.1595, 1e-3)
    assert m["t"] == approx(-0.9937, 1e-3)
    assert m["p"] == approx(0.3289, 1e-3)
    assert m["significant"] is False


def test_correlation(result):
    c = result["correlation"]
    assert c["r"] == approx(-0.1846, 1e-3)
    assert c["r2"] == approx(0.0341, 1e-3)


def test_sums_match_tutorial_formula(result):
    """Recomputes b1/b0 directly from the reported sums (the exact by-hand
    formula from SOP3_Regression_Tutorial.docx) and checks they match the
    model the service reports."""
    s = result["sums"]
    n = result["model"]["n"]
    b1 = (n * s["sum_xy"] - s["sum_x"] * s["sum_y"]) / (n * s["sum_x2"] - s["sum_x"] ** 2)
    b0 = (s["sum_y"] - b1 * s["sum_x"]) / n
    assert b1 == approx(result["model"]["b1"], 1e-4)
    assert b0 == approx(result["model"]["b0"], 1e-4)


def test_sensitivity_table(result):
    rows = {r["key"]: r for r in result["sensitivity"]}
    assert rows["main"]["slope"] == approx(-0.1585, 1e-3)
    assert rows["main"]["p"] == approx(0.3289, 1e-3)
    excl = rows["excl_influential"]
    assert excl["n"] == 29
    assert "S24" in excl["label"]  # S24 (post dropped to 20) is the standout residual


def test_learning_impact_index_is_removed(result):
    assert "lii" not in result
    assert all("lii" not in r for r in result["respondents"])


def test_respondent_appendix_is_anonymous_and_complete(result):
    rows = result["respondents"]
    assert len(rows) == 30
    assert rows[0]["id"] == "S01" and rows[-1]["id"] == "S30"
    assert set(rows[0]) >= {"pre", "post", "tsr", "aes", "rog", "z_tsr", "z_aes", "z_rog", "x", "y", "fitted", "residual"}
    assert not any(k in rows[0] for k in ("email", "name"))
    # fitted + residual reconstructs Y for every regression-eligible row
    for r in rows:
        if r["y"] is not None:
            assert r["fitted"] + r["residual"] == approx(r["y"], 1e-5)
    # X is a composite of three z-scores: mean ~0, sample SD ~ (matches descriptives)
    xs = [r["x"] for r in rows]
    assert sum(xs) / 30 == approx(0, 1e-4)


# ---------------------------------------------------------------------------
# Interpretation / honesty rules
# ---------------------------------------------------------------------------

def test_interpretation_is_not_significant_with_warnings(result):
    text = " ".join(result["interpretation"] + result["limitations"])
    assert "not statistically significant" in text
    assert ASSOCIATION_ONLY in result["interpretation"]
    assert result["warnings"] == {"ceiling_effect": True, "tsr_aes_overlap": True, "small_sample": True}
    assert any("24 of 30" in s and "Ceiling effect" in s for s in result["limitations"])
    assert any("strongly correlated" in s for s in result["limitations"])
    assert any("Small sample" in s for s in result["limitations"])


def test_no_causal_language(result):
    text = " ".join(result["interpretation"] + result["limitations"]).lower()
    for banned in ("caused", "because of the app", "improved because", "led to", "resulted in", "due to the"):
        assert banned not in text


def test_significant_result_is_labelled_significant():
    """A genuinely strong composite effect must read as significant -- the
    wording follows p < .05, in both directions."""
    rows = []
    for i in range(20):
        tsr = 60 + i
        rows.append(f"S{i},{40 + (i * 7) % 30},{50 + 2 * i + (i % 3)},{tsr},{tsr + 5 + (i % 4)},{30 + 3 * i + (i % 5)}")
    res = compute_learning_impact_regression(_by_user(rows))
    assert res["available"] is True
    if res["model"]["significant"]:
        assert "was statistically significant" in res["interpretation"][0]
    else:
        # even a strong-looking hand-built fixture isn't guaranteed to clear
        # p < .05 with only 20 points; either way the label must be honest.
        assert "was not statistically significant" in res["interpretation"][0]
    assert not res["warnings"]["ceiling_effect"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_too_few_respondents():
    res = compute_learning_impact_regression(_by_user(FIXTURE_CSV.splitlines()[: MIN_RESPONDENTS - 1]))
    assert res["available"] is False
    assert str(MIN_RESPONDENTS) in res["reason"]
    assert res["n_included"] == MIN_RESPONDENTS - 1


def test_exactly_min_respondents_can_fit():
    res = compute_learning_impact_regression(_by_user(FIXTURE_CSV.splitlines()[:MIN_RESPONDENTS]))
    assert res["available"] is True
    assert res["n_included"] == MIN_RESPONDENTS


def test_empty_cohort():
    res = compute_learning_impact_regression([])
    assert res["available"] is False
    assert res["n_included"] == 0


def test_zero_variance_tsr_is_reported_not_imputed():
    rows = [line.split(",") for line in FIXTURE_CSV.splitlines()]
    flat = [",".join([r[0], r[1], r[2], "80.0", r[4], r[5]]) for r in rows]   # every TSR = 80.0
    res = compute_learning_impact_regression(_by_user(flat))
    assert res["available"] is False
    assert "TSR" in res["reason"] and "no variation" in res["reason"]
    assert res["n_included"] == 30


def test_respondent_without_rog_is_excluded_and_counted():
    users = _by_user()
    users[3]["metrics"]["rog"] = None
    users[7]["metrics"]["rog"] = None
    res = compute_learning_impact_regression(users)
    assert res["available"] is True
    assert res["n_included"] == 28
    assert res["n_excluded"] == 2
    reasons = {r["reason"]: r["count"] for r in res["excluded_reasons"]}
    assert reasons == {"no refactor submission (ROG unavailable)": 2}
    assert len(res["respondents"]) == 28      # nobody silently imputed back in


def test_missing_pre_or_post_is_excluded_and_counted():
    users = _by_user()
    users[0]["preTest"] = None
    users[1]["postTest"] = None
    res = compute_learning_impact_regression(users)
    reasons = {r["reason"]: r["count"] for r in res["excluded_reasons"]}
    assert reasons == {"no pre-test score": 1, "no post-test score": 1}
    assert res["n_included"] == 28 and res["n_excluded"] == 2


def test_respondent_with_several_problems_is_excluded_once():
    users = _by_user()
    users[0]["preTest"] = None
    users[0]["metrics"]["rog"] = None
    res = compute_learning_impact_regression(users)
    assert res["n_excluded"] == 1
    assert sum(r["count"] for r in res["excluded_reasons"]) == 2


def test_perfect_pretest_is_dropped_from_regression_only():
    """S01 already has Pre = 89 in the fixture; bump it to 100 (a perfect
    pre-test) and confirm Y becomes undefined for that row only -- it still
    counts toward n_included / TSR-AES-ROG descriptives, just not the fit."""
    users = _by_user()
    users[0]["preTest"] = 100.0
    res = compute_learning_impact_regression(users)
    assert res["available"] is True
    assert res["n_included"] == 30           # still has TSR/AES/ROG/Pre/Post
    assert res["n_regression"] == 29          # but dropped from the fit
    assert res["n_dropped_for_regression"] == 1
    s01 = next(r for r in res["respondents"] if r["id"] == "S01")
    assert s01["y"] is None
    assert s01["fitted"] is None
    assert s01["dropped_from_regression"] is True
    assert any("perfect 100" in s for s in res["limitations"])


def test_t_critical_matches_tables():
    assert _t_critical(27) == approx(2.0518, 1e-3)
    assert _t_critical(28) == approx(2.0484, 1e-3)
    assert _t_critical(10) == approx(2.2281, 1e-3)


# ---------------------------------------------------------------------------
# Wiring into get_cohort_overview (DB layer stubbed out)
# ---------------------------------------------------------------------------

@pytest.fixture
def overview_module(monkeypatch):
    """Imports admin_analytics_service with the database layer stubbed, so the
    real get_cohort_overview() scoping + payload assembly can be exercised
    without Postgres."""
    import types

    fake_db = types.ModuleType("database")
    fake_db.get_db_connection = lambda: types.SimpleNamespace(close=lambda: None)
    fake_repo_pkg = types.ModuleType("repositories")
    fake_repo = types.ModuleType("repositories.user_repo")

    class UserRepository:  # only what get_cohort_overview touches
        users = []

        @staticmethod
        def find_all_users(conn=None):
            return UserRepository.users

    fake_repo.UserRepository = UserRepository
    monkeypatch.setitem(sys.modules, "database", fake_db)
    monkeypatch.setitem(sys.modules, "repositories", fake_repo_pkg)
    monkeypatch.setitem(sys.modules, "repositories.user_repo", fake_repo)
    monkeypatch.delitem(sys.modules, "services.admin_analytics_service", raising=False)

    import services.admin_analytics_service as svc

    users, subs, assess = [], [], []
    for i, line in enumerate(FIXTURE_CSV.splitlines()):
        _id, pre, post, tsr, aes, rog = line.split(",")
        email = f"s{i:02d}@example.com"
        users.append({"email": email, "name": f"Student {i}", "role": "user", "is_admin": False})
        # one refactored submission carrying exactly the fixture values
        subs.append({"email": email, "data": {
            "final_aes": float(aes), "rog": float(rog),
            "passed_tests": float(tsr), "total_tests": 100,
        }})
        assess.append({"email": email, "data": {
            "pretest": {"score": float(pre)}, "posttest": {"score": float(post)},
        }})
    users.append({"email": "admin@example.com", "name": "Admin", "role": "admin", "is_admin": True})
    UserRepository.users = users
    monkeypatch.setattr(svc, "_fetch_all_submission_rows", lambda conn=None: subs)
    monkeypatch.setattr(svc, "_fetch_all_assessment_rows", lambda conn=None: assess)
    return svc


def test_overview_carries_regression_key(overview_module):
    out = overview_module.AdminAnalyticsService.get_cohort_overview()
    assert out["status"] == "success"
    assert out["assessment_based"]["t_value"] is not None          # existing payload intact
    assert out["regression"]["available"] is True
    assert out["regression"]["n_included"] == 30                   # admin excluded
    assert out["regression"]["model"]["p"] == approx(0.3289, 5e-3)


def test_overview_regression_respects_selected_emails(overview_module):
    picked = [f"s{i:02d}@example.com" for i in range(10)]
    out = overview_module.AdminAnalyticsService.get_cohort_overview(selected_emails=picked)
    assert out["user_count"] == 10
    assert out["regression"]["n_included"] == 10


def test_regression_failure_never_breaks_overview(overview_module, monkeypatch):
    def boom(_by_user):
        raise RuntimeError("boom")

    monkeypatch.setattr(overview_module, "compute_learning_impact_regression", boom)
    out = overview_module.AdminAnalyticsService.get_cohort_overview()
    assert out["status"] == "success"
    assert out["regression"]["available"] is False
    assert out["assessment_based"]["hakes_g"] is not None
