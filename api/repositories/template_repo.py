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
    def _unpack(rows):
        result = []
        for tpl in rows:
            t = dict(tpl)
            # Unpack blockly_data back to root
            blockly_data = t.pop("blockly_data", {})
            t.update(blockly_data)
            t["_id"] = str(t["id"])
            result.append(t)
        return result

    @staticmethod
    def find_by_category(category: str, user_id: str):
        # SECURITY: only ever return the requesting user's own templates. This
        # used to return every account's templates (code + workspace) to anyone.
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM templates WHERE category = %s AND ("userId" = %s OR owner_id = %s)',
            (category, user_id, user_id)
        )
        templates = cursor.fetchall()
        cursor.close()
        conn.close()
        return TemplateRepository._unpack(templates)

    @staticmethod
    def find_all(user_id: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM templates WHERE "userId" = %s OR owner_id = %s',
            (user_id, user_id)
        )
        templates = cursor.fetchall()
        cursor.close()
        conn.close()
        return TemplateRepository._unpack(templates)

    @staticmethod
    def delete(template_id: str, user_id: str) -> int:
        """Delete one of the user's own templates. Accepts the numeric row id,
        the canonical templateId, or the clientId. Returns the deleted row
        count. Previously there was no delete at all, so templates could never
        be removed (they kept counting toward the 20-template cap and came
        back on every pull)."""
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            try:
                t_id = int(template_id)
                cursor.execute(
                    'DELETE FROM templates WHERE id = %s AND ("userId" = %s OR owner_id = %s)',
                    (t_id, user_id, user_id)
                )
            except ValueError:
                cursor.execute(
                    'DELETE FROM templates WHERE ("templateId" = %s OR "clientId" = %s) AND ("userId" = %s OR owner_id = %s)',
                    (template_id, template_id, user_id, user_id)
                )
            return cursor.rowcount
        finally:
            cursor.close()
            conn.close()

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
            INSERT INTO templates ("templateId", category, "userId", owner_id, "isSynced", timestamp, blockly_data, "clientId")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        ''', (
            template_id,
            category,
            user_id,
            owner_id,
            is_synced,
            timestamp,
            json.dumps(blockly_data),
            template_data.get("clientId")
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

        Returns {"id", "templateId", "duplicate"} for the new (or already-existing,
        when ``clientId`` matches) template, or None if the user is already
        at/over the limit (nothing is inserted in that case).
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

            blockly_data = {
                "title": template_data.get("title", "Untitled Template"),
                "name": template_data.get("name", "Untitled Template"),
                "description": template_data.get("description", ""),
                "workspace": template_data.get("workspace", {}),
                "pythonCode": template_data.get("pythonCode", "")
            }
            category = template_data.get("category", "Custom")
            timestamp = template_data.get("timestamp", 0)
            client_id = template_data.get("clientId")

            # IDEMPOTENCY: a re-send of the same local template (retry, double
            # fire, refresh mid-request) returns the row that already exists --
            # refreshed with the newest content -- instead of inserting another
            # copy. Checked before the limit so it is never rejected as "limit
            # reached". See ProjectRepository.insert_if_under_limit.
            if client_id:
                cursor.execute(
                    'SELECT id, "templateId", timestamp FROM templates WHERE "userId" = %s AND "clientId" = %s',
                    (user_id, client_id)
                )
                existing = cursor.fetchone()
                if existing:
                    if timestamp is not None and timestamp >= (existing["timestamp"] or 0):
                        cursor.execute(
                            'UPDATE templates SET blockly_data = %s::jsonb, category = %s, timestamp = %s, "isSynced" = TRUE WHERE id = %s',
                            (json.dumps(blockly_data), category, timestamp, existing["id"])
                        )
                    conn.commit()
                    return {"id": str(existing["id"]), "templateId": existing["templateId"], "duplicate": True}

            if current_count >= max_allowed:
                conn.rollback()
                return None

            template_id = template_data.get("templateId")
            if not template_id or str(template_id).startswith("local_"):
                template_id = str(uuid.uuid4())

            is_synced = template_data.get("isSynced", False)

            cursor.execute('''
                INSERT INTO templates ("templateId", category, "userId", owner_id, "isSynced", timestamp, blockly_data, "clientId")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            ''', (
                template_id,
                category,
                user_id,
                owner_id,
                is_synced,
                timestamp,
                json.dumps(blockly_data),
                client_id
            ))

            inserted_id = cursor.fetchone()["id"]
            conn.commit()
            return {"id": str(inserted_id), "templateId": template_id, "duplicate": False}
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