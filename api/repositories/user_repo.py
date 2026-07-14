from database import get_db_connection
import json

class UserRepository:
    @staticmethod
    def find_by_email(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, name, email, password, status, role, is_admin, onboarding_state FROM users WHERE email = %s', (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            conn.close()
            return None
            
        user_dict = dict(user)
        
        cursor.execute('SELECT data FROM progress WHERE email = %s LIMIT 1', (email,))
        progress_row = cursor.fetchone()
        user_dict["progress"] = progress_row["data"] if progress_row else {}
        
        cursor.execute('SELECT data FROM assessments WHERE email = %s LIMIT 1', (email,))
        assessment_row = cursor.fetchone()
        user_dict["assessments"] = assessment_row["data"] if assessment_row else {}
        user_dict["onboarding_state"] = user_dict.get("onboarding_state") or {}
        
        cursor.close()
        conn.close()
        return user_dict

    @staticmethod
    def insert(user_data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        is_admin = user_data.get("isAdmin", user_data.get("is_admin", False))
        cursor.execute('''
            INSERT INTO users (name, email, password, status, role, is_admin)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        ''', (
            user_data.get("name"),
            user_data.get("email"),
            user_data.get("password"),
            user_data.get("status", "active"),
            user_data.get("role", "user"),
            is_admin
        ))
        inserted_id = cursor.fetchone()["id"]
        
        email = user_data.get("email")
        progress = user_data.get("progress", {})
        assessments = user_data.get("assessments", {})
        
        cursor.execute('INSERT INTO progress (email, data) VALUES (%s, %s)', (email, json.dumps(progress)))
        cursor.execute('INSERT INTO assessments (email, data) VALUES (%s, %s)', (email, json.dumps(assessments)))
        
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return str(inserted_id)

    @staticmethod
    def update_progress(email: str, lesson_id: str, score: int):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE progress 
            SET data = jsonb_set(data, %s, %s, true)
            WHERE email = %s
        ''', (f'{{{lesson_id}}}', json.dumps(score), email))
        
        if cursor.rowcount == 0:
            cursor.execute('INSERT INTO progress (email, data) VALUES (%s, %s)', (email, json.dumps({lesson_id: score})))
            
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()

    @staticmethod
    def update_assessment(email: str, assessment_key: str, data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE assessments 
            SET data = jsonb_set(data, %s, %s, true)
            WHERE email = %s
        ''', (f'{{{assessment_key}}}', json.dumps(data), email))
        
        if cursor.rowcount == 0:
             cursor.execute('INSERT INTO assessments (email, data) VALUES (%s, %s)', (email, json.dumps({assessment_key: data})))
             
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        
    @staticmethod
    def find_all_users():
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, name, email, status, role, is_admin
            FROM users
        ''')
        users = cursor.fetchall()
        
        cursor.close()
        conn.close()
        return [dict(u) for u in users]

    @staticmethod
    def update_user_status(email: str, status: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET status = %s WHERE email = %s', (status, email))
        rowcount = cursor.rowcount
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def delete_user(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE email = %s', (email,))
        rowcount = cursor.rowcount
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def set_reset_token(email: str, token_hash: str, expires_at):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET reset_token_hash = %s, reset_token_expires = %s WHERE email = %s
        ''', (token_hash, expires_at, email))
        conn.commit()
        cursor.close()
        conn.close()

    @staticmethod
    def find_by_reset_token_hash(token_hash: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, email, reset_token_expires
            FROM users
            WHERE reset_token_hash = %s
        ''', (token_hash,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return dict(user) if user else None

    @staticmethod
    def clear_reset_token(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE email = %s
        ''', (email,))
        conn.commit()
        cursor.close()
        conn.close()

    @staticmethod
    def update_password(email: str, hashed_password: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET password = %s WHERE email = %s', (hashed_password, email))
        rowcount = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def update_onboarding_state(email: str, onboarding_state: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET onboarding_state = %s WHERE email = %s', (json.dumps(onboarding_state or {}), email))
        rowcount = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return rowcount