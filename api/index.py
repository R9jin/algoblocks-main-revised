import os
import sys

# Tell Vercel/Python to look inside the 'api' folder for modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import db

from routers import (
    auth_router,
    project_router,
    analyze_router,
    template_router
    # Removed progress_router to prevent route duplication and conflict
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    # 1. Explicitly allow local development
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://your-main-custom-domain.com" # Put your primary custom domain here if you have one
    ], 
    # 2. Dynamically allow ALL Vercel deployments (previews, branches, etc.)
    allow_origin_regex=r"https://.*\.vercel\.app", 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api", tags=["Authentication"])
app.include_router(project_router.router, prefix="/api/projects", tags=["Projects"])
app.include_router(analyze_router.router, prefix="/api", tags=["Analysis"])
app.include_router(template_router.router, prefix="/api/templates", tags=["Templates"])
# Duplicate progress routes removed; auth_router handles them safely with JWT context

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
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)