"""
test_rog_optimization_only.py
=============================
ROG (Refactoring Optimization Gain) is defined ONLY for optimization
activities. Regular activities feed TSR and AES; they must never feed ROG,
even when an older build stored a non-null `rog` on them (e.g. Module 0,
which has no optimization activities, used to report +98 ROG).

Run:  pytest tests/test_rog_optimization_only.py -v
No database needed: `database` / `user_repo` are stubbed before import.
"""
import os
import sys
import types

API_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api"))
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

# admin_analytics_service imports DB plumbing at module load; the functions
# under test are pure, so stub those imports out.
if "database" not in sys.modules:
    _db = types.ModuleType("database")
    _db.get_db_connection = lambda *a, **k: None
    sys.modules["database"] = _db
try:
    import repositories.user_repo  # noqa: F401
except Exception:  # pragma: no cover
    _repo_pkg = types.ModuleType("repositories")
    _repo_mod = types.ModuleType("repositories.user_repo")
    _repo_mod.UserRepository = object
    _repo_pkg.user_repo = _repo_mod
    sys.modules["repositories"] = _repo_pkg
    sys.modules["repositories.user_repo"] = _repo_mod

from services import admin_analytics_service as svc  # noqa: E402


def _sub(type_, rog, final_aes=100, module="m0", status="passed"):
    return {
        "moduleId": module, "activityId": f"{module}_a", "type": type_,
        "status": status, "final_aes": final_aes, "rog": rog,
        "passed_tests": 5, "total_tests": 5,
    }


def test_regular_activity_rog_is_never_counted():
    m = svc._submission_metrics([_sub("activity", 100), _sub("activity", 62)])
    assert m["rog"] is None
    assert m["rog_refactored_count"] == 0
    # ...but TSR / AES still come from regular activities
    assert m["aes"] == 100
    assert m["tsr"] == 100.0


def test_only_optimization_submissions_feed_rog():
    m = svc._submission_metrics([
        _sub("activity", 100),          # excluded (regular)
        _sub("optimization", 40),       # counted
        _sub("optimization", 60),       # counted
        _sub("optimization", 0),        # unchanged starter -> not a gain
        _sub("optimization", None, final_aes=None),  # never evaluated
    ])
    assert m["rog"] == 50.0
    assert m["rog_refactored_count"] == 2


def test_missing_type_is_treated_as_regular_activity():
    m = svc._submission_metrics([{"final_aes": 90, "rog": 50}])
    assert m["rog"] is None and m["rog_refactored_count"] == 0


def test_module_without_optimization_has_no_rog():
    by_module = svc._group_by_module([
        _sub("activity", 100, module="module-0"),
        _sub("activity", 100, module="module-0"),
        _sub("optimization", 30, module="module-1"),
    ])
    assert by_module["module-0"]["rog"] is None
    assert by_module["module-1"]["rog"] == 30.0


def test_raw_rows_and_details_blank_out_regular_rog():
    reg, opt = _sub("activity", 100), _sub("optimization", 45)
    assert svc._submission_raw_row("S01", reg)["rog"] is None
    assert svc._submission_raw_row("S01", opt)["rog"] == 45
    details = {d["type"]: d["rog"] for d in svc._submission_details([reg, opt])}
    assert details["activity"] is None
    assert details["optimization"] == 45
