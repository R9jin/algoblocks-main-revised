"""
Diagnostic: dumps the raw pre/post scores for the exact 5 paired
test-takers that feed the Cohen's d / Hake's g calculation, so you can
see WHY the means came out equal instead of just that they did.

Run this from api/ (same folder as admin_analytics_service.py) with
your normal DB env vars set.
"""
from services.admin_analytics_service import (
    _fetch_all_assessment_rows, _find_milestone,
    PRETEST_KEYWORDS, POSTTEST_KEYWORDS,
)
from repositories.user_repo import UserRepository
from database import get_db_connection

conn = get_db_connection()
all_users = UserRepository.find_all_users(conn=conn)
assessment_rows = _fetch_all_assessment_rows(conn=conn)
conn.close()

standard_emails = {
    u["email"] for u in all_users
    if not u.get("is_admin") and (u.get("role") or "user") != "admin"
}

pre, post = {}, {}
for row in assessment_rows:
    email = row.get("email")
    if email not in standard_emails:
        continue
    data = row.get("data") or {}
    p = _find_milestone(data, PRETEST_KEYWORDS)
    q = _find_milestone(data, POSTTEST_KEYWORDS)
    if p is not None:
        pre[email] = p
    if q is not None:
        post[email] = q

paired = sorted(set(pre) & set(post))
print(f"{'email':<30}{'pre':>8}{'post':>8}{'diff':>8}")
for e in paired:
    print(f"{e:<30}{pre[e]:>8.1f}{post[e]:>8.1f}{post[e]-pre[e]:>8.1f}")

n = len(paired)
mean_pre = sum(pre[e] for e in paired) / n
mean_post = sum(post[e] for e in paired) / n
print(f"\nn={n}  mean_pre={mean_pre:.4f}  mean_post={mean_post:.4f}  mean_diff={mean_post-mean_pre:.4f}")
