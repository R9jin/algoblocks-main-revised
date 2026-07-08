from database import get_db_connection
import json

class UserRepository:
    @staticmethod
    def find_by_email(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch relational user data
        cursor.execute('SELECT id, name, email, password, status, role, is_admin FROM users WHERE email = %s', (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            conn.close()
            return None
            
        user_dict = dict(user)
        
        # Fetch associated JSONB progress
        cursor.execute('SELECT data FROM progress WHERE email = %s', (email,))
        progress_row = cursor.fetchone()
        user_dict["progress"] = progress_row["data"] if progress_row else {}
        
        # Fetch associated JSONB assessments
        cursor.execute('SELECT data FROM assessments WHERE email = %s', (email,))
        assessment_row = cursor.fetchone()
        user_dict["assessments"] = assessment_row["data"] if assessment_row else {}
        
        cursor.close()
        conn.close()
        return user_dict

    @staticmethod
    def insert(user_data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Insert strict relational data
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
        
        # 2. Initialize JSONB tracker tables
        email = user_data.get("email")
        progress = user_data.get("progress", {})
        assessments = user_data.get("assessments", {})
        
        cursor.execute('INSERT INTO progress (email, data) VALUES (%s, %s)', (email, json.dumps(progress)))
        cursor.execute('INSERT INTO assessments (email, data) VALUES (%s, %s)', (email, json.dumps(assessments)))
        
        cursor.close()
        conn.close()
        return str(inserted_id)

    @staticmethod
    def update_progress(email: str, lesson_id: str, score: int):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ensure row exists
        cursor.execute('INSERT INTO progress (email, data) VALUES (%s, %s) ON CONFLICT DO NOTHING', (email, '{}'))
        
        cursor.execute('''
            UPDATE progress 
            SET data = jsonb_set(data, %s, %s, true)
            WHERE email = %s
        ''', (f'{{{lesson_id}}}', json.dumps(score), email))
        
        cursor.close()
        conn.close()

    @staticmethod
    def update_assessment(email: str, assessment_key: str, data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ensure row exists
        cursor.execute('INSERT INTO assessments (email, data) VALUES (%s, %s) ON CONFLICT DO NOTHING', (email, '{}'))
        
        cursor.execute('''
            UPDATE assessments 
            SET data = jsonb_set(data, %s, %s, true)
            WHERE email = %s
        ''', (f'{{{assessment_key}}}', json.dumps(data), email))
        
        cursor.close()
        conn.close()
        
    @staticmethod
    def find_all_users():
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Join the relational table with the JSONB tracker tables
        cursor.execute('''
            SELECT u.name, u.email, u.status, u.role, u.is_admin,
                   COALESCE(p.data, '{}'::jsonb) as progress,
                   COALESCE(a.data, '{}'::jsonb) as assessments
            FROM users u
            LEFT JOIN progress p ON u.email = p.email
            LEFT JOIN assessments a ON u.email = a.email
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
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def delete_user(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        # Due to ON DELETE CASCADE in the table creation, this will also wipe progress and assessments
        cursor.execute('DELETE FROM users WHERE email = %s', (email,))
        rowcount = cursor.rowcount
        cursor.close()
        conn.close()
        return rowcount