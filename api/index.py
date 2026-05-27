# api/index.py
import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from api.database import db

# Import routers
from api.routers import (
    auth_router,
    project_router,
    analyze_router,
    template_router,
    progress_router  # <--- Added this import
)

app = FastAPI(
    title="AlgoBlocks API",
    description="Backend API for AlgoBlocks - Algorithm Learning System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(project_router.router, prefix="/api/projects", tags=["Projects"])
app.include_router(analyze_router.router, prefix="/api", tags=["Analysis"])
app.include_router(template_router.router, prefix="/api/templates", tags=["Templates"])
# FIX: Register the new progress router so the frontend can reach the endpoints
app.include_router(progress_router.router, prefix="/api", tags=["Progress & Submissions"]) 

@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify API and DB connection."""
    try:
        # Check DB connection
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
    uvicorn.run("api.index:app", host="0.0.0.0", port=8000, reload=True)