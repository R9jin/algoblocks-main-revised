# api/scripts/migrate_progress_assessments.py
"""
Standalone runner for the progress/assessments normalization migration.

The same migration also runs automatically on every app startup (see
database.init_db()), but this script lets you run it manually first --
against your real Neon DATABASE_URL -- so you can see exactly what it's
going to do and confirm the results before your next deploy triggers it
for you.

Usage:
    cd api
    python scripts/migrate_progress_assessments.py            # run it
    python scripts/migrate_progress_assessments.py --dry-run  # just report

What it does:
  1. If `progress`/`assessments` are still the old single-JSONB-blob shape
     (one row per user, a `data` column), renames them to
     `progress_legacy` / `assessments_legacy`. Nothing is dropped.
  2. Creates the new normalized `progress` (one row per user+lesson) and
     `assessments` (one row per user+assessment) tables.
  3. Backfills the new tables from the *_legacy tables.
  4. Prints a before/after row-count summary so you can sanity check it.

Safe to re-run: every step is idempotent (same guarantees as init_db()).
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database  # noqa: E402


def _count(cursor, table_name: str) -> int:
    if not database._table_exists(cursor, table_name):
        return 0
    cursor.execute(f"SELECT COUNT(*) AS c FROM {table_name}")
    return cursor.fetchone()["c"]


def main():
    dry_run = "--dry-run" in sys.argv

    conn = database.get_db_connection()
    cursor = conn.cursor()

    print("=== BEFORE ===")
    before = {
        "progress": _count(cursor, "progress"),
        "assessments": _count(cursor, "assessments"),
        "progress_legacy": _count(cursor, "progress_legacy"),
        "assessments_legacy": _count(cursor, "assessments_legacy"),
    }
    for k, v in before.items():
        print(f"  {k}: {v} rows")

    if dry_run:
        print("\n--dry-run passed: no changes made. Remove the flag to actually migrate.")
        cursor.close()
        conn.close()
        return

    print("\nRunning migration (same logic as database.init_db())...")
    database.init_db()

    conn = database.get_db_connection()
    cursor = conn.cursor()
    print("\n=== AFTER ===")
    after = {
        "progress": _count(cursor, "progress"),
        "assessments": _count(cursor, "assessments"),
        "progress_legacy": _count(cursor, "progress_legacy"),
        "assessments_legacy": _count(cursor, "assessments_legacy"),
    }
    for k, v in after.items():
        print(f"  {k}: {v} rows")

    cursor.close()
    conn.close()

    print(
        "\nDone. `progress_legacy` / `assessments_legacy` still hold the "
        "original JSONB data as a safety net -- nothing was dropped. Once "
        "you've verified the app works correctly against the new tables, "
        "you can drop them manually:\n"
        "  DROP TABLE progress_legacy;\n"
        "  DROP TABLE assessments_legacy;"
    )


if __name__ == "__main__":
    main()
