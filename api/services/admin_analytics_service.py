# api/services/admin_analytics_service.py
"""
Admin-facing analytics built directly from the metrics defined in the study:

  System-Generated Learning Performance Measures
    - Task Success Rate (TSR)              = PTC / TTC
    - Algorithmic Efficiency Score (AES)    = floor((TSR * Efficiency) * 100)
    - Refactoring Optimization Gain (ROG)   = AES_final - AES_baseline

  Assessment-Based Learning Measures
    - Mean / Standard Deviation of pre-test and post-test scores
    - Paired Samples t-Test                 t = d_bar / (S_d / sqrt(n))
    - Cohen's d Effect Size                 d = d_bar / S_d
    - Hake's Normalized Learning Gain (g)   g = (Post - Pre) / (Max - Pre)

TSR/AES/ROG values are read directly off the `submissions` table, where the
frontend (ActivityApp.jsx) already stores `final_aes`, `initial_aes`, `rog`,
`passed_tests`, and `total_tests` per activity attempt. Pre-test/post-test
scores are read off the `assessments` JSONB blob using the same fuzzy
key-matching approach ProfilePage.jsx uses client-side, since assessment
keys aren't guaranteed to be named identically across activities.
"""

import math
import statistics
from typing import Any, Dict, List, Optional

from database import get_db_connection
from repositories.user_repo import UserRepository

PRETEST_KEYWORDS = ["pretest", "coursepretest"]
POSTTEST_KEYWORDS = ["posttest", "courseposttest"]
MAX_TEST_SCORE = 100.0


def _clean_key(key: str) -> str:
    return "".join(ch for ch in key.lower() if ch not in "-_ ")


def _extract_score(entry: Any) -> Optional[float]:
    """Mirrors ProfilePage.jsx's formatMilestoneScore: prefer an explicit
    score, otherwise derive a percentage from correct/total."""
    if not isinstance(entry, dict):
        return None
    if entry.get("score") is not None:
        try:
            return float(entry["score"])
        except (TypeError, ValueError):
            return None
    correct = entry.get("correct")
    total = entry.get("total")
    if correct is not None and total:
        try:
            return (float(correct) / float(total)) * 100.0
        except (TypeError, ValueError, ZeroDivisionError):
            return None
    return None


def _find_milestone(assessments: Dict[str, Any], keywords: List[str]) -> Optional[float]:
    cleaned_keywords = [_clean_key(k) for k in keywords]
    for key, value in (assessments or {}).items():
        cleaned_key = _clean_key(key)
        if any(kw in cleaned_key for kw in cleaned_keywords):
            score = _extract_score(value)
            if score is not None:
                return score
    return None


# PERFORMANCE: each of these used to open its own get_db_connection(), so
# a single dashboard/profile request could pay for 2-3 separate connection
# acquisitions back to back. They now accept an already-open connection
# (still falling back to opening their own when called standalone) so the
# callers below can share one connection across the whole request.
def _fetch_all_submission_rows(conn=None) -> List[Dict[str, Any]]:
    owns_conn = conn is None
    if owns_conn:
        conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT "userId" AS email, data FROM submissions')
        rows = cursor.fetchall()
    finally:
        cursor.close()
        if owns_conn:
            conn.close()
    return [dict(r) for r in rows]


def _fetch_all_assessment_rows(conn=None) -> List[Dict[str, Any]]:
    """Reconstructs the old {email, data} shape (data = {assessment_key:
    {score, correct, total}}) from the normalized `assessments` table, so
    the fuzzy pre-test/post-test key matching below (_find_milestone) can
    stay unchanged."""
    owns_conn = conn is None
    if owns_conn:
        conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT email, assessment_key, score, correct, total FROM assessments")
        rows = cursor.fetchall()
    finally:
        cursor.close()
        if owns_conn:
            conn.close()

    grouped: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        grouped.setdefault(r["email"], {})[r["assessment_key"]] = {
            "score": r["score"],
            "correct": r["correct"],
            "total": r["total"],
        }
    return [{"email": email, "data": data} for email, data in grouped.items()]


def _fetch_submissions_for_user(email: str, conn=None) -> List[Dict[str, Any]]:
    owns_conn = conn is None
    if owns_conn:
        conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT data FROM submissions WHERE "userId" = %s', (email,))
        rows = cursor.fetchall()
    finally:
        cursor.close()
        if owns_conn:
            conn.close()
    return [r["data"] for r in rows if r.get("data")]


def _submission_metrics(submissions: List[Dict[str, Any]]) -> Dict[str, Any]:
    aes_values, rog_values, tsr_values = [], [], []
    passed_count = 0

    for sub in submissions:
        if not isinstance(sub, dict):
            continue

        final_aes = sub.get("final_aes")
        if isinstance(final_aes, (int, float)):
            aes_values.append(final_aes)

        rog = sub.get("rog")
        if isinstance(rog, (int, float)):
            rog_values.append(rog)

        total = sub.get("total_tests") or sub.get("totalTestCases")
        passed = sub.get("passed_tests")
        if passed is None:
            passed = sub.get("passedTestCases")
        if isinstance(total, (int, float)) and total > 0 and isinstance(passed, (int, float)):
            tsr_values.append(passed / total)

        if (isinstance(final_aes, (int, float)) and final_aes >= 50) or sub.get("status") == "passed":
            passed_count += 1

    return {
        "aes": round(statistics.mean(aes_values), 1) if aes_values else None,
        "rog": round(statistics.mean(rog_values), 1) if rog_values else None,
        "tsr": round(statistics.mean(tsr_values) * 100, 1) if tsr_values else None,
        "activities_attempted": len(submissions),
        "activities_passed": passed_count,
    }


# ---------------------------------------------------------------------------
# Paired t-test / Cohen's d support (pure-Python regularized incomplete beta,
# so this doesn't require adding scipy as a dependency)
# ---------------------------------------------------------------------------

def _betacf(a: float, b: float, x: float) -> float:
    maxit, eps, fpmin = 200, 3.0e-12, 1.0e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d
    for m in range(1, maxit + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def _betai(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _t_two_tailed_p(t: Optional[float], df: Optional[int]) -> Optional[float]:
    if t is None or not df or df <= 0:
        return None
    x = df / (df + t * t)
    return _betai(df / 2.0, 0.5, x)


def _interpret_cohens_d(d: Optional[float]) -> Optional[str]:
    if d is None:
        return None
    ad = abs(d)
    if ad >= 0.80:
        return "Large Effect"
    if ad >= 0.50:
        return "Medium Effect"
    if ad >= 0.20:
        return "Small Effect"
    return "Negligible Effect"


def _interpret_hakes_g(g: Optional[float]) -> Optional[str]:
    if g is None:
        return None
    if g >= 0.70:
        return "High Gain"
    if g >= 0.30:
        return "Medium Gain"
    return "Low Gain"


class AdminAnalyticsService:
    @staticmethod
    def get_user_metrics(email: str) -> Dict[str, Any]:
        # PERFORMANCE: one shared connection for both queries instead of
        # find_by_email and _fetch_submissions_for_user each opening their own.
        conn = get_db_connection()
        try:
            user = UserRepository.find_by_email(email, conn=conn)
            if not user:
                return None
            submissions = _fetch_submissions_for_user(email, conn=conn)
        finally:
            conn.close()

        progress = user.get("progress") or {}
        assessments = user.get("assessments") or {}

        metrics = _submission_metrics(submissions)
        pre_test = _find_milestone(assessments, PRETEST_KEYWORDS)
        post_test = _find_milestone(assessments, POSTTEST_KEYWORDS)

        return {
            "status": "success",
            "email": email,
            "name": user.get("name"),
            "metrics": {
                **metrics,
                "progress_entries": len(progress),
            },
            "milestones": {
                "preTest": pre_test,
                "postTest": post_test,
            },
        }

    @staticmethod
    def get_cohort_overview(selected_emails: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Computes the cohort-wide learning impact metrics.

        Administrator accounts are always excluded -- the study's learning
        impact measures are about student/respondent performance, and an
        admin account has no pre-test/post-test or activity history that
        should count toward it anyway.

        If `selected_emails` is provided (e.g. during a live data-gathering
        session where only certain respondents should count), the
        computation is restricted to that subset of standard-user emails.
        Otherwise every non-admin user is included.
        """
        # PERFORMANCE: one shared connection for all three queries instead
        # of find_all_users/_fetch_all_submission_rows/_fetch_all_assessment_rows
        # each opening their own -- this is the main dashboard endpoint, so
        # it was paying for 3 separate connection acquisitions per load.
        conn = get_db_connection()
        try:
            all_users = UserRepository.find_all_users(conn=conn)
            submission_rows = _fetch_all_submission_rows(conn=conn)
            assessment_rows = _fetch_all_assessment_rows(conn=conn)
        finally:
            conn.close()

        standard_users = [
            u for u in all_users
            if not u.get("is_admin") and (u.get("role") or "user") != "admin"
        ]
        standard_emails = {u.get("email") for u in standard_users if u.get("email")}

        if selected_emails:
            requested = {e for e in selected_emails if e}
            target_emails = standard_emails & requested
        else:
            target_emails = standard_emails

        all_submissions = [
            row.get("data") for row in submission_rows
            if row.get("data") and row.get("email") in target_emails
        ]
        cohort_submission_metrics = _submission_metrics(all_submissions)

        pre_scores: Dict[str, float] = {}
        post_scores: Dict[str, float] = {}
        for row in assessment_rows:
            email = row.get("email")
            if email not in target_emails:
                continue
            data = row.get("data") or {}
            pre = _find_milestone(data, PRETEST_KEYWORDS)
            post = _find_milestone(data, POSTTEST_KEYWORDS)
            if pre is not None:
                pre_scores[email] = pre
            if post is not None:
                post_scores[email] = post

        paired_emails = sorted(set(pre_scores) & set(post_scores))
        pre_list = [pre_scores[e] for e in paired_emails]
        post_list = [post_scores[e] for e in paired_emails]
        diffs = [post_list[i] - pre_list[i] for i in range(len(paired_emails))]
        n = len(diffs)

        mean_pre = round(statistics.mean(pre_list), 2) if pre_list else None
        mean_post = round(statistics.mean(post_list), 2) if post_list else None
        sd_pre = round(statistics.stdev(pre_list), 2) if len(pre_list) > 1 else None
        sd_post = round(statistics.stdev(post_list), 2) if len(post_list) > 1 else None

        mean_diff = statistics.mean(diffs) if diffs else None
        sd_diff = statistics.stdev(diffs) if n > 1 else None

        t_value = None
        df = n - 1 if n > 0 else None
        if sd_diff and n > 0:
            t_value = mean_diff / (sd_diff / math.sqrt(n))
        p_value = _t_two_tailed_p(t_value, df)

        cohens_d = (mean_diff / sd_diff) if sd_diff else None
        hakes_denominator = (MAX_TEST_SCORE - mean_pre) if mean_pre is not None else None
        hakes_g = (
            (mean_post - mean_pre) / hakes_denominator
            if mean_post is not None and mean_pre is not None and hakes_denominator not in (None, 0)
            else None
        )

        return {
            "status": "success",
            "user_count": len(target_emails),
            "total_standard_users": len(standard_emails),
            "is_filtered": bool(selected_emails),
            "paired_test_takers": n,
            "system_generated": cohort_submission_metrics,
            "assessment_based": {
                "mean_pretest": mean_pre,
                "mean_posttest": mean_post,
                "sd_pretest": sd_pre,
                "sd_posttest": sd_post,
                "mean_difference": round(mean_diff, 2) if mean_diff is not None else None,
                "sd_difference": round(sd_diff, 2) if sd_diff is not None else None,
                "t_value": round(t_value, 3) if t_value is not None else None,
                "degrees_of_freedom": df,
                "p_value": round(p_value, 4) if p_value is not None else None,
                "significant_at_0_05": (p_value < 0.05) if p_value is not None else None,
                "cohens_d": round(cohens_d, 3) if cohens_d is not None else None,
                "cohens_d_interpretation": _interpret_cohens_d(cohens_d),
                "hakes_g": round(hakes_g, 3) if hakes_g is not None else None,
                "hakes_g_interpretation": _interpret_hakes_g(hakes_g),
            },
        }
