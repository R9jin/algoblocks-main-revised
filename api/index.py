# api/index.py
import os
import sys

# Tell Vercel to look inside the 'api' folder for modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database import db

from routers import (
    auth_router,
    project_router,
    analyze_router,
    template_router,
    progress_router
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False, # FIXED: Changed to False to prevent FastAPI startup crash
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure prefixes match exactly what the frontend is calling
app.include_router(auth_router.router, prefix="/api", tags=["Authentication & Submissions"])
app.include_router(project_router.router, prefix="/api/projects", tags=["Projects"])
app.include_router(analyze_router.router, prefix="/api", tags=["Analysis"])
app.include_router(template_router.router, prefix="/api/templates", tags=["Templates"])

# FIXED: Added the missing inclusion for the progress router!
app.include_router(progress_router.router, prefix="/api", tags=["Progress & Assessments"])

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