import builtins
import threading
import queue
import sys
import os
import asyncio
import ast
import requests
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

@app.post("/api/auth/google")
def google_auth(req: GoogleAuthRequest):
    if users_collection is None:
        raise HTTPException(500, "Database not connected")
        
    res = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {req.access_token}"}
    )

    if not res.ok:
        raise HTTPException(400, "Invalid token")

    data = res.json()
    email = data.get("email")

    user = users_collection.find_one({"email": email})
    if not user:
        user = {"name": data.get("name"), "email": email, "progress": {}}
        users_collection.insert_one(user)
    else:
        user["_id"] = str(user["_id"])

    return {"status": "success", **user}

# =========================
# FALLBACK: AST → BLOCKS
# =========================
@app.post("/api/ast-to-blocks")
async def ast_to_blocks(request: AstRequest):
    try:
        if not request.code or not request.code.strip():
            return {"status": "success", "blocks": {"blocks": {"languageVersion": 0, "blocks": []}}}
            
        converter = BlocklyASTConverter()
        return converter.convert(request.code)
    except SyntaxError as e:
        return {
            "status": "error", 
            "error_type": "SyntaxError", 
            "line": getattr(e, 'lineno', 1), 
            "message": getattr(e, 'msg', str(e))
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Internal Server Error: {str(e)}"}
    
# =========================
# FALLBACK: COMPLEXITY ANALYSIS
# =========================
@app.post("/api/analyze")
@app.post("/analyze")
def analyze_complexity(payload: CodePayload):
    try:
        sanitized_code = clean_python_code(payload.code)
        tree = ast.parse(sanitized_code)
        analyzer = ComplexityAnalyzer(sanitized_code)

        analyzer.bfs_first_pass(tree)
        for _, node in analyzer.symbol_table.items():
            analyzer.visit(node)

        analyzer.details = []
        analyzer.max_complexity = analyzer.max_space_weight = 0
        analyzer.max_poly = analyzer.max_log = analyzer.max_sqrt = 0
        analyzer.current_depth = analyzer.loop_depth = 0
        analyzer.log_loop_depth = analyzer.sqrt_loop_depth = 0

        analyzer.visit(tree)

        def to_asymp(comp):
            if not comp: return "-"
            if "n * T(n-1)" in comp: return "O(n!)"
            if "2T(n/2)" in comp: return "O(n log n)"
            if "T(n-1) + T(n-2)" in comp: return "O(2^n)"
            if "T(n/2)" in comp: return "O(log n)"
            if "T(n-1) + O(n)" in comp: return "O(n^2)"
            if "T(n-1)" in comp: return "O(n)"
            return comp

        lines = []
        for line in analyzer.details:
            lines.append({
                "lineOfCode": line["lineOfCode"],
                "operation": line.get("operation", "-"),
                "local_time": to_asymp(line.get("local_time")),
                "global_time": to_asymp(line.get("global_time")),
                "local_space": to_asymp(line.get("local_space")),
                "global_space": to_asymp(line.get("global_space")),
                "indent": line.get("indent", 0),
                "color": line.get("color"),
                "weight": line.get("weight", 0),
                # ✅ FIXED: Correct dictionary keys matching analyzer.py outputs
                "time_explanation": line.get("time_explanation", ""),
                "space_explanation": line.get("space_explanation", "")
            })

        return {
            "status": "success",
            "total": analyzer.get_final_asymptotic_badge(),
            "total_recurrence": analyzer.get_final_badge(),
            "lines": lines,
            "space_total": analyzer.get_final_space_badge(), 
            "is_recursive": any("T(n)" in str(l.get("global_time")) for l in analyzer.details)
        }

    except SyntaxError as e:
        return {
            "status": "error",
            "error_type": "SyntaxError",
            "line": e.lineno,
            "message": e.msg,
            "lines": []
        }
    except Exception:
        return {"status": "error", "lines": []}
@app.post("/api/run")
@app.post("/run")
def run_code(payload: CodePayload):
    old_stdout = sys.stdout
    redirected_output = sys.stdout = StringIO()

    def simulated_input(prompt=""):
        print(prompt, end="")
        return "Simulated User Input"

    counts = {}

    try:
        code = clean_python_code(payload.code)
        
        # 1. Create an inline profiler
        class BackendProfiler:
            def __init__(self):
                self.hits = defaultdict(int)
            def trace_lines(self, frame, event, arg):
                # Count lines only for the executed string block
                if event == 'line' and frame.f_code.co_filename == '<string>':
                    self.hits[frame.f_lineno] += 1
                return self.trace_lines
                
        profiler = BackendProfiler()
        compiled_code = compile(code, '<string>', 'exec')
        
        safe_builtins = builtins.__dict__.copy()
        safe_builtins["print"] = print
        safe_builtins["input"] = simulated_input

        # 2. Attach the profiler before execution
        sys.settrace(profiler.trace_lines)
        try:
            exec(compiled_code, {"__builtins__": safe_builtins})
        finally:
            # 3. Detach the profiler and extract hits
            sys.settrace(None)
            counts = dict(profiler.hits)

        output = redirected_output.getvalue() or "> Code ran successfully."
    except Exception as e:
        output = f"Runtime Error: {str(e)}"
    finally:
        sys.stdout = old_stdout

    # 4. Make sure to return 'counts' so MainApp.jsx can read it
    return {"status": "success", "output": output, "counts": counts}

# =========================
# FALLBACK: WEBSOCKET RUNNER
# =========================
@app.websocket("/api/ws/run")
async def websocket_run(websocket: WebSocket):
    await websocket.accept()
    input_queue = queue.Queue()
    
    main_loop = asyncio.get_running_loop()

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "run":
                code = clean_python_code(data["code"])

                async def send(msg):
                    await websocket.send_json(msg)

                def custom_input(prompt=""):
                    asyncio.run_coroutine_threadsafe(
                        send({"type": "input_request", "prompt": str(prompt)}),
                        main_loop  
                    )
                    return input_queue.get()

                class WSWriter:
                    def write(self, text):
                        if text:
                            asyncio.run_coroutine_threadsafe(
                                send({"type": "output", "data": text}),
                                main_loop  
                            )
                    def flush(self): pass

                def worker():
                    old_stdout = sys.stdout
                    sys.stdout = WSWriter()
                    try:
                        safe_exec(code, {"input": custom_input})
                        asyncio.run_coroutine_threadsafe(
                            send({"type": "done"}), 
                            main_loop  
                        )
                    except Exception as e:
                        asyncio.run_coroutine_threadsafe(
                            send({"type": "error", "data": str(e)}),
                            main_loop  
                        )
                    finally:
                        sys.stdout = old_stdout

                threading.Thread(target=worker, daemon=True).start()

            elif data["type"] == "input_response":
                input_queue.put(data["data"])

    except WebSocketDisconnect:
        print("Client disconnected.")