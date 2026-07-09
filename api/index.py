# api/index.py
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize PostgreSQL Neon connection and hybrid tables
import database 

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
    return {"status": "ok", "message": "AlgoBlocks API is running smoothly on PostgreSQL Neon."}

@app.get("/api/admin/init-db", tags=["Admin Operations"])
async def initialize_database():
    """
    Run this manually via browser once after deploying to Vercel to create tables.
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