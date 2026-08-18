# api/index.py
import os
import sys
import logging

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import time
import uvicorn
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

# Dedicated logger for request-level auditing (auth failures, API errors,
# and unusually slow/abusive traffic patterns) so this stream can be
# filtered/alerted on independently of general application logs.
access_logger = logging.getLogger("algoblocks.access")

# Initialize PostgreSQL Neon connection and hybrid tables.
# Runs at import time (not inside a request handler) so it fires exactly
# once per process: once per local `uvicorn`/`python index.py` run, and once
# per Vercel cold start. CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN
# IF NOT EXISTS make this safe to run repeatedly against a live database —
# it never drops or overwrites existing data, it only adds what's missing.
# A failure here is logged but doesn't crash the app, since Neon's free tier
# can be briefly asleep/unreachable on first request; the /api/admin/init-db
# endpoint below stays available as a manual retry.
import database

try:
    database.init_db()
    logger.info("Database schema check completed on startup.")
except Exception as e:
    logger.error(f"Database initialization failed on startup: {e}", exc_info=True)

# BUG FIX: MailerSend sends (password reset emails) were failing completely
# silently -- send_password_reset_email() only logs and returns False on
# failure, by design, so the /forgot-password endpoint can always return the
# same generic message and not leak whether an account exists. That's
# correct behavior for the API response, but it meant a missing/misconfigured
# MAILERSEND_API_KEY (e.g. the .env file placed at the project root instead
# of api/.env, where database.py's load_dotenv() looks) produced no visible
# error anywhere. Surface it loudly at startup instead.
if not os.getenv("MAILERSEND_API_KEY"):
    logger.warning(
        "MAILERSEND_API_KEY is not set -- password reset emails will "
        "silently fail to send. Make sure your .env file is at api/.env "
        "(not the project root), then restart the server."
    )

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from limiter import limiter
from security import get_current_admin_user

from routers import (
    auth_router,
    project_router,
    analyze_router,
    template_router,
    admin_router,
    progress_router  # <--- FIX: Imported the missing progress router
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://algoblocks-main-revised.vercel.app"
    ], 
    # SECURITY FIX: vercel.app is a public, multi-tenant domain -- anyone can
    # deploy their own project there for free. The old regex (`https://.*\.
    # vercel\.app`) combined with allow_credentials=True meant literally any
    # attacker-controlled *.vercel.app site was treated as a trusted origin.
    # Scoped down to only this project's own preview-deployment subdomains
    # (Vercel names those "algoblocks-main-revised-<hash-or-branch>-<team>.
    # vercel.app").
    allow_origin_regex=r"https://algoblocks-main-revised(-[a-zA-Z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_and_access_log(request: Request, call_next):
    """
    Two things in one pass, since FastAPI/Starlette only lets us wrap the
    whole request/response cycle once per middleware:

    1. SECURITY HEADERS -- defense-in-depth browser-side protections that
       cost nothing and don't depend on any single endpoint remembering to
       set them. This is a pure API (no server-rendered HTML), so this is
       deliberately a small, safe set rather than a full CSP tuned for a
       specific page.

    2. ACCESS/ABUSE LOGGING -- every request logged with method, path,
       status, client IP (respecting X-Forwarded-For the same way the rate
       limiter's key_func does, since this typically runs behind Vercel's
       proxy), and duration. 401/403 responses (failed auth / suspended or
       unverified accounts / IDOR attempts hitting an ownership check) and
       429s (rate-limit trips) are logged at WARNING so they stand out in
       log aggregation as the signal an admin would actually want to alert
       on -- a burst of 401s from one IP, or repeated 429s, is exactly the
       "unusual traffic pattern" this task asked to be able to detect.
    """
    start = time.perf_counter()

    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
        request.client.host if request.client else "unknown"
    )

    response = await call_next(request)

    duration_ms = (time.perf_counter() - start) * 1000

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    # HSTS only matters over HTTPS; harmless to send unconditionally since
    # browsers ignore it on plain HTTP anyway, and this API is only ever
    # served over HTTPS in production (Vercel).
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"

    log_line = (
        f'{client_ip} "{request.method} {request.url.path}" '
        f"{response.status_code} {duration_ms:.1f}ms"
    )
    if response.status_code in (401, 403, 429):
        access_logger.warning(log_line)
    elif response.status_code >= 500:
        access_logger.error(log_line)
    else:
        access_logger.info(log_line)

    return response


app.include_router(auth_router.router, prefix="/api", tags=["Authentication"])
app.include_router(project_router.router, prefix="/api/projects", tags=["Projects"])
app.include_router(analyze_router.router, prefix="/api", tags=["Analysis"])
app.include_router(template_router.router, prefix="/api/templates", tags=["Templates"])
app.include_router(admin_router.router, prefix="/api/admin", tags=["Admin Operations"])
# FIX: Attached the missing submission and progress routes to the live server
app.include_router(progress_router.router, prefix="/api", tags=["Progress & Submissions"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "AlgoBlocks API is running smoothly on PostgreSQL Neon."}

@app.get("/api/admin/init-db", tags=["Admin Operations"])
@limiter.limit("5/minute")
async def initialize_database(request: Request, admin_email: str = Depends(get_current_admin_user)):
    """
    Manual fallback only — the schema check now also runs automatically on
    every startup/cold start (see the top of this file). Use this if that
    startup run failed (e.g. Neon was asleep) and you want to retry without
    redeploying or restarting the server.

    SECURITY FIX: this used to be a public, unauthenticated endpoint (it sat
    directly on `app` instead of going through admin_router's
    get_current_admin_user dependency) with no rate limit, and it echoed raw
    exception text back to the caller. Anyone on the internet could hit it
    repeatedly to hammer the DB connection or fish for internal error detail.
    It now requires an authenticated admin and is rate-limited like the rest
    of the admin surface, and no longer returns raw exception internals.
    Example: https://your-vercel-url.vercel.app/api/admin/init-db
    """
    try:
        database.init_db()
        return {"status": "success", "message": "PostgreSQL tables initialized successfully!"}
    except Exception as e:
        logger.error(f"Manual DB initialization failed: {e}", exc_info=True)
        return {"status": "error", "message": "Initialization failed. Check server logs for details."}

if __name__ == "__main__":
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)