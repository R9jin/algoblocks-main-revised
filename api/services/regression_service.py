# api/services/regression_service.py
"""
Phased (hierarchical) regression -- the "Learning Impact Model" for SOP 3.

Phases of the study
  1 = pre-test
  2 = in-app interaction (the treatment; not scored, so not in the model)
  3 = in-app performance (TSR, AES, ROG)
  4 = post-test

Unit of analysis: ONE ROW PER RESPONDENT (per-student means already produced
by AdminAnalyticsService.get_cohort_overview -> by_user), never per submission.

Model steps (all on z-scored variables, sample SD n-1):
  Model 1:  z_Post = b0 + b1 * z_Pre + e
  Model 2:  z_Post = b0 + b1 * z_Pre + b2 * P3 + e
  where P3 = z( mean(z_TSR, z_AES, z_ROG) ).

Everything here is pure Python. numpy/scipy/statsmodels are deliberately NOT
used: this runs on a serverless function where bundle size matters, and the
p-value machinery already exists in stats_utils (regularized incomplete beta).

This module reports what the data says and nothing else. There is no option to
drop cases from the main model; case exclusion exists only as one clearly
labelled row of the sensitivity table.
"""

import math
from typing import Any, Dict, List, Optional, Tuple

from services.stats_utils import _betai, _t_two_tailed_p

MIN_RESPONDENTS = 8
ALPHA = 0.05
CEILING_SCORE = 89.0          # post-test >= this counts toward the ceiling check
CEILING_SHARE = 0.80          # ...and >= 80% of respondents there => ceiling warning
SMALL_SAMPLE_N = 50
OVERLAP_R = 0.80              # |r(TSR, AES)| above this => overlap warning

ASSOCIATION_ONLY = "Regression shows association only; there is no control group."

# Per-respondent number rounding for the payload. Six decimals is far below any
# reported precision but keeps the JSON small and stable.
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


def _pearson(xs: List[float], ys: List[float]) -> float:
    mx, my = _mean(xs), _mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        raise _Unavailable("A variable has no variation, so a correlation cannot be computed.")
    return sxy / math.sqrt(sxx * syy)


def _invert(matrix: List[List[float]]) -> List[List[float]]:
    """Gauss-Jordan inverse with partial pivoting."""
    k = len(matrix)
    a = [list(row) + [1.0 if i == j else 0.0 for j in range(k)] for i, row in enumerate(matrix)]
    for col in range(k):
        pivot = max(range(col, k), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            raise _Unavailable("The predictors are perfectly collinear, so the model cannot be estimated.")
        a[col], a[pivot] = a[pivot], a[col]
        p = a[col][col]
        a[col] = [v / p for v in a[col]]
        for r in range(k):
            if r != col:
                f = a[r][col]
                if f:
                    a[r] = [rv - f * cv for rv, cv in zip(a[r], a[col])]
    return [row[k:] for row in a]


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


def _f_p_value(f: float, df1: int, df2: int) -> Optional[float]:
    if f is None or df1 <= 0 or df2 <= 0 or f < 0:
        return None
    return _betai(df2 / 2.0, df1 / 2.0, df2 / (df2 + df1 * f))


# ---------------------------------------------------------------------------
# OLS (general k predictors, with intercept)
# ---------------------------------------------------------------------------

def _ols(y: List[float], predictors: List[List[float]], names: List[str]) -> Dict[str, Any]:
    n = len(y)
    k = len(predictors)
    df2 = n - k - 1
    if df2 < 1:
        raise _Unavailable("Not enough respondents for the number of predictors.")

    rows = [[1.0] + [predictors[j][i] for j in range(k)] for i in range(n)]
    p = k + 1
    xtx = [[sum(rows[i][a] * rows[i][b] for i in range(n)) for b in range(p)] for a in range(p)]
    xty = [sum(rows[i][a] * y[i] for i in range(n)) for a in range(p)]
    inv = _invert(xtx)
    coef = [sum(inv[a][b] * xty[b] for b in range(p)) for a in range(p)]

    fitted = [sum(coef[a] * rows[i][a] for a in range(p)) for i in range(n)]
    resid = [y[i] - fitted[i] for i in range(n)]
    sse = sum(e * e for e in resid)
    my = _mean(y)
    sst = sum((v - my) ** 2 for v in y)
    if sst == 0:
        raise _Unavailable("The outcome has no variation.")

    s2 = sse / df2
    r2 = 1.0 - sse / sst
    adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / df2
    f_stat = (r2 / k) / ((1.0 - r2) / df2) if r2 < 1.0 else float("inf")
    f_p = _f_p_value(f_stat, k, df2) if math.isfinite(f_stat) else 0.0

    t_crit = _t_critical(df2)
    coefficients = []
    for a, name in enumerate(["intercept"] + names):
        se = math.sqrt(max(s2 * inv[a][a], 0.0))
        t = coef[a] / se if se > 0 else None
        pv = _t_two_tailed_p(t, df2) if t is not None else None
        coefficients.append({
            "name": name,
            "beta": coef[a],
            "se": se,
            "t": t,
            "p": pv,
            "ci_low": coef[a] - t_crit * se,
            "ci_high": coef[a] + t_crit * se,
        })

    # Leverage h_ii = x_i' (X'X)^-1 x_i, needed for Cook's D / studentized residuals.
    leverage = [
        sum(rows[i][a] * sum(inv[a][b] * rows[i][b] for b in range(p)) for a in range(p))
        for i in range(n)
    ]

    return {
        "n": n, "k": k, "df1": k, "df2": df2,
        "coefficients": coefficients,
        "r2": r2, "adj_r2": adj_r2,
        "f": f_stat, "f_p": f_p,
        "sse": sse, "s2": s2,
        "fitted": fitted, "residuals": resid, "leverage": leverage,
        "n_params": p,
    }


def _model_summary(fit: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "n": fit["n"],
        "predictors": [c["name"] for c in fit["coefficients"][1:]],
        "coefficients": fit["coefficients"],
        "r2": fit["r2"],
        "adj_r2": fit["adj_r2"],
        "f": fit["f"],
        "df1": fit["df1"],
        "df2": fit["df2"],
        "p": fit["f_p"],
        "significant": bool(fit["f_p"] is not None and fit["f_p"] < ALPHA),
    }


def _coef(fit: Dict[str, Any], name: str) -> Dict[str, Any]:
    return next(c for c in fit["coefficients"] if c["name"] == name)


# ---------------------------------------------------------------------------
# Core pipeline: raw rows -> z-scores -> P3 -> Model 1 / Model 2
# ---------------------------------------------------------------------------

def _composite(components: List[List[float]]) -> Tuple[List[float], List[float]]:
    """mean of the component z-scores, then z-scored again (sample SD)."""
    n = len(components[0])
    raw = [_mean([c[i] for c in components]) for i in range(n)]
    return raw, _zscores(raw, "The Phase 3 composite")


def _fit_pipeline(rows: List[Dict[str, float]], variant: str = "main") -> Dict[str, Any]:
    """Runs the full standardize -> composite -> Model 1 / Model 2 chain.

    variant:
      main      P3 from TSR, AES, ROG
      no_aes    P3 from TSR, ROG (AES contains TSR, so this drops the overlap)
      eff       P3 from TSR, Efficiency (= AES / TSR), ROG
    """
    pre = [r["pre"] for r in rows]
    post = [r["post"] for r in rows]
    tsr = [r["tsr"] for r in rows]
    aes = [r["aes"] for r in rows]
    rog = [r["rog"] for r in rows]

    z_pre = _zscores(pre, "Pre-test")
    z_post = _zscores(post, "Post-test")
    z_tsr = _zscores(tsr, "TSR")
    z_aes = _zscores(aes, "AES")
    z_rog = _zscores(rog, "ROG")

    if variant == "main":
        components = [z_tsr, z_aes, z_rog]
    elif variant == "no_aes":
        components = [z_tsr, z_rog]
    elif variant == "eff":
        # A respondent with TSR = 0 would make the ratio undefined; TSR is a
        # mean of pass rates so that is not expected, but never divide blindly.
        if any(t == 0 for t in tsr):
            raise _Unavailable("Efficiency (AES / TSR) is undefined when TSR is 0.")
        z_eff = _zscores([a / t for a, t in zip(aes, tsr)], "Efficiency (AES / TSR)")
        components = [z_tsr, z_eff, z_rog]
    else:  # pragma: no cover - internal misuse
        raise ValueError(variant)

    p3_raw, p3 = _composite(components)
    m1 = _ols(z_post, [z_pre], ["z_Pre"])
    m2 = _ols(z_post, [z_pre, p3], ["z_Pre", "P3"])
    return {
        "z_pre": z_pre, "z_post": z_post, "z_tsr": z_tsr, "z_aes": z_aes, "z_rog": z_rog,
        "p3_raw": p3_raw, "p3": p3, "m1": m1, "m2": m2,
    }


def _skew_kurt(resid: List[float]) -> Tuple[float, float]:
    n = len(resid)
    m = _mean(resid)
    m2 = sum((e - m) ** 2 for e in resid) / n
    if m2 == 0:
        return 0.0, 0.0
    m3 = sum((e - m) ** 3 for e in resid) / n
    m4 = sum((e - m) ** 4 for e in resid) / n
    return m3 / m2 ** 1.5, m4 / m2 ** 2 - 3.0


def _cooks_distance(fit: Dict[str, Any]) -> List[float]:
    p = fit["n_params"]
    s2 = fit["s2"]
    out = []
    for e, h in zip(fit["residuals"], fit["leverage"]):
        denom = p * s2 * (1.0 - h) ** 2
        out.append((e * e * h) / denom if denom > 0 else 0.0)
    return out


def _sensitivity_row(key: str, label: str, run: Dict[str, Any], n: int) -> Dict[str, Any]:
    m2 = run["m2"]
    p3 = _coef(m2, "P3")
    return {
        "key": key,
        "label": label,
        "n": n,
        "beta_p3": p3["beta"],
        "p_p3": p3["p"],
        "r2": m2["r2"],
        "model_p": m2["f_p"],
    }


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
                f"At least {MIN_RESPONDENTS} are needed to fit the phased regression."
            ),
            **base,
        }

    try:
        return {"available": True, **base, **_build_payload(included)}
    except _Unavailable as exc:
        return {"available": False, "reason": str(exc), **base}


def _build_payload(rows: List[Dict[str, float]]) -> Dict[str, Any]:
    n = len(rows)
    main = _fit_pipeline(rows, "main")
    m1, m2 = main["m1"], main["m2"]

    # -- descriptives + correlations ------------------------------------------
    series = {
        "TSR": [r["tsr"] for r in rows],
        "AES": [r["aes"] for r in rows],
        "ROG": [r["rog"] for r in rows],
        "Pre": [r["pre"] for r in rows],
        "Post": [r["post"] for r in rows],
    }
    descriptives = {k: {"mean": _mean(v), "sd": _sample_sd(v)} for k, v in series.items()}

    corr_series = dict(series)
    corr_series["P3"] = main["p3"]
    labels = ["TSR", "AES", "ROG", "Pre", "Post", "P3"]
    matrix = [[1.0 if a == b else _pearson(corr_series[a], corr_series[b]) for b in labels] for a in labels]

    def r_of(a: str, b: str) -> float:
        return matrix[labels.index(a)][labels.index(b)]

    # -- model comparison --------------------------------------------------------
    delta_r2 = m2["r2"] - m1["r2"]
    df1_change, df2_change = 1, m2["df2"]
    f_change = (delta_r2 / df1_change) / ((1.0 - m2["r2"]) / df2_change) if m2["r2"] < 1.0 else float("inf")
    f_change_p = _f_p_value(f_change, df1_change, df2_change) if math.isfinite(f_change) else 0.0

    # -- diagnostics ---------------------------------------------------------------
    r_pre_p3 = r_of("Pre", "P3")
    vif = 1.0 / (1.0 - r_pre_p3 ** 2) if abs(r_pre_p3) < 1 else float("inf")

    skew, exkurt = _skew_kurt(m2["residuals"])
    jb = n / 6.0 * (skew ** 2 + exkurt ** 2 / 4.0)
    jb_p = math.exp(-jb / 2.0)   # chi-square(2) survival function

    cooks = _cooks_distance(m2)
    cook_cutoff = 4.0 / n
    top = max(range(n), key=lambda i: cooks[i])
    ids = [f"S{i + 1:02d}" for i in range(n)]
    std_resid = [
        e / math.sqrt(m2["s2"] * (1.0 - h)) if m2["s2"] * (1.0 - h) > 0 else 0.0
        for e, h in zip(m2["residuals"], m2["leverage"])
    ]

    # -- sensitivity ------------------------------------------------------------------
    sensitivity = [_sensitivity_row("main", "Main model (P3 = TSR, AES, ROG)", main, n)]
    for key, label, variant in (
        ("no_aes", "TSR + ROG only (AES dropped)", "no_aes"),
        ("eff", "TSR + Efficiency (AES/TSR) + ROG", "eff"),
    ):
        try:
            sensitivity.append(_sensitivity_row(key, label, _fit_pipeline(rows, variant), n))
        except _Unavailable as exc:
            sensitivity.append({"key": key, "label": label, "n": n, "unavailable": str(exc)})

    # Case exclusion lives here ONLY, as a labelled row -- never a switch on
    # the main model. All variables are re-standardized on the n-1 sample.
    excl_label = f"Main model excluding most influential respondent ({ids[top]})"
    try:
        without = rows[:top] + rows[top + 1:]
        sensitivity.append(_sensitivity_row("excl_influential", excl_label, _fit_pipeline(without, "main"), n - 1))
    except _Unavailable as exc:
        sensitivity.append({"key": "excl_influential", "label": excl_label, "n": n - 1, "unavailable": str(exc)})

    # -- Learning Impact Index (descriptive only) ----------------------------------------
    lii = [(r["tsr"] + r["aes"] + r["rog"] + r["post"]) / 4.0 for r in rows]

    # -- per-respondent appendix (anonymized) ------------------------------------------------
    respondents = []
    for i, r in enumerate(rows):
        respondents.append({
            "id": ids[i],
            "pre": r["pre"], "post": r["post"], "tsr": r["tsr"], "aes": r["aes"], "rog": r["rog"],
            "z_pre": main["z_pre"][i], "z_post": main["z_post"][i],
            "z_tsr": main["z_tsr"][i], "z_aes": main["z_aes"][i], "z_rog": main["z_rog"][i],
            "p3_raw": main["p3_raw"][i], "p3": main["p3"][i],
            "fitted": m2["fitted"][i], "residual": m2["residuals"][i],
            "cooks_d": cooks[i], "std_residual": std_resid[i],
            "lii": lii[i],
        })

    # -- deterministic interpretation ----------------------------------------------------------
    p3c = _coef(m2, "P3")
    high_post = sum(1 for r in rows if r["post"] >= CEILING_SCORE)
    ceiling = high_post / n >= CEILING_SHARE
    overlap = abs(r_of("TSR", "AES")) > OVERLAP_R

    def verdict(p: Optional[float]) -> str:
        return "statistically significant" if p is not None and p < ALPHA else "not statistically significant"

    interpretation = [
        (
            f"Model 2 (pre-test and Phase 3 composite) was {verdict(m2['f_p'])}, "
            f"F({m2['df1']}, {m2['df2']}) = {m2['f']:.2f}, {_fmt_p(m2['f_p'])}, "
            f"R\u00b2 = {_fmt_r2(m2['r2'])}, adjusted R\u00b2 = {_fmt_r2(m2['adj_r2'])}."
        ),
        (
            f"The Phase 3 composite (TSR, AES, ROG) was {verdict(p3c['p'])} as a predictor of post-test score "
            f"(\u03b2 = {p3c['beta']:.3f}, {_fmt_p(p3c['p'])}); adding it to the pre-test model changed R\u00b2 by "
            f"{delta_r2:.3f} (F-change({df1_change}, {df2_change}) = {f_change:.2f}, {_fmt_p(f_change_p)}), "
            f"which was {verdict(f_change_p)}."
        ),
        ASSOCIATION_ONLY,
    ]

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
            f"TSR and AES are strongly correlated (r = {r_of('TSR', 'AES'):.2f}) because AES = TSR \u00d7 Efficiency "
            "contains TSR, so the two overlap and are not independent evidence."
        )
    if jb_p < ALPHA:
        limitations.append(
            "Residuals depart from normality (Jarque-Bera), so p-values should be read with caution."
        )
    if cooks[top] > cook_cutoff:
        limitations.append(
            f"{ids[top]} is an influential respondent (Cook's D = {cooks[top]:.3f}, cutoff 4/n = {cook_cutoff:.3f}); "
            "see the sensitivity table for the model without that respondent."
        )

    return _round_tree({
        "phases": [
            {"phase": 1, "label": "Pre-test"},
            {"phase": 2, "label": "In-app interaction (treatment, not scored)"},
            {"phase": 3, "label": "In-app performance (TSR, AES, ROG)"},
            {"phase": 4, "label": "Post-test"},
        ],
        "method": {
            "normalization": "z-scores with sample SD (n-1)",
            "p3_definition": "P3 = z( mean(z_TSR, z_AES, z_ROG) )",
            "model_equation": "z_Post = b1 * z_Pre + b2 * P3 + e",
        },
        "descriptives": descriptives,
        "correlations": {"labels": labels, "matrix": matrix},
        "models": {"model1": _model_summary(m1), "model2": _model_summary(m2)},
        "change": {
            "delta_r2": delta_r2, "f_change": f_change,
            "df1": df1_change, "df2": df2_change, "p": f_change_p,
        },
        "diagnostics": {
            "vif": {"pre": vif, "p3": vif},
            "jarque_bera": {"jb": jb, "p": jb_p, "skew": skew, "excess_kurtosis": exkurt},
            "cooks_distance": {
                "cutoff": cook_cutoff,
                "max": cooks[top],
                "max_id": ids[top],
                "flagged_ids": [ids[i] for i in range(n) if cooks[i] > cook_cutoff],
            },
            "max_abs_std_residual": max(abs(v) for v in std_resid),
        },
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
