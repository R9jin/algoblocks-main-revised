# api/index.py
"""
AlgoBlocks API entry point.

Configures and assembles the FastAPI application:
- Initialises the PostgreSQL database schema on startup.
- Registers rate limiting via SlowAPI.
- Configures CORS (scoped to known AlgoBlocks origins only).
- Attaches an HTTP middleware for security headers and access-log auditing.
- Mounts all feature routers under the ``/api`` prefix.
- Provides a ``/api/health`` liveness check and an admin-only
  ``/api/admin/init-db`` manual schema-initialisation endpoint.
"""
import os
import sys
import logging
from contextlib import asynccontextmanager

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import time
import uvicorn
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

# Dedicated logger for request-level auditing (auth failures, API errors,
# and unusually slow or abusive traffic patterns) so this stream can be
# filtered and alerted on independently of general application logs.
access_logger = logging.getLogger("algoblocks.access")

# Initialise the PostgreSQL Neon connection and hybrid tables.
# Runs at import time (not inside a request handler) so it fires exactly
# once per process: once per local ``uvicorn``/``python index.py`` run, and
# once per Vercel cold start. CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD
# COLUMN IF NOT EXISTS make this safe to run repeatedly against a live
# database — it never drops or overwrites existing data, it only adds what
# is missing. A failure here is logged but does not crash the app, since
# Neon's free tier can be briefly asleep/unreachable on first request; the
# /api/admin/init-db endpoint below stays available as a manual retry.
import database

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB init in the background after the server is already listening.
    This avoids blocking startup on a Neon cold-start (free tier suspends
    the DB after 5 min of inactivity; wake-up can take 5–30 s)."""
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, database.init_db)
        logger.info("Database schema check completed on startup.")
    except Exception as e:
        logger.error(f"Database initialization failed on startup: {e}", exc_info=True)
    yield  # server runs here

# Surface missing SMTP credentials loudly at startup rather than silently.
# send_verification_email()/send_password_reset_email() only log and return
# False on failure so the /signup and /forgot-password endpoints can always
# return their generic responses without leaking whether an account exists.
# That is correct behaviour for the API response, but it meant misconfigured
# SMTP credentials (e.g. the .env file placed at the project root instead
# of api/.env, where database.py's load_dotenv() looks) produced no visible
# error anywhere. Detecting the missing vars at startup makes the problem
# immediately obvious.
if not os.getenv("SMTP_USERNAME") or not os.getenv("SMTP_PASSWORD"):
    logger.warning(
        "SMTP_USERNAME / SMTP_PASSWORD are not set -- verification and "
        "password reset emails will silently fail to send. Make sure your "
        ".env file is at api/.env (not the project root), then restart "
        "the server."
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
    progress_router  # Required: provides submission and progress endpoints
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0",
    lifespan=lifespan,
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
    # vercel.app is a public, multi-tenant domain — anyone can deploy their
    # own project there for free. Using a broad wildcard pattern combined with
    # allow_credentials=True would mean any attacker-controlled *.vercel.app
    # site would be treated as a trusted origin. The regex below is scoped
    # to only this project's own preview-deployment subdomains (Vercel names
    # those "algoblocks-main-revised-<hash-or-branch>-<team>.vercel.app").
    allow_origin_regex=r"https://algoblocks-main-revised(-[a-zA-Z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_and_access_log(request: Request, call_next):
    """
    HTTP middleware that applies security headers and structured access logging
    in a single pass over the request/response cycle.

    **Security headers** — defence-in-depth browser-side protections that
    cost nothing and do not depend on any single endpoint remembering to set
    them. This is a pure JSON API (no server-rendered HTML), so only a small,
    safe set of headers is applied rather than a full CSP tuned for a
    specific page. CSP is omitted on FastAPI's own docs UI (``/docs``,
    ``/redoc``) because Swagger/ReDoc load their JS/CSS from a CDN and would
    be broken by a ``default-src 'none'`` policy.

    **Access and abuse logging** — every request is logged with method,
    path, status code, client IP (resolved via ``X-Forwarded-For`` to match
    the rate limiter's key function), and wall-clock duration.
    HTTP 401/403 (failed auth, suspended/unverified accounts, ownership
    check failures) and 429 (rate-limit trips) are logged at WARNING so
    they stand out as signals an operator would want to alert on — a burst
    of 401s from one IP or repeated 429s is the "unusual traffic pattern"
    that warrants investigation.
    """
    start = time.perf_counter()

    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
        request.client.host if request.client else "unknown"
    )

    conn_token = database.begin_request_tracking()
    try:
        response = await call_next(request)
    finally:
        # Reclaim any DB connection a handler leaked (see database.py).
        database.release_leaked_connections(conn_token)

    duration_ms = (time.perf_counter() - start) * 1000

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    # HSTS only matters over HTTPS; harmless to send unconditionally since
    # browsers ignore it on plain HTTP anyway, and this API is only ever
    # served over HTTPS in production (Vercel).
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    # Minimal CSP: every response here is JSON (no server-rendered HTML/JS/CSS
    # of our own), so "default-src 'none'" costs nothing and closes off any
    # endpoint that might someday reflect user input as HTML.
    if request.url.path not in ("/docs", "/redoc", "/openapi.json"):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"

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
# Provides /api/update-progress, /api/sync-submission, /api/sync-assessment,
# /api/batch-sync, /api/get-submission, and /api/get-assessment endpoints.
app.include_router(progress_router.router, prefix="/api", tags=["Progress & Submissions"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "AlgoBlocks API is running smoothly on PostgreSQL Neon."}

@app.get("/api/admin/init-db", tags=["Admin Operations"])
@limiter.limit("5/minute")
async def initialize_database(request: Request, admin_email: str = Depends(get_current_admin_user)):
    """
    Manual fallback for database schema initialisation.

    The schema check also runs automatically on every startup/cold start
    (see module-level ``database.init_db()`` call above). Use this endpoint
    if that startup run failed (e.g. Neon was asleep) and you need to retry
    without redeploying or restarting the server.

    Requires an authenticated admin account and is rate-limited to
    5 requests per minute. Errors are logged server-side but not surfaced
    in the response body to avoid leaking internal details.

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