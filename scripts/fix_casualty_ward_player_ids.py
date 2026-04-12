#!/usr/bin/env python3
"""
Fix missing player_id values in the casualty_ward table.

Matches unresolved entries (player_id IS NULL) against the players table by
normalised full name + team_code, then backfills player_id for any matches found.

Entries that can't be matched (name doesn't exist in players table) are reported
but left unchanged — they require manual intervention.

Usage:
  # Preview what would be fixed (no changes made):
  python scripts/fix_casualty_ward_player_ids.py

  # Apply fixes to production:
  python scripts/fix_casualty_ward_player_ids.py --apply

  # Target staging instead:
  python scripts/fix_casualty_ward_player_ids.py --env staging
  python scripts/fix_casualty_ward_player_ids.py --env staging --apply
"""

import argparse
import json
import subprocess
import sys

DB_NAMES = {
    "production": "nrl-data-production",
    "staging":    "nrl-data-staging",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def wrangler_execute(db_name: str, sql: str) -> list[dict]:
    """Run SQL against a D1 database via wrangler and return result rows."""
    result = subprocess.run(
        [
            "npx", "wrangler", "d1", "execute", db_name,
            "--remote", "--json",
            "--command", sql,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"wrangler error:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(result.stdout)
        return data[0].get("results", [])
    except (json.JSONDecodeError, IndexError, KeyError) as e:
        print(f"Failed to parse wrangler output: {e}\n{result.stdout}", file=sys.stderr)
        sys.exit(1)


def fmt_row(r: dict) -> str:
    end = r.get("end_date") or "open"
    return (
        f"  ID {r['id']:>4}  "
        f"{r['player_name']:<28}  "
        f"{r['team_code']:<4}  "
        f"{r['injury']:<25}  "
        f"{r['start_date']}  →  {end}"
    )

# ── SQL ───────────────────────────────────────────────────────────────────────

RESOLVABLE_SQL = """
    SELECT
        cw.id,
        cw.first_name || ' ' || cw.last_name AS player_name,
        cw.team_code,
        cw.injury,
        cw.start_date,
        cw.end_date,
        p.id AS resolved_player_id
    FROM casualty_ward cw
    JOIN players p
        ON  LOWER(TRIM(p.name))      = LOWER(TRIM(cw.first_name || ' ' || cw.last_name))
        AND p.team_code              = cw.team_code
    WHERE cw.player_id IS NULL
    ORDER BY cw.start_date DESC
"""

UNRESOLVABLE_SQL = """
    SELECT
        cw.id,
        cw.first_name || ' ' || cw.last_name AS player_name,
        cw.team_code,
        cw.injury,
        cw.start_date,
        cw.end_date
    FROM casualty_ward cw
    WHERE cw.player_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM players p
          WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(cw.first_name || ' ' || cw.last_name))
            AND p.team_code         = cw.team_code
      )
    ORDER BY cw.start_date DESC
"""

UPDATE_SQL = """
    UPDATE casualty_ward
    SET
        player_id  = (
            SELECT p.id FROM players p
            WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(casualty_ward.first_name || ' ' || casualty_ward.last_name))
              AND p.team_code         = casualty_ward.team_code
            LIMIT 1
        ),
        updated_at = datetime('now')
    WHERE player_id IS NULL
      AND EXISTS (
          SELECT 1 FROM players p
          WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(casualty_ward.first_name || ' ' || casualty_ward.last_name))
            AND p.team_code         = casualty_ward.team_code
      )
"""

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fix missing player_id values in the casualty_ward table."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply fixes (default: dry run — preview only)",
    )
    parser.add_argument(
        "--env",
        default="production",
        choices=list(DB_NAMES),
        help="Target environment (default: production)",
    )
    args = parser.parse_args()

    db_name = DB_NAMES[args.env]
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"Database : {db_name}")
    print(f"Mode     : {mode}")
    print()

    # 1. Find entries that CAN be resolved
    resolvable = wrangler_execute(db_name, RESOLVABLE_SQL)

    if resolvable:
        print(f"Resolvable ({len(resolvable)} {'entry' if len(resolvable) == 1 else 'entries'}):")
        for r in resolvable:
            end = r.get("end_date") or "open"
            print(
                f"  ID {r['id']:>4}  "
                f"{r['player_name']:<28}  "
                f"{r['team_code']:<4}  "
                f"{r['injury']:<25}  "
                f"{r['start_date']}  →  {end}"
                f"  →  player_id: {r['resolved_player_id']}"
            )
    else:
        print("Resolvable: none")

    # 2. Find entries that CANNOT be resolved (no name match in players table)
    unresolvable = wrangler_execute(db_name, UNRESOLVABLE_SQL)

    if unresolvable:
        print(f"\nUnresolvable ({len(unresolvable)} — no matching player row):")
        for r in unresolvable:
            end = r.get("end_date") or "open"
            print(
                f"  ID {r['id']:>4}  "
                f"{r['player_name']:<28}  "
                f"{r['team_code']:<4}  "
                f"{r['injury']:<25}  "
                f"{r['start_date']}  →  {end}"
            )
        print("  These require manual resolution (player may be listed under a different name).")

    # 3. Apply or summarise
    if not resolvable:
        print("\nNothing to fix.")
        return

    if not args.apply:
        print(f"\nDry run complete — no changes made.")
        print(f"Re-run with --apply to backfill {len(resolvable)} player_id value(s).")
        return

    print(f"\nApplying fixes...")
    wrangler_execute(db_name, UPDATE_SQL)
    print(f"Done. {len(resolvable)} casualty_ward {'entry' if len(resolvable) == 1 else 'entries'} updated.")


if __name__ == "__main__":
    main()
