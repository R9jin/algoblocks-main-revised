# api/services/analyzer_diagnostics_service.py
"""
Thin service wrapper around analyzer_diagnostics.regression_check.

Running the full check takes a few seconds (it analyzes ~270 code
samples), so this caches the last result in-process for a short window --
long enough that an admin refreshing the page or clicking around doesn't
re-trigger a full run each time, short enough that "Run Regression Check"
still means something when clicked deliberately.

Note: this cache is per Vercel serverless instance and resets on cold
start, which is fine -- it's a convenience, not a correctness requirement.
"""
import time
from typing import Any, Dict, Optional

from analyzer_diagnostics.regression_check import run_regression_check

_CACHE_TTL_SECONDS = 30
_cache: Dict[str, Any] = {"result": None, "computed_at": 0.0}


class AnalyzerDiagnosticsService:
    @staticmethod
    def get_regression_report(force_refresh: bool = False) -> Dict[str, Any]:
        now = time.monotonic()
        cached = _cache["result"]
        is_fresh = cached is not None and (now - _cache["computed_at"]) < _CACHE_TTL_SECONDS

        if cached is not None and is_fresh and not force_refresh:
            report = dict(cached)
            report["cached"] = True
            return report

        report = run_regression_check()
        _cache["result"] = report
        _cache["computed_at"] = now

        report = dict(report)
        report["cached"] = False
        return report
