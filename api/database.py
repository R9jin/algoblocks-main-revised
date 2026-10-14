# api/database.py
"""
PostgreSQL database connection pool and schema initialisation for the
AlgoBlocks API.

Provides:
- A thread-safe connection pool (``ThreadedConnectionPool`` with 1–10
  connections) backed by a custom ``PooledConnection`` subclass that
  returns connections to the pool on ``close()`` instead of destroying
  them.
- ``get_db_connection()`` — a liveness-checked pool checkout that silently
  discards and reconnects stale connections (needed when sitting behind
  Neon/PgBouncer, which can drop idle backends without the client's
  ``.closed`` flag ever reflecting it).
- ``init_db()`` — idempotent schema creation and migration, safe to call
  on every startup or cold start.
"""
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

# Thread-safe connection pool that hands connections back on close() instead
# of destroying them. Required because DATABASE_URL points at Neon's
# PgBouncer pooler endpoint, which can silently drop an idle backend
# connection without the client socket's ``.closed`` flag ever flipping to
# True. The liveness ping in get_db_connection() catches these stale
# connections and replaces them transparently.
class PooledConnection(psycopg2.extensions.connection):
    # Re-entrancy guard: when a connection needs to be truly closed rather
    # than returned to the pool (over capacity, or discarded as dead),
    # something calls conn.close() on it — which is *this* method — and
    # without this guard that would just try to hand it back to the pool
    # again. Setting this flag first makes close() do a real close instead.
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
    """
    Checks out a liveness-verified connection from the pool.

    ``autocommit`` is set to ``True`` before the liveness ping so that
    the ping itself does not open an implicit transaction (psycopg2
    connections default to ``autocommit=False``, and Postgres rejects
    ``SET SESSION`` commands issued while a transaction is already open).
    If the ping fails the stale connection is discarded and a fresh one
    is checked out in its place.

    Returns:
        An open ``PooledConnection`` in autocommit mode.

    Raises:
        psycopg2.OperationalError: If a new connection cannot be established.
    """
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
    """
    Creates or migrates all database tables required by the AlgoBlocks API.

    Safe to call on every startup: CREATE TABLE IF NOT EXISTS and ALTER TABLE
    ADD COLUMN IF NOT EXISTS never drop or overwrite existing data. Tables
    that existed before normalization (progress and assessments stored as a
    single per-user JSONB blob) are renamed to ``*_legacy`` and the data is
    backfilled into the new normalized shape.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table: stores credentials and account metadata.
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

    # The table above may already exist from before role/is_admin were added
    # (CREATE TABLE IF NOT EXISTS does not add columns to an existing table).
    # Every part of the app (login, signup, admin checks) reads/writes these
    # two columns, so they must exist in Neon for admin recognition to work.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'user\'')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE')
    # Google-only accounts are inserted with password=None (see
    # auth_service.google_login), which violates a NOT NULL constraint on
    # tables created before this change.
    cursor.execute('ALTER TABLE users ALTER COLUMN password DROP NOT NULL')

    # Forgot-password flow: store only a hash of the reset token (never the raw token)
    # plus its expiry, so a leaked database never exposes a usable token.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255)')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ')
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT '{}'::jsonb")

    # Email verification: new columns are added with DEFAULT TRUE so every
    # account that already exists is grandfathered in as verified and never
    # locked out. The default is then flipped to FALSE so every new account
    # from this point on starts as unverified. Signup explicitly sets
    # is_verified=False; Google SSO accounts are inserted as already-verified
    # since Google confirms the address as part of its OAuth flow. Only the
    # hash of the verification token is ever persisted, matching the
    # password-reset-token pattern.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE')
    cursor.execute('ALTER TABLE users ALTER COLUMN is_verified SET DEFAULT FALSE')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(255)')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ')

    # Per-account brute-force lockout: ``failed_login_attempts`` counts
    # consecutive bad passwords; a successful login resets it to 0.
    # ``locked_until`` blocks login (even with the correct password) until it
    # passes. ``last_failed_login_at`` is used to reset the counter after
    # a quiet period so scattered typos never accumulate into a lockout.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ')
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ')

    # JWT revocation via token_version: every token carries the account's
    # ``token_version`` as its ``tv`` claim at mint time. Bumping this column
    # instantly invalidates every previously issued token without needing a
    # growing block-list table. See AuthService.login, reset_password, and
    # logout_all_sessions.
    cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0')

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
    # The ``progress`` and ``assessments`` tables use a normalized schema:
    # one row per (user, lesson) and one row per (user, assessment), rather
    # than a single per-user JSONB blob. If an older deployment still has the
    # JSONB-shaped tables, they are renamed to ``*_legacy`` and the new
    # shape is created under the original name. Data is then backfilled from
    # the legacy table. This migration is idempotent and never drops
    # anything automatically.
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

    # assessments: one row per (user, assessment). ``answers`` stays JSONB
    # since it is a genuinely variable question-id -> answer map; all other
    # fields are typed columns so two previously conflicting write paths
    # (update_assessment vs. sync_assessment) now share one consistent set
    # of columns.
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

    # ``answers`` (question-id -> selected-option map) and ``question_ids``
    # (the shuffled question order for that attempt) are required together
    # to reconstruct item-level results: ``answers`` is a positional map
    # keyed to the shuffled order, and is meaningless without ``question_ids``
    # to anchor each position back to a stable question ID.
    cursor.execute('ALTER TABLE assessments ADD COLUMN IF NOT EXISTS question_ids JSONB')

    _backfill_progress_from_legacy(cursor)
    _backfill_assessments_from_legacy(cursor)

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id SERIAL PRIMARY KEY,
            "userId" VARCHAR(255),
            data JSONB NOT NULL
        )
    ''')

    # Structural fixes applied after schema review:
    #
    # ``templates.userId`` and ``submissions.userId`` were plain VARCHAR
    # columns with no FK, unlike ``projects.userId``/``progress.email``/
    # ``assessments.email`` which all reference users(email). Every write
    # path already populates them with the authenticated user's email, so
    # formalising that as a real FK is safe. Added as NOT VALID so it does
    # not fail startup if any pre-existing row is orphaned/stale — new
    # rows are still enforced immediately.
    #
    # Explicit indexes are added for all FK/lookup columns since Postgres
    # does not automatically index the referencing side. Every column below
    # is filtered on in a hot query path. progress/assessments already get
    # a leading-column email index for free from their UNIQUE constraint.
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
            question_ids = entry.get("questionIds")
            try:
                cursor.execute('''
                    INSERT INTO assessments (
                        email, assessment_key, score, max_score, correct, total,
                        time_elapsed, completed_at, completed, passed, attempts,
                        is_synced, client_timestamp, answers, question_ids
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    json.dumps(question_ids) if question_ids is not None else None,
                ))
                migrated += 1
            except Exception as e:
                # e.g. an FK violation because this email no longer exists
                # in `users`. Skip it rather than aborting the whole startup
                # migration over one bad legacy row.
                logger.warning(f"Skipped legacy assessment row (email={email}, key={key}): {e}")
    logger.info(f"Migration: backfilled {migrated} assessment rows from assessments_legacy.")
