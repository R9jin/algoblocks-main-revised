import sys
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId

# Ensure current dir is included for Vercel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  

# =========================
# ✅ CLEANED IMPORT HANDLING
# =========================
try:
    from api.database import projects_collection, users_collection, templates_collection
    from api.models import ProjectModel, ProjectUpdate, TemplateModel, TemplateUpdate
except ModuleNotFoundError:
    try:
        from database import projects_collection, users_collection, templates_collection  
        from models import ProjectModel, ProjectUpdate, TemplateModel, TemplateUpdate  
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

# NEW: Model for the AST converter request payload
class ASTRequest(BaseModel):
    code: str

@app.get("/")
def health_check():
    return {"status": "online", "message": "AlgoBlocks API Cloud Sync is running."}

# =========================
# PYTHON TO BLOCKS (NEW FIX)
# =========================
@app.post("/api/ast-to-blocks")
def ast_to_blocks(req: ASTRequest):
    try:
        # TODO: Import and use your actual Python-to-Blockly conversion logic here!
        # For example: 
        # from parser import python_to_blockly
        # block_json = python_to_blockly(req.code)

        # Temporary fallback to an empty workspace so the frontend stops crashing:
        placeholder_blocks = {"blocks": {"languageVersion": 0, "blocks": []}}

        return {"status": "success", "blocks": placeholder_blocks}
    except Exception as e:
        # Return the error in the exact format your frontend is expecting
        return {"status": "error", "message": str(e)}

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