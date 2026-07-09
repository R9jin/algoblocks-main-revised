import os
import logging
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

api_dir = Path(__file__).resolve().parent
env_path = api_dir / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(f"No DATABASE_URL found in environment variables. Please check your .env file at {env_path}.")

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        conn.autocommit = True
        return conn
    except Exception as e:
        logger.error(f"Error connecting to PostgreSQL Neon: {e}", exc_info=True)
        raise

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # RELATIONAL: Users Table for rigid credential management
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255),
            name VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            role VARCHAR(50) DEFAULT 'user',
            is_admin BOOLEAN DEFAULT FALSE
        )
    ''')

    # MIGRATION: the table above may already exist from before role/is_admin
    # were added (CREATE TABLE IF NOT EXISTS won't add columns to an existing
    # table). Every part of the app (login, signup, admin checks) reads/writes
    # these two columns, so without this the columns never exist in Neon and
    # no account can ever be recognized as an admin.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'user\'')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE')
    # Google-only accounts are inserted with password=None (see auth_service.google_login),
    # which violates a NOT NULL constraint on a table created before this fix.
    cursor.execute('ALTER TABLE users ALTER COLUMN password DROP NOT NULL')

    # HYBRID: Projects Table (Relational Sync/Keys + JSONB Blockly Data)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            "projectId" VARCHAR(255) UNIQUE NOT NULL,
            "userId" VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
            owner_id VARCHAR(255),
            "isSynced" BOOLEAN DEFAULT FALSE,
            timestamp BIGINT,
            blockly_data JSONB NOT NULL
        )
    ''')
    
    # HYBRID: Templates Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS templates (
            id SERIAL PRIMARY KEY,
            "templateId" VARCHAR(255) UNIQUE NOT NULL,
            category VARCHAR(255) NOT NULL,
            "userId" VARCHAR(255),
            owner_id VARCHAR(255),
            "isSynced" BOOLEAN DEFAULT FALSE,
            timestamp BIGINT,
            blockly_data JSONB NOT NULL
        )
    ''')
    
    # HYBRID: Progress & Assessments (Relational Identity + JSONB State)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS progress (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
            data JSONB DEFAULT '{}'
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assessments (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
            data JSONB DEFAULT '{}'
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id SERIAL PRIMARY KEY,
            "userId" VARCHAR(255),
            data JSONB NOT NULL
        )
    ''')
    
    cursor.close()
    conn.close()
    logger.info("Successfully connected to PostgreSQL Neon and verified hybrid tables.")
