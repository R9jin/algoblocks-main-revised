import builtins
import threading
import queue
import sys
import os
import asyncio
import ast
import requests
import traceback
from io import StringIO

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from collections import defaultdict

# ✅ KEEP but safer (ensures current dir is included)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  

# =========================
# ✅ FIXED IMPORT HANDLING
# =========================
try:
    # ✅ Case 1: running from project root
    from api.blockly_ast import BlocklyASTConverter
    from api.database import projects_collection, users_collection, templates_collection
    from api.models import ProjectModel, ProjectUpdate, TemplateModel, TemplateUpdate
    from api.analyzer import ComplexityAnalyzer

except ModuleNotFoundError:
    try:
        # ✅ Case 2: running inside /api folder
        from blockly_ast import BlocklyASTConverter  
        from database import projects_collection, users_collection, templates_collection  
        from models import ProjectModel, ProjectUpdate, TemplateModel, TemplateUpdate  
        from analyzer import ComplexityAnalyzer  
    except ModuleNotFoundError as e:
        raise RuntimeError(f"Import failed: {e}")  

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
# MODELS
# =========================
class CodePayload(BaseModel):
    code: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SignUpRequest(BaseModel):
    name: str
    email: str
    password: str

class ProgressRequest(BaseModel):
    email: str
    lesson_id: str
    score: int

class GoogleAuthRequest(BaseModel):
    access_token: str

class AstRequest(BaseModel):
    code: str

# =========================
# UTILITIES
# =========================
def clean_python_code(code: str) -> str:
    return code.replace('\xa0', ' ').replace('\u200b', '').replace('\t', '    ')

def safe_exec(code: str, globals_dict: dict):
    safe_builtins = builtins.__dict__.copy()
    safe_builtins["print"] = print
    safe_builtins["input"] = globals_dict.get("input", input)

    exec(code, {
        "__builtins__": safe_builtins  
    })

@app.get("/")
def health_check():
    return {"status": "online", "message": "AlgoBlocks API Cloud Sync is running."}

# =========================
# CLOUD SYNC: PROJECTS
# =========================
@app.post("/api/projects")
def save_project(project: ProjectModel):
    if projects_collection is None:
        raise HTTPException(500, "Database not connected")

    result = projects_collection.insert_one(project.model_dump())
    return {"status": "success", "id": str(result.inserted_id)}

@app.get("/api/projects")
def get_projects():
    if projects_collection is None:
        raise HTTPException(500, "Database not connected")

    projects = list(projects_collection.find({}))
    for p in projects:
        p["_id"] = str(p["_id"])

    return {"status": "success", "projects": projects}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    if projects_collection is None:
        raise HTTPException(500, "Database not connected")
        
    result = projects_collection.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Project not found")
    return {"status": "success"}

@app.put("/api/projects/{project_id}")
def update_project(project_id: str, payload: ProjectUpdate):
    if projects_collection is None:
        raise HTTPException(500, "Database not connected")
        
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}

    result = projects_collection.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(404, "Project not found")

    return {"status": "success"}

# =========================
# CLOUD SYNC: TEMPLATES
# =========================
@app.post("/api/templates")
def save_template(template: TemplateModel):
    if templates_collection is None:
        raise HTTPException(500, "Database not connected")

    result = templates_collection.insert_one(template.model_dump())
    return {"status": "success", "id": str(result.inserted_id)}

@app.get("/api/templates")
def get_templates():
    if templates_collection is None:
        raise HTTPException(500, "Database not connected")

    templates = list(templates_collection.find({}))
    for t in templates:
        t["_id"] = str(t["_id"])
    return {"status": "success", "templates": templates}

@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str):
    if templates_collection is None:
        raise HTTPException(500, "Database not connected")

    result = templates_collection.delete_one({"_id": ObjectId(template_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"status": "success"}

@app.put("/api/templates/{template_id}")
def update_template(template_id: str, payload: TemplateUpdate):
    if templates_collection is None:
        raise HTTPException(500, "Database not connected")

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}

    result = templates_collection.update_one(
        {"_id": ObjectId(template_id)},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(404, "Template not found")

    return {"status": "success"}

# =========================
# CLOUD SYNC: AUTH & PROGRESS
# =========================
@app.post("/api/login")
def login_user(req: LoginRequest):
    if users_collection is None:
        raise HTTPException(500, "Database not connected")

    user = users_collection.find_one({"email": req.email})
    if not user or user.get("password") != req.password:
        raise HTTPException(401, "Invalid credentials")

    return {
        "status": "success",
        "email": req.email,
        "name": user.get("name"),
        "progress": user.get("progress", {})
    }

@app.post("/api/signup")
def signup_user(req: SignUpRequest):
    if users_collection is None:
        raise HTTPException(500, "Database not connected")

    if users_collection.find_one({"email": req.email}):
        raise HTTPException(400, "Email already registered")

    users_collection.insert_one({
        "name": req.name,
        "email": req.email,
        "password": req.password,
        "progress": {}
    })

    return {"status": "success", "email": req.email, "name": req.name}

@app.post("/api/update-progress")
def update_progress(req: ProgressRequest):
    if users_collection is None:
        raise HTTPException(500, "Database not connected")
        
    users_collection.update_one(
        {"email": req.email},
        {"$set": {f"progress.{req.lesson_id}": req.score}}
    )

    user = users_collection.find_one({"email": req.email})
    return {"status": "success", "progress": user.get("progress", {})}