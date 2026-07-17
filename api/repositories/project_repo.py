from database import get_db_connection
import json
import uuid

class ProjectRepository:
    @staticmethod
    def count_by_user(user_id: str) -> int:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) AS count FROM projects WHERE "userId" = %s OR owner_id = %s', (user_id, user_id))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row["count"] if row else 0

    @staticmethod
    def find_by_user(user_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM projects WHERE "userId" = %s OR owner_id = %s', (user_id, user_id))
        projects = cursor.fetchall()
        cursor.close()
        conn.close()
        
        result = []
        for proj in projects:
            p = dict(proj)
            # Unpack the JSON blockly_data back into the root dictionary for the frontend
            blockly_data = p.pop("blockly_data", {})
            p.update(blockly_data)
            
            p["_id"] = str(p["id"])
            if "userId" not in p and "owner_id" in p:
                p["userId"] = p["owner_id"]
            if "owner_id" not in p and "userId" in p:
                p["owner_id"] = p["userId"]
            result.append(p)
        return result

    @staticmethod
    def insert(project_data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        user_id = project_data.get("userId")
        owner_id = project_data.get("owner_id", user_id)
        project_id = project_data.get("projectId")
        
        # Generate a safe UUID if the frontend stripped the ID or sent a local temp ID
        if not project_id or str(project_id).startswith("local_"):
            project_id = str(uuid.uuid4())
            
        is_synced = project_data.get("isSynced", False)
        timestamp = project_data.get("timestamp", 0)
        
        # Package the dynamic elements back into a JSON object
        blockly_data = {
            "title": project_data.get("title", "Untitled"),
            "name": project_data.get("name", "Untitled"),
            "description": project_data.get("description", ""),
            "workspace": project_data.get("workspace", {}),
            "pythonCode": project_data.get("pythonCode", "")
        }
        
        cursor.execute('''
            INSERT INTO projects ("projectId", "userId", owner_id, "isSynced", timestamp, blockly_data)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        ''', (
            project_id,
            user_id,
            owner_id,
            is_synced,
            timestamp,
            json.dumps(blockly_data)
        ))
        
        inserted_id = cursor.fetchone()["id"]
        cursor.close()
        conn.close()
        return str(inserted_id)

    @staticmethod
    def update(project_id: str, user_id: str, data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        is_synced = data.get("isSynced")
        timestamp = data.get("timestamp")
        
        # Extract fields destined for the JSONB payload
        blockly_updates = {}
        for key in ["title", "name", "description", "workspace", "pythonCode"]:
            if key in data:
                blockly_updates[key] = data[key]
                
        set_clauses = []
        values = []
        
        if is_synced is not None:
            set_clauses.append('"isSynced" = %s')
            values.append(is_synced)
            
        if timestamp is not None:
            set_clauses.append('timestamp = %s')
            values.append(timestamp)
            
        if blockly_updates:
            # Safely merge updates into the JSONB object natively using PostgreSQL concatenation (||)
            set_clauses.append("blockly_data = blockly_data || %s::jsonb")
            values.append(json.dumps(blockly_updates))
                
        if not set_clauses:
            return None
            
        set_clause_str = ", ".join(set_clauses)
        
        try:
            p_id = int(project_id)
            query = f'UPDATE projects SET {set_clause_str} WHERE id = %s AND ("userId" = %s OR owner_id = %s)'
            values.extend([p_id, user_id, user_id])
        except ValueError:
            query = f'UPDATE projects SET {set_clause_str} WHERE "projectId" = %s AND ("userId" = %s OR owner_id = %s)'
            values.extend([project_id, user_id, user_id])
            
        cursor.execute(query, tuple(values))
        rowcount = cursor.rowcount
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def delete(project_id: str, user_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            p_id = int(project_id)
            query = 'DELETE FROM projects WHERE id = %s AND ("userId" = %s OR owner_id = %s)'
            cursor.execute(query, (p_id, user_id, user_id))
        except ValueError:
            query = 'DELETE FROM projects WHERE "projectId" = %s AND ("userId" = %s OR owner_id = %s)'
            cursor.execute(query, (project_id, user_id, user_id))
            
        rowcount = cursor.rowcount
        cursor.close()
        conn.close()
        return rowcount