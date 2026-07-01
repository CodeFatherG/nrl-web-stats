#!/usr/bin/env python3
"""
Sync the local wrangler dev database (DB binding) from production.

Exports the remote production database to a temporary SQL file and applies it
to the local wrangler dev D1 database, replacing all existing data cleanly.

Usage:
  # Preview what would happen (no changes made):
  python scripts/sync_prod_to_local.py

  # Apply: export prod and overwrite local dev database:
  python scripts/sync_prod_to_local.py --apply
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROD_DB_NAME = "nrl-data-production"
LOCAL_BINDING = "DB"

# ── Helpers ───────────────────────────────────────────────────────────────────

def run(args: list[str], step: str) -> None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"{step} failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    if result.stdout.strip():
        print(result.stdout.strip())


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync the local wrangler dev D1 database from production."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply the sync (default is dry-run).",
    )
    args = parser.parse_args()

    if not args.apply:
        print("DRY-RUN: no changes will be made. Would:")
        print(f"  1. Export {PROD_DB_NAME} (remote) to a temp SQL file")
        print(f"  2. Apply that file to the local {LOCAL_BINDING} database (wrangler dev)")
        print()
        print("Run with --apply to execute.")
        return

    tmp = tempfile.NamedTemporaryFile(suffix=".sql", prefix="nrl-prod-", delete=False)
    dump_path = tmp.name
    tmp.close()

    try:
        print(f"Exporting {PROD_DB_NAME} → {dump_path} ...")
        run(
            ["npx", "wrangler", "d1", "export", PROD_DB_NAME, "--env", "production", "--remote", "--output", dump_path],
            "wrangler d1 export",
        )

        size_kb = os.path.getsize(dump_path) / 1024
        print(f"Export complete ({size_kb:.1f} KB).")

        # Wrangler's dump includes CREATE TABLE d1_migrations without DROP TABLE,
        # so wipe the local D1 state first to avoid "table already exists" errors.
        local_d1_state = Path(".wrangler/state/v3/d1")
        if local_d1_state.exists():
            shutil.rmtree(local_d1_state)
            print("Cleared local D1 state.")

        print(f"Applying dump to local {LOCAL_BINDING} database ...")
        run(
            ["npx", "wrangler", "d1", "execute", LOCAL_BINDING, "--env", "staging", "--local", "--file", dump_path],
            "wrangler d1 execute",
        )

        print("Done. Local dev database is now in sync with production.")
    finally:
        os.unlink(dump_path)


if __name__ == "__main__":
    main()
