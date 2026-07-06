import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import db
# BUG-05 Fix: Register SlowAPI limiter and middleware pipeline
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from limiter import limiter

from routers import (
    auth_router,
    project_router,
    analyze_router,
    template_router,
    admin_router
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0"
)

# BUG-05 Fix: Attach limiter state and exception handlers
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

@app.get("/api/health")
async def health_check():
    try:
        db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0"
    }

if __name__ == "__main__":
    uvicorn.run("index:app", host="127.0.0.1", port=8000, reload=True)