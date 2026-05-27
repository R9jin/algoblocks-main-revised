# api/index.py
import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# ==========================================
# ✅ FIX: GLOBAL PATH RESOLUTION
# ==========================================
current_dir = os.path.dirname(os.path.abspath(__file__)) # Gets the /api folder
parent_dir = os.path.dirname(current_dir)                # Gets the root folder

# Add both to sys.path so 'from api...' imports work everywhere without try/except
sys.path.insert(0, parent_dir)
sys.path.insert(0, current_dir)

# ✅ IMPORT LIMITER FROM THE NEW FILE
from api.limiter import limiter

# Import your cleanly separated routers
from api.routers import project_router
from api.routers import template_router
from api.routers import auth_router
from api.routers import analyze_router
from api.routers import progress_router

app = FastAPI()

# Register the limiter state and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =========================
# MIDDLEWARE
# =========================
app.add_middleware(SlowAPIMiddleware) # Enforces the global rate limit
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ROUTER REGISTRATION
# =========================
app.include_router(project_router.router)
app.include_router(template_router.router)
app.include_router(auth_router.router)
app.include_router(analyze_router.router)
app.include_router(progress_router.router)

# =========================
# ROOT
# =========================
@app.get("/")
def health_check():
    return {"status": "online", "message": "AlgoBlocks API Cloud Sync is running."}