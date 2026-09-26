# api/repositories/template_repo.py
from database import get_db_connection
import json
import uuid

class TemplateRepository:
    @staticmethod
    def count_by_user(user_id: str) -> int:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) AS count FROM templates WHERE "userId" = %s OR owner_id = %s', (user_id, user_id))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row["count"] if row else 0

    @staticmethod
    def find_by_category(category: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM templates WHERE category = %s', (category,))
        templates = cursor.fetchall()
        cursor.close()
        conn.close()
        
        result = []
        for tpl in templates:
            t = dict(tpl)
            # Unpack blockly_data back to root
            blockly_data = t.pop("blockly_data", {})
            t.update(blockly_data)
            t["_id"] = str(t["id"])
            result.append(t)
        return result

    @staticmethod
    def find_all():
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM templates')
        templates = cursor.fetchall()
        cursor.close()
        conn.close()
        
        result = []
        for tpl in templates:
            t = dict(tpl)
            blockly_data = t.pop("blockly_data", {})
            t.update(blockly_data)
            t["_id"] = str(t["id"])
            result.append(t)
        return result

    @staticmethod
    def save(template_data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        template_id = template_data.get("templateId")
        
        # Generate a safe UUID if the frontend stripped the ID or sent a local temp ID
        if not template_id or str(template_id).startswith("local_"):
            template_id = str(uuid.uuid4())
            
        category = template_data.get("category", "Custom")
        user_id = template_data.get("userId")
        owner_id = template_data.get("owner_id", user_id)
        is_synced = template_data.get("isSynced", False)
        timestamp = template_data.get("timestamp", 0)
        
        # Package blockly and metadata into JSONB
        blockly_data = {
            "title": template_data.get("title", "Untitled Template"),
            "name": template_data.get("name", "Untitled Template"),
            "description": template_data.get("description", ""),
            "workspace": template_data.get("workspace", {}),
            "pythonCode": template_data.get("pythonCode", "")
        }
        
        cursor.execute('''
            INSERT INTO templates ("templateId", category, "userId", owner_id, "isSynced", timestamp, blockly_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        ''', (
            template_id,
            category,
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
    def save_if_under_limit(template_data: dict, max_allowed: int):
        """Atomically check the per-user template count and insert, all
        inside one real (non-autocommit) transaction serialized by a
        Postgres advisory lock keyed on the user. See
        ProjectRepository.insert_if_under_limit for why this is necessary:
        a separate count-then-insert (each its own autocommit statement)
        lets concurrent/rapid-fire saves race past the cap.

        Returns the new template's id, or None if the user is already at/
        over the limit (nothing is inserted in that case).
        """
        conn = get_db_connection()
        conn.autocommit = False
        cursor = conn.cursor()
        try:
            user_id = template_data.get("userId")
            owner_id = template_data.get("owner_id", user_id)

            cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (user_id,))

            cursor.execute(
                'SELECT COUNT(*) AS count FROM templates WHERE "userId" = %s OR owner_id = %s',
                (user_id, user_id)
            )
            current_count = cursor.fetchone()["count"]

            if current_count >= max_allowed:
                conn.rollback()
                return None

            template_id = template_data.get("templateId")
            if not template_id or str(template_id).startswith("local_"):
                template_id = str(uuid.uuid4())

            category = template_data.get("category", "Custom")
            is_synced = template_data.get("isSynced", False)
            timestamp = template_data.get("timestamp", 0)

            blockly_data = {
                "title": template_data.get("title", "Untitled Template"),
                "name": template_data.get("name", "Untitled Template"),
                "description": template_data.get("description", ""),
                "workspace": template_data.get("workspace", {}),
                "pythonCode": template_data.get("pythonCode", "")
            }

            cursor.execute('''
                INSERT INTO templates ("templateId", category, "userId", owner_id, "isSynced", timestamp, blockly_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
            ''', (
                template_id,
                category,
                user_id,
                owner_id,
                is_synced,
                timestamp,
                json.dumps(blockly_data)
            ))

            inserted_id = cursor.fetchone()["id"]
            conn.commit()
            return str(inserted_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()

    @staticmethod
    def update(template_id: str, template_data: dict, user_id: str = None):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # SECURITY FIX: scope the lookup to templates owned by the requesting
        # user. Previously this looked up by id/templateId alone, so any
        # authenticated user could pass another user's (or a shared/curated)
        # templateId and overwrite its contents -- an IDOR / broken access
        # control bug (no different from the fixed project update, which has
        # always required "userId" = %s OR owner_id = %s).
        try:
            t_id = int(template_id)
            if user_id:
                cursor.execute(
                    'SELECT id, blockly_data FROM templates WHERE id = %s AND ("userId" = %s OR owner_id = %s)',
                    (t_id, user_id, user_id)
                )
            else:
                cursor.execute('SELECT id, blockly_data FROM templates WHERE id = %s', (t_id,))
        except ValueError:
            if user_id:
                cursor.execute(
                    'SELECT id, blockly_data FROM templates WHERE "templateId" = %s AND ("userId" = %s OR owner_id = %s)',
                    (template_id, user_id, user_id)
                )
            else:
                cursor.execute('SELECT id, blockly_data FROM templates WHERE "templateId" = %s', (template_id,))
            
        existing = cursor.fetchone()
        
        if not existing and user_id:
            # It might still exist, just owned by someone else -- check
            # without the ownership filter so we can refuse (403) instead of
            # falling through to save() below, which would otherwise attempt
            # an INSERT with a templateId that already exists and fail with
            # an unhandled duplicate-key DB error.
            try:
                t_id = int(template_id)
                cursor.execute('SELECT id FROM templates WHERE id = %s', (t_id,))
            except ValueError:
                cursor.execute('SELECT id FROM templates WHERE "templateId" = %s', (template_id,))
            if cursor.fetchone():
                cursor.close()
                conn.close()
                return None
        
        if existing:
            blockly_updates = {}
            for key in ["title", "name", "description", "workspace", "pythonCode"]:
                if key in template_data:
                    blockly_updates[key] = template_data[key]
                    
            set_clauses = []
            values = []
            
            if "category" in template_data:
                set_clauses.append("category = %s")
                values.append(template_data["category"])
            if "isSynced" in template_data:
                set_clauses.append('"isSynced" = %s')
                values.append(template_data["isSynced"])
            if "timestamp" in template_data:
                set_clauses.append("timestamp = %s")
                values.append(template_data["timestamp"])
                
            if blockly_updates:
                # BUG FIX: previously this appended one
                # "blockly_data = jsonb_set(...)" SET-clause per changed key,
                # so updating >=2 of these fields in the same save (e.g.
                # renaming a template while also saving new blocks) produced
                # "SET blockly_data = ..., blockly_data = ..." -- Postgres
                # rejects multiple assignments to the same column outright,
                # so the whole save failed with a DB error. Nest the
                # jsonb_set() calls into a single expression/assignment
                # instead so any number of keys can be updated atomically.
                expr = "blockly_data"
                jsonb_params = []
                for key, val in blockly_updates.items():
                    expr = f"jsonb_set({expr}, %s, %s, true)"
                    jsonb_params.extend([f'{{{key}}}', json.dumps(val)])
                set_clauses.append(f"blockly_data = {expr}")
                values.extend(jsonb_params)
                
            if set_clauses:
                set_clause_str = ", ".join(set_clauses)
                query = f'UPDATE templates SET {set_clause_str} WHERE id = %s'
                values.append(existing["id"])
                cursor.execute(query, tuple(values))
                
            cursor.close()
            conn.close()
            return str(existing["id"])
        else:
            cursor.close()
            conn.close()
            # If not found, insert
            return TemplateRepository.save(template_data)