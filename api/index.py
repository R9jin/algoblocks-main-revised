# api/index.py
import sys
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# ==========================================
# RATE LIMITER CONFIGURATION (Vercel Aware)
# ==========================================
def get_real_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

# Default limit across the entire app
limiter = Limiter(key_func=get_real_client_ip, default_limits=["100/minute"])

# ==========================================
# ✅ FIX: GLOBAL PATH RESOLUTION
# ==========================================
current_dir = os.path.dirname(os.path.abspath(__file__)) # Gets the /api folder
parent_dir = os.path.dirname(current_dir)                # Gets the root folder

# Add both to sys.path so 'from api...' imports work everywhere without try/except
sys.path.insert(0, parent_dir)
sys.path.insert(0, current_dir)

# Import your cleanly separated routers
from api.routers import project_router
from api.routers import template_router
from api.routers import auth_router
from api.routers import analyze_router

app = FastAPI()

# Register the limiter state and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =========================
# MIDDLEWARE
# =========================
app.add_middleware(SlowAPIMiddleware)
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

# =========================
# ROOT
# =========================
@app.get("/")
def health_check(request: Request):
    return {"status": "online", "message": "API Cloud Sync is running."}