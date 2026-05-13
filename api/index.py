import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure current dir is included for Vercel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  

# Import your cleanly separated routers
from api.routers import project_router
from api.routers import template_router
from api.routers import auth_router

app = FastAPI()

# =========================
# MIDDLEWARE
# =========================
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

# =========================
# ROOT
# =========================
@app.get("/")
def health_check():
    return {"status": "online", "message": "AlgoBlocks API Cloud Sync is running."}