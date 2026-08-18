import os
import json
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

import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

api_dir = Path(__file__).resolve().parent
env_path = api_dir / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(f"No DATABASE_URL found in environment variables. Please check your .env file at {env_path}.")

# PERFORMANCE FIX: every call to get_db_connection() used to open a brand
# new TCP+TLS connection to Neon (ap-southeast-1) and tear it down again on
# close() -- that round trip is the actual bulk of "slow loading" on every
# page (login/signup/forgot-password each pay it once; dashboard/user-
# management/profile pay it 2-3x since they make several DB calls per
# request). A pool fixes that.
#
# This was tried once before and reverted: it broke password-reset emails,
# because DATABASE_URL points at Neon's own "-pooler" endpoint (PgBouncer),
# which can silently drop an idle backend connection without the client
# socket's `.closed` flag ever flipping to true -- so a stale connection
# would get handed back out looking fine, and the first real query on it
# (an infrequently-hit route like /forgot-password was most exposed to
# this) blew up with an unhandled 500 before anything else ran.
#
# The fix here isn't "don't pool" -- it's to stop trusting `.closed` and
# actually test the connection with a cheap `SELECT 1` before handing it
# to a caller, discarding and reconnecting if that fails. That's the
# standard pattern for anything sitting behind PgBouncer-style poolers.
class PooledConnection(psycopg2.extensions.connection):
    # Re-entrancy guard: when a connection needs to be truly closed rather
    # than pooled (over capacity, or discarded as dead), something calls
    # conn.close() on it -- which is *this* method -- and without this
    # guard that would just try to hand it back to the pool again. Setting
    # this flag first makes close() do a real close instead.
    _pool_return_in_progress = False

    def close(self):
        if self._pool_return_in_progress:
            self._pool_return_in_progress = False
            super().close()
            return

        pool = _get_pool()
        if pool is None or self.closed:
            super().close()
            return

        try:
            self._pool_return_in_progress = True
            pool.putconn(self)
        except Exception:
            self._pool_return_in_progress = False
            try:
                super().close()
            except Exception:
                pass


_connection_pool = None


def _get_pool():
    global _connection_pool
    if _connection_pool is None:
        # ThreadedConnectionPool: FastAPI runs our sync `def` route handlers
        # in a worker thread pool, so concurrent requests legitimately call
        # get_db_connection() from different threads at once.
        _connection_pool = psycopg2.pool.ThreadedConnectionPool(
            1, 10, DATABASE_URL,
            cursor_factory=RealDictCursor,
            connection_factory=PooledConnection,
        )
    return _connection_pool


def _discard(conn):
    """Force a real close (bypassing the pool) for a connection we know is dead."""
    conn._pool_return_in_progress = True
    try:
        conn.close()
    except Exception:
        pass


def get_db_connection():
    try:
        pool = _get_pool()
        conn = pool.getconn()
        conn._pool_return_in_progress = False
        # autocommit must be set BEFORE anything runs a query on this
        # connection. psycopg2 connections default to autocommit=False,
        # so the liveness ping below would otherwise open an implicit
        # transaction -- and setting .autocommit afterward issues a
        # SET SESSION under the hood, which Postgres rejects while a
        # transaction is open ("set_session cannot be used inside a
        # transaction"). Setting it first keeps every statement,
        # including the ping itself, in autocommit mode.
        conn.autocommit = True

        try:
            if conn.closed:
                raise psycopg2.OperationalError("connection already closed")
            # Liveness ping -- this is what actually catches a Neon-side
            # idle drop that .closed alone would miss.
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        except Exception:
            _discard(conn)
            conn = pool.getconn()
            conn._pool_return_in_progress = False
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

    # Forgot-password flow: store only a hash of the reset token (never the raw token)
    # plus its expiry, so a leaked database never exposes a usable token.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255)')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ')
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT '{}'::jsonb")

    # SECURITY: email verification. New columns are added with DEFAULT TRUE
    # so every account that already exists (created before this feature
    # shipped) is grandfathered in as verified and is never locked out of
    # its own account. The default is then flipped to FALSE so every NEW
    # column value from this point on defaults to "not verified" -- signup
    # explicitly sets is_verified=False for freshly created accounts, and
    # Google-SSO accounts are inserted as already-verified (Google already
    # confirmed the address). Only the hash of the verification token is
    # ever persisted, mirroring the password-reset-token pattern above.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE')
    cursor.execute('ALTER TABLE users ALTER COLUMN is_verified SET DEFAULT FALSE')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(255)')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ')

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
    
    # ------------------------------------------------------------------
    # `progress` and `assessments` used to be ONE ROW PER USER holding a
    # JSONB blob (progress.data = {lesson_id: score}; assessments.data =
    # {assessment_key: {...}}). That's a poor fit: both are really a
    # one-to-many relationship (a user has many lesson-progress entries,
    # many assessment results) with a fixed, known shape per entry -- not
    # irregular data. JSONB should stay reserved for genuinely variable
    # structures (blockly_data, and `answers` below, which really is an
    # arbitrary question-id -> answer map). So these are now normalized:
    # one row per (user, lesson) / (user, assessment).
    #
    # If an older deployment still has the JSONB-shaped tables, rename them
    # out of the way first so CREATE TABLE below can establish the new
    # shape under the same name, then backfill from the renamed copy. This
    # is idempotent and safe to run on every startup: the rename only fires
    # once (guarded by "does a table named `data` column exist"), and the
    # backfill only fires while the new table is still empty. Nothing is
    # ever dropped automatically -- the old data survives under
    # `progress_legacy` / `assessments_legacy` as a rollback safety net.
    # ------------------------------------------------------------------
    _rename_if_legacy_jsonb_shape(cursor, "progress", "progress_legacy")
    _rename_if_legacy_jsonb_shape(cursor, "assessments", "assessments_legacy")

    # RELATIONAL: one row per (user, lesson)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS progress (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            lesson_id VARCHAR(255) NOT NULL,
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (email, lesson_id)
        )
    ''')

    # RELATIONAL: one row per (user, assessment). `answers` stays JSONB
    # since it's a genuinely variable question-id -> answer map; everything
    # else is a real typed column so the two write paths that used to
    # silently clobber each other's fields under one JSON key (see
    # auth_service.update_assessment vs. sync_assessment) now share one
    # consistent set of columns instead.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assessments (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            assessment_key VARCHAR(255) NOT NULL,
            score DOUBLE PRECISION,
            max_score DOUBLE PRECISION,
            correct INTEGER,
            total INTEGER,
            time_elapsed INTEGER,
            completed_at TEXT,
            completed BOOLEAN,
            passed BOOLEAN,
            attempts INTEGER DEFAULT 0,
            is_synced BOOLEAN DEFAULT TRUE,
            client_timestamp BIGINT,
            answers JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (email, assessment_key)
        )
    ''')

    _backfill_progress_from_legacy(cursor)
    _backfill_assessments_from_legacy(cursor)

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id SERIAL PRIMARY KEY,
            "userId" VARCHAR(255),
            data JSONB NOT NULL
        )
    ''')

    # ------------------------------------------------------------------
    # STRUCTURAL FIXES (added after schema review)
    #
    # `templates.userId` and `submissions.userId` were plain VARCHAR
    # columns with no FK, unlike `projects.userId`/`progress.email`/
    # `assessments.email` which all reference users(email). Every write
    # path already populates them with an authenticated user's email
    # (see template_router.save_template, auth_service.sync_submission),
    # so it's safe to formalize that as a real constraint. Added as
    # NOT VALID so it won't fail startup if any pre-existing row happens
    # to be orphaned/stale -- new rows are still enforced immediately.
    #
    # Postgres does not automatically index FK/lookup columns (only the
    # referenced side, e.g. users.email, is indexed via its UNIQUE
    # constraint). Every one of these columns is filtered on in a hot
    # query path (WHERE "userId" = ..., WHERE email = ...), so add
    # explicit indexes. (progress/assessments don't need separate email
    # indexes -- their UNIQUE(email, ...) constraint above already gives
    # email a leading-column index for free.)
    # ------------------------------------------------------------------
    _add_fk_if_missing(cursor, "templates_userid_fkey", "templates", "userId", "users", "email")
    _add_fk_if_missing(cursor, "submissions_userid_fkey", "submissions", "userId", "users", "email")

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_projects_userid ON projects("userId")')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_projects_ownerid ON projects(owner_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_templates_userid ON templates("userId")')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_templates_ownerid ON templates(owner_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_submissions_userid ON submissions("userId")')

    cursor.close()
    conn.close()
    logger.info("Successfully connected to PostgreSQL Neon and verified hybrid tables.")


def _constraint_exists(cursor, constraint_name: str, table_name: str) -> bool:
    cursor.execute('''
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = %s AND table_name = %s
    ''', (constraint_name, table_name))
    return cursor.fetchone() is not None


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute('SELECT 1 FROM information_schema.tables WHERE table_name = %s', (table_name,))
    return cursor.fetchone() is not None


def _table_has_column(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute('''
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    ''', (table_name, column_name))
    return cursor.fetchone() is not None


def _add_fk_if_missing(cursor, constraint_name: str, table: str, column: str,
                        ref_table: str, ref_column: str, on_delete: str = "CASCADE"):
    if _constraint_exists(cursor, constraint_name, table):
        return
    try:
        cursor.execute(f'''
            ALTER TABLE {table}
            ADD CONSTRAINT {constraint_name}
            FOREIGN KEY ("{column}") REFERENCES {ref_table}({ref_column})
            ON DELETE {on_delete} NOT VALID
        ''')
    except Exception as e:
        # Don't crash startup over a constraint that can't be added yet
        # (e.g. genuinely orphaned rows from before this fix existed).
        # Log it so it's visible and can be cleaned up manually.
        logger.warning(f"Could not add FK {constraint_name} on {table}.{column}: {e}")


def _rename_if_legacy_jsonb_shape(cursor, table_name: str, legacy_name: str):
    """If `table_name` still has the old single-JSONB-column shape (a `data`
    column), rename it to `legacy_name` so CREATE TABLE IF NOT EXISTS can
    establish the new normalized shape under the original name. No-op once
    already migrated, and never overwrites an existing legacy table."""
    if not _table_exists(cursor, table_name):
        return
    if not _table_has_column(cursor, table_name, "data"):
        return  # already the new normalized shape (or something else entirely)
    if _table_exists(cursor, legacy_name):
        return  # already migrated in a previous run
    cursor.execute(f'ALTER TABLE {table_name} RENAME TO {legacy_name}')
    logger.info(f"Migration: renamed legacy JSONB table `{table_name}` to `{legacy_name}`.")


def _backfill_progress_from_legacy(cursor):
    if not _table_exists(cursor, "progress_legacy"):
        return
    cursor.execute('SELECT COUNT(*) AS c FROM progress')
    if cursor.fetchone()["c"] > 0:
        return  # already backfilled (or has live data) -- don't touch it
    cursor.execute('SELECT email, data FROM progress_legacy')
    rows = cursor.fetchall()
    migrated = 0
    for row in rows:
        email, data = row["email"], row["data"] or {}
        if not isinstance(data, dict):
            continue
        for lesson_id, score in data.items():
            try:
                score_val = float(score)
            except (TypeError, ValueError):
                score_val = 0.0
            try:
                cursor.execute('''
                    INSERT INTO progress (email, lesson_id, score)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (email, lesson_id) DO NOTHING
                ''', (email, lesson_id, score_val))
                migrated += 1
            except Exception as e:
                # e.g. an FK violation because this email no longer exists
                # in `users`. Skip it rather than aborting the whole startup
                # migration over one bad legacy row.
                logger.warning(f"Skipped legacy progress row (email={email}, lesson_id={lesson_id}): {e}")
    logger.info(f"Migration: backfilled {migrated} progress rows from progress_legacy.")


def _backfill_assessments_from_legacy(cursor):
    if not _table_exists(cursor, "assessments_legacy"):
        return
    cursor.execute('SELECT COUNT(*) AS c FROM assessments')
    if cursor.fetchone()["c"] > 0:
        return  # already backfilled (or has live data) -- don't touch it
    cursor.execute('SELECT email, data FROM assessments_legacy')
    rows = cursor.fetchall()
    migrated = 0
    for row in rows:
        email, data = row["email"], row["data"] or {}
        if not isinstance(data, dict):
            continue
        for key, entry in data.items():
            if not isinstance(entry, dict):
                continue
            answers = entry.get("answers")
            try:
                cursor.execute('''
                    INSERT INTO assessments (
                        email, assessment_key, score, max_score, correct, total,
                        time_elapsed, completed_at, completed, passed, attempts,
                        is_synced, client_timestamp, answers
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email, assessment_key) DO NOTHING
                ''', (
                    email, key,
                    entry.get("score"), entry.get("maxScore"),
                    entry.get("correct"), entry.get("total"),
                    entry.get("timeElapsed"), entry.get("completedAt"),
                    entry.get("completed"), entry.get("passed"),
                    entry.get("attempts"), entry.get("isSynced"),
                    entry.get("timestamp"),
                    json.dumps(answers) if answers is not None else None,
                ))
                migrated += 1
            except Exception as e:
                # e.g. an FK violation because this email no longer exists
                # in `users`. Skip it rather than aborting the whole startup
                # migration over one bad legacy row.
                logger.warning(f"Skipped legacy assessment row (email={email}, key={key}): {e}")
    logger.info(f"Migration: backfilled {migrated} assessment rows from assessments_legacy.")
