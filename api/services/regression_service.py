# api/services/regression_service.py
"""
Simple one-predictor regression -- the "Learning Impact Model" for SOP 3.

This is deliberately the small model the adviser asked for in the
consultation, NOT a hierarchical / multi-predictor design:

  X (independent variable) = "System Interaction"
      TSR, AES, and ROG are each standardized (z-score, sample SD, n - 1)
      across every included respondent, then the three z-scores are
      averaged into one composite per respondent.

  Y (dependent variable) = "Normalized Learning Gain" (Hake's g)
      Y_i = (Post_i - Pre_i) / (100 - Pre_i)
      Undefined when Pre_i = 100 (a perfect pre-test score); that
      respondent's row is dropped from the regression only, and the drop
      is reported, not silently absorbed.

  Model: Y = b0 + b1 * X, fit with the elementary running-sums formula
  (n, SigmaX, SigmaY, SigmaXY, SigmaX^2) -- the same one used by hand in
  the SOP 3 tutorial, so the JSON payload and a by-hand check always land
  on the same numbers.

Phases of the study (kept only as a static legend for the UI/report; the
model itself no longer needs the phase structure to explain itself):
  1 = pre-test
  2 = in-app interaction (the treatment; not scored)
  3 = in-app performance (TSR, AES, ROG) -- this is where X comes from
  4 = post-test -- this is where Y comes from

Unit of analysis: ONE ROW PER RESPONDENT (per-student means already
produced by AdminAnalyticsService.get_cohort_overview -> by_user), never
per submission.

Pure Python. numpy/scipy/statsmodels are deliberately NOT used: this runs
on a serverless function where bundle size matters, and the p-value
machinery already exists in stats_utils (regularized incomplete beta).

This module reports what the data says and nothing else. There is no
option to drop cases from the main model; case exclusion exists only as
one clearly labelled row of the sensitivity table.
"""

import math
from typing import Any, Dict, List, Optional

from services.stats_utils import _t_two_tailed_p

MIN_RESPONDENTS = 8
ALPHA = 0.05
CEILING_SCORE = 89.0          # post-test >= this counts toward the ceiling check
CEILING_SHARE = 0.80          # ...and >= 80% of respondents there => ceiling warning
SMALL_SAMPLE_N = 50
OVERLAP_R = 0.80              # |r(TSR, AES)| above this => overlap warning

ASSOCIATION_ONLY = "Regression shows association only; there is no control group."

PHASES = [
    {"phase": 1, "label": "Pre-test"},
    {"phase": 2, "label": "In-app interaction (treatment, not scored)"},
    {"phase": 3, "label": "In-app performance (TSR, AES, ROG) -- source of X"},
    {"phase": 4, "label": "Post-test -- source of Y"},
]

# Per-respondent number rounding for the payload. Six decimals is far below
# any reported precision but keeps the JSON small and stable.
_ROUND = 6


class _Unavailable(Exception):
    """Raised inside the math when the model can't be fitted for a stated reason."""


# ---------------------------------------------------------------------------
# Small numeric helpers
# ---------------------------------------------------------------------------

def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs)


def _sample_sd(xs: List[float]) -> float:
    n = len(xs)
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def _zscores(xs: List[float], label: str) -> List[float]:
    """z = (x - mean) / sd with the SAMPLE sd (n-1). A constant column has no
    scale to standardize by, so that is reported rather than papered over."""
    sd = _sample_sd(xs)
    if sd == 0 or not math.isfinite(sd):
        raise _Unavailable(f"{label} has no variation (every respondent has the same value), so it cannot be standardized.")
    m = _mean(xs)
    return [(x - m) / sd for x in xs]


def _t_critical(df: int, alpha: float = ALPHA) -> float:
    """Two-tailed t critical value by bisection on the existing two-tailed p
    (p falls as |t| grows), so no inverse-t implementation is needed."""
    lo, hi = 0.0, 1000.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        p = _t_two_tailed_p(mid, df)
        if p is None:
            break
        if p > alpha:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def _fmt_p(p: Optional[float]) -> str:
    if p is None:
        return "p = n/a"
    if p < 0.001:
        return "p < .001"
    return "p = " + _fmt_r2(p)


def _fmt_r2(v: float) -> str:
    """APA style (no leading zero) for quantities bounded by 1, sign kept."""
    text = f"{v:.3f}"
    return text.replace("0.", ".", 1) if abs(v) < 1 else text


# ---------------------------------------------------------------------------
# Simple linear regression by running sums -- Y = b0 + b1 * X
# ---------------------------------------------------------------------------

def _simple_regression(xs: List[float], ys: List[float]) -> Dict[str, Any]:
    """
    Ordinary least squares for ONE predictor, fit exactly the way the SOP 3
    tutorial does it by hand: build the four running sums, then plug them
    into the b1/b0/r formulas. No matrix algebra.
    """
    n = len(xs)
    df = n - 2
    if df < 1:
        raise _Unavailable("Not enough respondents with a usable pre-test score to fit the regression (need at least 3).")

    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)
    sum_y2 = sum(y * y for y in ys)

    denom = n * sum_x2 - sum_x ** 2
    if denom == 0:
        raise _Unavailable("X (the System Interaction composite) has no variation, so the regression cannot be fitted.")

    b1 = (n * sum_xy - sum_x * sum_y) / denom
    b0 = (sum_y - b1 * sum_x) / n

    fitted = [b0 + b1 * x for x in xs]
    resid = [y - f for y, f in zip(ys, fitted)]
    sse = sum(e * e for e in resid)
    my = _mean(ys)
    sst = sum((y - my) ** 2 for y in ys)
    if sst == 0:
        raise _Unavailable("Y (normalized learning gain) has no variation, so the regression cannot be fitted.")

    r2 = 1.0 - sse / sst
    r_denom = math.sqrt(max(denom * (n * sum_y2 - sum_y ** 2), 0.0))
    r = (n * sum_xy - sum_x * sum_y) / r_denom if r_denom > 0 else None

    s2 = sse / df
    sxx = sum_x2 - (sum_x ** 2) / n
    se_b1 = math.sqrt(s2 / sxx) if sxx > 0 else None
    t = (b1 / se_b1) if se_b1 else None
    p = _t_two_tailed_p(t, df) if t is not None else None
    t_crit = _t_critical(df)
    ci_low = b1 - t_crit * se_b1 if se_b1 else None
    ci_high = b1 + t_crit * se_b1 if se_b1 else None

    return {
        "n": n, "df": df,
        "sums": {"sum_x": sum_x, "sum_y": sum_y, "sum_xy": sum_xy, "sum_x2": sum_x2, "sum_y2": sum_y2},
        "b0": b0, "b1": b1,
        "se_b1": se_b1, "t": t, "p": p, "ci_low": ci_low, "ci_high": ci_high,
        "r": r, "r2": r2,
        "significant": bool(p is not None and p < ALPHA),
        "fitted": fitted, "residuals": resid,
    }


# ---------------------------------------------------------------------------
# Core pipeline: raw rows -> z-scores -> X (composite) -> Y (normalized gain)
# ---------------------------------------------------------------------------

def _fit_pipeline(rows: List[Dict[str, float]]) -> Dict[str, Any]:
    """
    rows: every respondent with complete pre/post/tsr/aes/rog (the listwise
    'included' set). Standardization for X uses ALL of these rows -- the
    normalization step doesn't care whether Y is defined for a given row.
    Y (and therefore the regression itself) is computed only for the subset
    whose pre-test isn't a perfect 100.
    """
    tsr = [r["tsr"] for r in rows]
    aes = [r["aes"] for r in rows]
    rog = [r["rog"] for r in rows]

    z_tsr = _zscores(tsr, "TSR")
    z_aes = _zscores(aes, "AES")
    z_rog = _zscores(rog, "ROG")
    x_all = [(a + b + c) / 3.0 for a, b, c in zip(z_tsr, z_aes, z_rog)]

    reg_idx = [i for i, r in enumerate(rows) if r["pre"] != 100]
    dropped_idx = [i for i, r in enumerate(rows) if r["pre"] == 100]

    if len(reg_idx) < 3:
        raise _Unavailable(
            "Fewer than 3 respondents have a usable (non-perfect) pre-test score, "
            "so the normalized gain (Y) can't be regressed."
        )

    x_reg = [x_all[i] for i in reg_idx]
    y_reg = [(rows[i]["post"] - rows[i]["pre"]) / (100 - rows[i]["pre"]) for i in reg_idx]

    fit = _simple_regression(x_reg, y_reg)

    fitted_full: List[Optional[float]] = [None] * len(rows)
    residual_full: List[Optional[float]] = [None] * len(rows)
    y_full: List[Optional[float]] = [None] * len(rows)
    for pos, i in enumerate(reg_idx):
        y_full[i] = y_reg[pos]
        fitted_full[i] = fit["fitted"][pos]
        residual_full[i] = fit["residuals"][pos]

    return {
        "z_tsr": z_tsr, "z_aes": z_aes, "z_rog": z_rog,
        "x": x_all, "y": y_full,
        "fitted": fitted_full, "residual": residual_full,
        "reg_idx": reg_idx, "dropped_idx": dropped_idx,
        "fit": fit,
    }


def _sensitivity_row(key: str, label: str, x: List[float], y: List[float]) -> Dict[str, Any]:
    try:
        fit = _simple_regression(x, y)
        return {
            "key": key, "label": label, "n": fit["n"],
            "slope": fit["b1"], "p": fit["p"], "r2": fit["r2"],
        }
    except _Unavailable as exc:
        return {"key": key, "label": label, "n": len(x), "unavailable": str(exc)}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def _round_tree(obj: Any) -> Any:
    if isinstance(obj, float):
        return round(obj, _ROUND) if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _round_tree(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_tree(v) for v in obj]
    return obj


def compute_learning_impact_regression(by_user: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds the whole `regression` payload from the cohort's `by_user` list.

    Never raises for data reasons: anything that prevents a fit comes back as
    {"available": False, "reason": ...} plus the inclusion counts, so the UI
    can say plainly why there is no model.
    """
    # -- 1. listwise inclusion -------------------------------------------------
    included: List[Dict[str, float]] = []
    reason_counts: Dict[str, int] = {}

    def note(reason: str) -> None:
        reason_counts[reason] = reason_counts.get(reason, 0) + 1

    for u in by_user or []:
        metrics = u.get("metrics") or {}
        pre = _num(u.get("preTest"))
        post = _num(u.get("postTest"))
        tsr = _num(metrics.get("tsr"))
        aes = _num(metrics.get("aes"))
        rog = _num(metrics.get("rog"))

        # Every reason that applies is counted, so one respondent can appear
        # under more than one reason; n_excluded counts respondents once.
        problems = []
        if pre is None:
            problems.append("no pre-test score")
        if post is None:
            problems.append("no post-test score")
        if tsr is None or aes is None:
            problems.append("no scored submissions (TSR/AES unavailable)")
        if rog is None:
            problems.append("no refactor submission (ROG unavailable)")
        if problems:
            for reason in problems:
                note(reason)
            continue
        included.append({"pre": pre, "post": post, "tsr": tsr, "aes": aes, "rog": rog})

    total = len(by_user or [])
    n = len(included)
    base = {
        "n_included": n,
        "n_excluded": total - n,
        "excluded_reasons": [{"reason": r, "count": c} for r, c in sorted(reason_counts.items())],
    }

    if n < MIN_RESPONDENTS:
        return {
            "available": False,
            "reason": (
                f"Only {n} respondent(s) have a pre-test, post-test, TSR, AES and ROG. "
                f"At least {MIN_RESPONDENTS} are needed to fit the regression."
            ),
            **base,
        }

    try:
        return {"available": True, **base, **_build_payload(included)}
    except _Unavailable as exc:
        return {"available": False, "reason": str(exc), **base}


def _build_payload(rows: List[Dict[str, float]]) -> Dict[str, Any]:
    n = len(rows)
    pipe = _fit_pipeline(rows)
    fit = pipe["fit"]
    ids = [f"S{i + 1:02d}" for i in range(n)]

    # -- descriptives ------------------------------------------------------------
    series = {
        "TSR": [r["tsr"] for r in rows],
        "AES": [r["aes"] for r in rows],
        "ROG": [r["rog"] for r in rows],
        "Pre": [r["pre"] for r in rows],
        "Post": [r["post"] for r in rows],
    }
    descriptives = {k: {"mean": _mean(v), "sd": _sample_sd(v)} for k, v in series.items()}
    descriptives["X"] = {"mean": _mean(pipe["x"]), "sd": _sample_sd(pipe["x"])}
    y_values = [v for v in pipe["y"] if v is not None]
    descriptives["Y"] = {"mean": _mean(y_values), "sd": _sample_sd(y_values)}

    # TSR/AES overlap check reuses a plain Pearson correlation (only place a
    # correlation is needed now that there is no full correlation matrix).
    def _pearson(xs: List[float], ys: List[float]) -> Optional[float]:
        mx, my = _mean(xs), _mean(ys)
        sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
        sxx = sum((a - mx) ** 2 for a in xs)
        syy = sum((b - my) ** 2 for b in ys)
        return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else None

    r_tsr_aes = _pearson(series["TSR"], series["AES"])

    # -- sensitivity: main vs excluding the largest-residual respondent -----------
    reg_idx = pipe["reg_idx"]
    x_reg = [pipe["x"][i] for i in reg_idx]
    y_reg = [pipe["y"][i] for i in reg_idx]
    abs_resid = [abs(e) for e in fit["residuals"]]
    top_pos = max(range(len(abs_resid)), key=lambda i: abs_resid[i])
    top_idx = reg_idx[top_pos]
    excl_label = f"Main model excluding largest-residual respondent ({ids[top_idx]})"
    x_wo = x_reg[:top_pos] + x_reg[top_pos + 1:]
    y_wo = y_reg[:top_pos] + y_reg[top_pos + 1:]
    # ROG alone, same respondents/rows as the main model (reg_idx), as its own
    # single-predictor check -- the composite model above averages TSR, AES,
    # and ROG into one X, which dilutes ROG's own relationship to Y with two
    # other predictors. Reported here so "how well does ROG alone predict
    # gain" has a real, visible number in the report instead of only living
    # inside the 3-variable composite.
    z_rog_reg = [pipe["z_rog"][i] for i in reg_idx]
    sensitivity = [
        {"key": "main", "label": "Main model (X = TSR, AES, ROG composite)", "n": fit["n"], "slope": fit["b1"], "p": fit["p"], "r2": fit["r2"]},
        _sensitivity_row("excl_influential", excl_label, x_wo, y_wo),
        _sensitivity_row("rog_only", "ROG alone (single predictor, not the TSR/AES/ROG composite)", z_rog_reg, y_reg),
    ]

    # -- Learning Impact Index (descriptive only) ----------------------------------------
    lii = [(r["tsr"] + r["aes"] + r["rog"] + r["post"]) / 4.0 for r in rows]

    # -- per-respondent appendix (anonymized) ------------------------------------------------
    respondents = []
    for i, r in enumerate(rows):
        respondents.append({
            "id": ids[i],
            "pre": r["pre"], "post": r["post"], "tsr": r["tsr"], "aes": r["aes"], "rog": r["rog"],
            "z_tsr": pipe["z_tsr"][i], "z_aes": pipe["z_aes"][i], "z_rog": pipe["z_rog"][i],
            "x": pipe["x"][i], "y": pipe["y"][i],
            "fitted": pipe["fitted"][i], "residual": pipe["residual"][i],
            "dropped_from_regression": i in pipe["dropped_idx"],
            "lii": lii[i],
        })

    # -- deterministic interpretation ----------------------------------------------------------
    high_post = sum(1 for r in rows if r["post"] >= CEILING_SCORE)
    ceiling = high_post / n >= CEILING_SHARE
    overlap = r_tsr_aes is not None and abs(r_tsr_aes) > OVERLAP_R

    def verdict(p: Optional[float]) -> str:
        return "statistically significant" if p is not None and p < ALPHA else "not statistically significant"

    line1 = (
        f"The System Interaction composite (X, from TSR, AES, and ROG) was {verdict(fit['p'])} as a predictor "
        f"of normalized learning gain (Y): b1 = {fit['b1']:.3f} ({_fmt_p(fit['p'])})"
        + (f", t({fit['df']}) = {fit['t']:.3f}" if fit["t"] is not None else "")
        + (f", r = {fit['r']:.3f}" if fit["r"] is not None else "")
        + "."
    )
    line2 = (
        f"The regression line is Y = {fit['b0']:.3f} + ({fit['b1']:.3f})X, and X explains "
        f"{_fmt_r2(fit['r2'])} of the variance in normalized gain (R\u00b2 = {_fmt_r2(fit['r2'])})."
    )
    interpretation = [line1, line2, ASSOCIATION_ONLY]

    limitations = []
    if n < SMALL_SAMPLE_N:
        limitations.append(f"Small sample (n = {n}): limited power, so only large effects are likely to reach significance.")
    if ceiling:
        limitations.append(
            f"Ceiling effect: {high_post} of {n} post-test scores are {CEILING_SCORE:.0f} or higher, "
            "so there is little post-test variation left to explain."
        )
    if overlap:
        limitations.append(
            f"TSR and AES are strongly correlated (r = {r_tsr_aes:.2f}), so within the X composite they carry "
            "overlapping, not fully independent, information."
        )
    if pipe["dropped_idx"]:
        dropped_ids = ", ".join(ids[i] for i in pipe["dropped_idx"])
        limitations.append(
            f"{len(pipe['dropped_idx'])} respondent(s) ({dropped_ids}) scored a perfect 100 on the pre-test, "
            "making normalized gain undefined; they are excluded from the regression only (still shown in the "
            "appendix and in TSR/AES/ROG descriptives)."
        )

    return _round_tree({
        "phases": PHASES,
        "method": {
            "x_definition": "X = average(z_TSR, z_AES, z_ROG) -- \"System Interaction\" composite",
            "y_definition": "Y = (Post - Pre) / (100 - Pre) -- normalized learning gain (Hake's g)",
            "normalization": "z-scores with sample SD (n-1), each metric standardized separately across all included respondents",
            "model_equation": "Y = b0 + b1 * X",
        },
        "descriptives": descriptives,
        "n_regression": fit["n"],
        "n_dropped_for_regression": len(pipe["dropped_idx"]),
        "model": {
            "n": fit["n"], "df": fit["df"],
            "b0": fit["b0"], "b1": fit["b1"],
            "intercept": fit["b0"], "slope": fit["b1"],
            "se_b1": fit["se_b1"], "t": fit["t"], "p": fit["p"],
            "ci_low": fit["ci_low"], "ci_high": fit["ci_high"],
            "significant": fit["significant"],
        },
        "correlation": {"r": fit["r"], "r2": fit["r2"]},
        "sums": fit["sums"],
        "sensitivity": sensitivity,
        "lii": {
            "label": "Learning Impact Index (proposed - pending adviser approval)",
            "formula": "LII = (TSR + AES + ROG + Post-test) / 4, raw 0-100 scale",
            "mean": _mean(lii),
            "sd": _sample_sd(lii),
            "min": min(lii),
            "max": max(lii),
        },
        "respondents": respondents,
        "interpretation": interpretation,
        "limitations": limitations,
        "warnings": {
            "ceiling_effect": ceiling,
            "tsr_aes_overlap": overlap,
            "small_sample": n < SMALL_SAMPLE_N,
        },
    })
