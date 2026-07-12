# api/index.py
import os
import sys
import logging

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from limiter import limiter

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
    allow_origin_regex=r"https://.*\.vercel\.app", 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def initialize_database():
    """
    Manual fallback only — the schema check now also runs automatically on
    every startup/cold start (see the top of this file). Use this if that
    startup run failed (e.g. Neon was asleep) and you want to retry without
    redeploying or restarting the server.
    Example: https://your-vercel-url.vercel.app/api/admin/init-db
    """
    try:
        # Calls the function without it running globally on cold starts
        database.init_db()
        return {"status": "success", "message": "PostgreSQL tables initialized successfully!"}
    except Exception as e:
        return {"status": "error", "message": f"Initialization failed: {str(e)}"}

if __name__ == "__main__":
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)