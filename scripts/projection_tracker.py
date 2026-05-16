#!/usr/bin/env python3
"""
NRL Supercoach Projection Accuracy Tracker

Captures player score projections before each round and actual scores after,
enabling week-by-week accuracy evaluation of the projection model.

IMPORTANT — retroactive projections are NOT possible:
  Projections are computed on-demand from all game data up to the current
  moment. Once a round's results are ingested, they shift the projection
  baseline for all future projections. There is no way to reconstruct what
  the model would have said before a round once that round is complete.

  Actual scores ARE retroactive: the API stores historical Supercoach scores
  for any completed round, so you can backfill actuals for past rounds.

Recommended weekly workflow:
  1. Saturday morning (before round starts):
       python scripts/projection_tracker.py capture-projections --year 2026 --round N

  2. Monday morning (after last match completes):
       python scripts/projection_tracker.py capture-actuals --year 2026 --round N

  3. Any time — accuracy report:
       python scripts/projection_tracker.py report --year 2026

Retroactive use (first time setup, actuals only):
  python scripts/projection_tracker.py backfill-actuals --year 2026 --from-round 1 --to-round 4

Output CSV columns:
  year, round, player_id, player_name, team_code, position,
  proj_total, proj_floor, proj_ceiling,
  proj_games_played, proj_low_sample_warning,
  actual_score,
  proj_captured_at, actual_captured_at
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.error

# ── Constants ─────────────────────────────────────────────────────────────────

NRL_TEAMS = [
    "BRO", "BUL", "CBR", "DOL", "GCT", "MEL", "MNL",
    "NEW", "NQC", "NZL", "PAR", "PTH", "SHA", "STG",
    "STH", "SYD", "WST",
]

CSV_COLUMNS = [
    "year", "round", "player_id", "player_name", "team_code", "position",
    "proj_total", "proj_floor", "proj_ceiling",
    "proj_games_played", "proj_low_sample_warning",
    "actual_score",
    "proj_captured_at", "actual_captured_at",
]

# ── CSV helpers ───────────────────────────────────────────────────────────────

def csv_path(data_dir: Path, year: int) -> Path:
    return data_dir / f"projection_tracking_{year}.csv"


def load_csv(path: Path) -> dict[tuple, dict]:
    """Return rows keyed by (year, round, player_id)."""
    rows: dict[tuple, dict] = {}
    if not path.exists():
        return rows
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (row["year"], row["round"], row["player_id"])
            rows[key] = row
    return rows


def save_csv(path: Path, rows: dict[tuple, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(
            sorted(rows.values(), key=lambda r: (int(r["round"]), r["player_id"]))
        )

# ── API helper ────────────────────────────────────────────────────────────────

def api_get(base_url: str, path: str) -> dict | None:
    url = f"{base_url.rstrip('/')}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise RuntimeError(f"HTTP {e.code} for {url}: {e.reason}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach {url} — is the API running at {base_url}?\n  {e.reason}"
        ) from e

# ── Projection math ───────────────────────────────────────────────────────────

# Must match RECENCY_DECAY_FACTOR in src/analytics/player-projection-service.ts
RECENCY_DECAY_FACTOR = 0.85


def _percentile(data: list[float], p: float) -> float:
    """Linear-interpolation percentile — matches numpy's default behaviour."""
    n = len(data)
    if n == 0:
        return 0.0
    s = sorted(data)
    idx = (p / 100) * (n - 1)
    lo = int(idx)
    hi = lo + 1
    if hi >= n:
        return float(s[lo])
    return s[lo] + (idx - lo) * (s[hi] - s[lo])


def _exponential_weights(n: int) -> list[float]:
    """weights[0] = oldest (smallest), weights[n-1] = newest (1.0)."""
    if n == 0:
        return []
    return [RECENCY_DECAY_FACTOR ** (n - 1 - i) for i in range(n)]


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    total = sum(weights)
    if total == 0:
        return 0.0
    return sum(v * w for v, w in zip(values, weights)) / total


def _reconstruct(games: list[dict], target_round: int) -> dict | None:
    """
    Recompute projection stats from games played strictly before target_round
    using the same recency decay weighting as the TypeScript model.
    Percentiles remain unweighted — they characterise distribution shape.
    Returns None when there is no data (round 1, or player had no prior games).
    """
    eligible = [g for g in games if g["round"] < target_round]
    if not eligible:
        return None

    weights = _exponential_weights(len(eligible))
    floor_scores = [g["floorScore"] for g in eligible]
    spike_scores = [g["spikeScore"] for g in eligible]

    floor_mean = _weighted_mean(floor_scores, weights)
    spike_mean = _weighted_mean(spike_scores, weights)

    return {
        "proj_total": round(floor_mean + spike_mean, 2),
        "proj_floor": round(floor_mean + _percentile(spike_scores, 25), 2),
        "proj_ceiling": round(floor_mean + _percentile(spike_scores, 90), 2),
        "proj_games_played": len(eligible),
        "proj_low_sample_warning": len(eligible) < 6,
    }

# ── Commands ──────────────────────────────────────────────────────────────────

def capture_projections(base_url: str, data_dir: Path, year: int, round_num: int,
                        teams: list[str], overwrite: bool) -> None:
    """Fetch pre-round projections for all players across every team."""
    path = csv_path(data_dir, year)
    rows = load_csv(path)
    now = datetime.now(timezone.utc).isoformat()

    print(f"Capturing projections — {year} Round {round_num}")
    print("Run this BEFORE the round starts for accurate pre-round values.\n")

    total_captured = 0
    total_skipped = 0

    for team_code in teams:
        print(f"  {team_code}...", end=" ", flush=True)
        data = api_get(base_url, f"/api/supercoach/{year}/team/{team_code}/rankings?mode=composite")
        if data is None:
            print("not found")
            continue

        team_count = 0
        for ranked in data.get("rankedPlayers", []):
            profile = ranked.get("profile", {})
            if profile.get("noUsableData", False):
                continue

            player_id = profile["playerId"]
            key = (str(year), str(round_num), player_id)

            if key in rows and rows[key].get("proj_captured_at") and not overwrite:
                total_skipped += 1
                continue

            existing = rows.get(key, {})
            rows[key] = {
                "year": str(year),
                "round": str(round_num),
                "player_id": player_id,
                "player_name": profile["playerName"],
                "team_code": profile["teamCode"],
                "position": profile.get("position", ""),
                "proj_total": round(profile["projectedTotal"], 2),
                "proj_floor": round(profile["projectedFloor"], 2),
                "proj_ceiling": round(profile["projectedCeiling"], 2),
                "proj_games_played": profile["gamesPlayed"],
                "proj_low_sample_warning": profile["lowSampleWarning"],
                "actual_score": existing.get("actual_score", ""),
                "proj_captured_at": now,
                "actual_captured_at": existing.get("actual_captured_at", ""),
            }
            team_count += 1
            total_captured += 1

        print(f"{team_count} players")

    save_csv(path, rows)
    print(f"\nCaptured {total_captured} projections", end="")
    if total_skipped:
        print(f", skipped {total_skipped} already captured (use --overwrite to replace)", end="")
    print(f"\nSaved → {path}")


def capture_actuals(base_url: str, data_dir: Path, year: int, round_num: int,
                    force: bool) -> None:
    """Fetch actual Supercoach scores for a completed round."""
    path = csv_path(data_dir, year)
    rows = load_csv(path)
    now = datetime.now(timezone.utc).isoformat()

    print(f"Capturing actuals — {year} Round {round_num}")
    data = api_get(base_url, f"/api/supercoach/{year}/{round_num}")
    if data is None:
        print(f"Round {round_num} not found in API.")
        return

    if not data.get("isComplete"):
        if not force:
            print(
                f"Round {round_num} is not yet complete (matches still in progress).\n"
                "Use --force to collect partial results anyway."
            )
            return
        print("WARNING: Round is not complete — collecting partial results.")

    updated = 0
    added = 0

    for match in data.get("matches", []):
        for side in ("homeTeam", "awayTeam"):
            team_data = match.get(side, {})
            for player in team_data.get("players", []):
                player_id = player["playerId"]
                key = (str(year), str(round_num), player_id)

                if key in rows:
                    rows[key]["actual_score"] = player["totalScore"]
                    rows[key]["actual_captured_at"] = now
                    updated += 1
                else:
                    # No pre-round projection was captured — record actual only
                    rows[key] = {
                        "year": str(year),
                        "round": str(round_num),
                        "player_id": player_id,
                        "player_name": player["playerName"],
                        "team_code": player["teamCode"],
                        "position": "",
                        "proj_total": "",
                        "proj_floor": "",
                        "proj_ceiling": "",
                        "proj_games_played": "",
                        "proj_low_sample_warning": "",
                        "actual_score": player["totalScore"],
                        "proj_captured_at": "",
                        "actual_captured_at": now,
                    }
                    added += 1

    save_csv(path, rows)
    print(f"Updated {updated} rows with actuals, added {added} actual-only rows.")
    print(f"Saved → {path}")


def reconstruct_projections(base_url: str, data_dir: Path, year: int,
                            from_round: int, to_round: int,
                            teams: list[str], overwrite: bool) -> None:
    """
    Reconstruct historical projections by replaying the floor/spike model
    over each player's game-by-game history fetched from the current API.

    For round N the projection uses only games with round < N — exactly what
    the live model would have used before that round was played.

    Round 1 will always produce zero results (no prior games exist).
    """
    path = csv_path(data_dir, year)
    rows = load_csv(path)
    now = datetime.now(timezone.utc).isoformat()

    print(f"Reconstructing projections — {year} rounds {from_round}–{to_round}")
    print("Fetching full game histories from current projection profiles…\n")

    # Fetch every player's game history once — one API call per team.
    player_profiles: dict[str, dict] = {}
    for team_code in teams:
        print(f"  {team_code}...", end=" ", flush=True)
        data = api_get(base_url, f"/api/supercoach/{year}/team/{team_code}/rankings?mode=composite")
        if data is None:
            print("not found")
            continue
        count = 0
        for ranked in data.get("rankedPlayers", []):
            profile = ranked.get("profile", {})
            player_id = profile["playerId"]
            player_profiles[player_id] = {
                "playerName": profile["playerName"],
                "teamCode": profile["teamCode"],
                "position": profile.get("position", ""),
                "games": profile.get("games", []),
            }
            count += 1
        print(f"{count} players")

    print()
    total_written = 0
    total_skipped = 0

    for round_num in range(from_round, to_round + 1):
        written = skipped = 0
        for player_id, info in player_profiles.items():
            key = (str(year), str(round_num), player_id)
            if key in rows and rows[key].get("proj_captured_at") and not overwrite:
                skipped += 1
                total_skipped += 1
                continue

            proj = _reconstruct(info["games"], round_num)
            if proj is None:
                continue

            existing = rows.get(key, {})
            rows[key] = {
                "year": str(year),
                "round": str(round_num),
                "player_id": player_id,
                "player_name": info["playerName"],
                "team_code": info["teamCode"],
                "position": info["position"],
                "proj_total": proj["proj_total"],
                "proj_floor": proj["proj_floor"],
                "proj_ceiling": proj["proj_ceiling"],
                "proj_games_played": proj["proj_games_played"],
                "proj_low_sample_warning": proj["proj_low_sample_warning"],
                "actual_score": existing.get("actual_score", ""),
                "proj_captured_at": now,
                "actual_captured_at": existing.get("actual_captured_at", ""),
            }
            written += 1
            total_written += 1

        msg = f"  Round {round_num}: {written} reconstructed"
        if skipped:
            msg += f", {skipped} skipped (already have projection data)"
        print(msg)

    save_csv(path, rows)
    print(f"\nWrote {total_written} reconstructed projections.")
    if total_skipped:
        print(f"Skipped {total_skipped} rows that already had projection data (use --overwrite to replace).")
    print(f"Saved → {path}")


def backfill_actuals(base_url: str, data_dir: Path, year: int,
                     from_round: int, to_round: int) -> None:
    """Backfill historical actual scores for a range of past rounds."""
    print(f"Backfilling actuals — {year} rounds {from_round}–{to_round}")
    print("Projection columns will be empty for these rows (retroactive projections unavailable).\n")

    for r in range(from_round, to_round + 1):
        print(f"\n── Round {r} ──────────────────────────")
        capture_actuals(base_url, data_dir, year, round_num=r, force=True)


def _section(title: str) -> None:
    print(f"\n── {title} {'─' * max(0, 48 - len(title))}")


def _stats(values: list[float]) -> tuple[float, float, float, float]:
    """Return (mae, bias, pct_over, pct_under) for a list of signed errors."""
    if not values:
        return 0.0, 0.0, 0.0, 0.0
    n = len(values)
    mae = sum(abs(v) for v in values) / n
    bias = sum(values) / n
    pct_over = 100 * sum(1 for v in values if v > 0) / n
    pct_under = 100 * sum(1 for v in values if v < 0) / n
    return mae, bias, pct_over, pct_under


def report(data_dir: Path, year: int) -> None:
    path = csv_path(data_dir, year)
    if not path.exists():
        print(f"No data file found: {path}")
        return

    rows = list(load_csv(path).values())
    comparable = [
        r for r in rows
        if r.get("proj_total") and r.get("actual_score")
    ]

    W = 52
    print(f"\n{'Projection Accuracy Report — ' + str(year):^{W}}")
    print("=" * W)
    print(f"  Total rows       {len(rows):>6}")
    print(f"  Comparable (P+A) {len(comparable):>6}   ← basis for all stats below")
    print(f"  Projection only  {sum(1 for r in rows if r.get('proj_total') and not r.get('actual_score')):>6}")
    print(f"  Actual only      {sum(1 for r in rows if not r.get('proj_total') and r.get('actual_score')):>6}")

    if not comparable:
        print("\nNo rows with both projection and actual available yet.")
        return

    signed = [float(r["proj_total"]) - float(r["actual_score"]) for r in comparable]
    mae, bias, pct_over, pct_under = _stats(signed)
    rounds_covered = sorted(set(r["round"] for r in comparable), key=int)

    _section("Overall")
    print(f"  Rounds             {', '.join(rounds_covered)}")
    print(f"  Mean Absolute Error  {mae:>6.1f} pts")
    print(f"  Mean Bias            {bias:>+6.1f} pts  ({'overestimates' if bias > 0 else 'underestimates' if bias < 0 else 'no bias'})")
    print(f"  Overestimated        {pct_over:>5.1f}%")
    print(f"  Underestimated       {pct_under:>5.1f}%")

    # ── Tolerance bands ───────────────────────────────────────────────────────
    _section("Within N points of actual")
    n = len(signed)
    print(f"  {'Threshold':<14} {'Players':>8} {'%':>7}")
    print(f"  {'-'*32}")
    for threshold in (10, 20, 30, 40, 50):
        count = sum(1 for e in signed if abs(e) <= threshold)
        print(f"  ±{threshold:<13} {count:>8} {100*count/n:>6.1f}%")

    # ── By sample size ────────────────────────────────────────────────────────
    _section("By sample size at time of projection")
    for label, subset in [
        ("< 6 games (low)", [r for r in comparable if str(r.get("proj_low_sample_warning", "")).lower() in ("true", "1")]),
        ("≥ 6 games",       [r for r in comparable if str(r.get("proj_low_sample_warning", "")).lower() not in ("true", "1")]),
    ]:
        if not subset:
            continue
        s = [float(r["proj_total"]) - float(r["actual_score"]) for r in subset]
        m, b, po, pu = _stats(s)
        print(f"  {label:<22} {len(subset):>5} players   MAE {m:>5.1f}   Bias {b:>+5.1f}   Over {po:.0f}%")

    # ── By position ───────────────────────────────────────────────────────────
    positions = sorted(set(r.get("position", "") for r in comparable if r.get("position")))
    if positions:
        _section("By position")
        print(f"  {'Position':<18} {'Players':>7} {'MAE':>7} {'Bias':>7} {'Over%':>7} {'Under%':>7}")
        print(f"  {'-'*56}")
        for pos in positions:
            subset = [r for r in comparable if r.get("position") == pos]
            s = [float(r["proj_total"]) - float(r["actual_score"]) for r in subset]
            m, b, po, pu = _stats(s)
            print(f"  {pos:<18} {len(subset):>7} {m:>7.1f} {b:>+7.1f} {po:>6.1f}% {pu:>6.1f}%")

    # ── By actual score bracket ───────────────────────────────────────────────
    _section("By actual score bracket  (how well does the model predict each tier?)")
    brackets = [(0, 29, "0–29  (poor)"),
                (30, 59, "30–59 (average)"),
                (60, 89, "60–89 (good)"),
                (90, 119, "90–119 (great)"),
                (120, 9999, "120+  (boom)")]
    print(f"  {'Bracket':<20} {'N':>5} {'Proj avg':>9} {'Actual avg':>10} {'MAE':>7} {'Bias':>7}")
    print(f"  {'-'*62}")
    for lo, hi, label in brackets:
        subset = [r for r in comparable if lo <= float(r["actual_score"]) <= hi]
        if not subset:
            continue
        s = [float(r["proj_total"]) - float(r["actual_score"]) for r in subset]
        proj_avg = sum(float(r["proj_total"]) for r in subset) / len(subset)
        actual_avg = sum(float(r["actual_score"]) for r in subset) / len(subset)
        m, b, _, _ = _stats(s)
        print(f"  {label:<20} {len(subset):>5} {proj_avg:>9.1f} {actual_avg:>10.1f} {m:>7.1f} {b:>+7.1f}")

    # ── By team ───────────────────────────────────────────────────────────────
    _section("By team")
    teams_found = sorted(set(r["team_code"] for r in comparable))
    print(f"  {'Team':<6} {'Players':>7} {'MAE':>7} {'Bias':>7} {'Over%':>7} {'Under%':>7}")
    print(f"  {'-'*46}")
    for team in teams_found:
        subset = [r for r in comparable if r["team_code"] == team]
        s = [float(r["proj_total"]) - float(r["actual_score"]) for r in subset]
        m, b, po, pu = _stats(s)
        print(f"  {team:<6} {len(subset):>7} {m:>7.1f} {b:>+7.1f} {po:>6.1f}% {pu:>6.1f}%")

    # ── By round ─────────────────────────────────────────────────────────────
    _section("By round")
    print(f"  {'Round':<8} {'Players':>7} {'MAE':>7} {'Bias':>7} {'Over%':>7} {'Under%':>7}")
    print(f"  {'-'*50}")
    for rnd in rounds_covered:
        subset = [r for r in comparable if r["round"] == rnd]
        s = [float(r["proj_total"]) - float(r["actual_score"]) for r in subset]
        m, b, po, pu = _stats(s)
        print(f"  {rnd:<8} {len(subset):>7} {m:>7.1f} {b:>+7.1f} {po:>6.1f}% {pu:>6.1f}%")

    # ── Player accuracy ───────────────────────────────────────────────────────
    from collections import defaultdict
    player_errors: dict[str, list[float]] = defaultdict(list)
    player_meta: dict[str, tuple[str, str]] = {}
    for r in comparable:
        pid = r["player_id"]
        player_errors[pid].append(float(r["proj_total"]) - float(r["actual_score"]))
        player_meta[pid] = (r["player_name"], r["team_code"])

    # Only include players with ≥3 comparable rounds for stability
    qualified = {
        pid: errs for pid, errs in player_errors.items() if len(errs) >= 3
    }

    def _player_row(pid: str) -> str:
        errs = qualified[pid]
        name, team = player_meta[pid]
        m = sum(abs(e) for e in errs) / len(errs)
        b = sum(errs) / len(errs)
        return f"  {name:<28} {team:<5} {len(errs):>4}   MAE {m:>5.1f}   Bias {b:>+6.1f}"

    _section("Most overestimated players  (proj >> actual, ≥3 rounds)")
    by_bias = sorted(qualified, key=lambda p: sum(qualified[p]) / len(qualified[p]), reverse=True)
    for pid in by_bias[:10]:
        print(_player_row(pid))

    _section("Most underestimated players  (proj << actual, ≥3 rounds)")
    for pid in by_bias[-10:][::-1]:
        print(_player_row(pid))

    _section("Least predictable players  (highest MAE, ≥3 rounds)")
    by_mae = sorted(qualified, key=lambda p: sum(abs(e) for e in qualified[p]) / len(qualified[p]), reverse=True)
    for pid in by_mae[:10]:
        print(_player_row(pid))

    _section("Most predictable players  (lowest MAE, ≥3 rounds)")
    for pid in by_mae[-10:][::-1]:
        print(_player_row(pid))

    # ── Calibration analysis ──────────────────────────────────────────────────
    _section("Calibration analysis  (bias corrections & simulated impact)")
    print("""
  The model is mean-based (projectedTotal = floorMean + spikeMean), which
  means it structurally regresses toward historical averages and cannot
  predict boom weeks. Some biases are correctable; others are fundamental.
""")

    # Compute per-position and per-team bias corrections
    pos_bias: dict[str, float] = {}
    for pos in positions:
        subset = [r for r in comparable if r.get("position") == pos]
        if subset:
            pos_bias[pos] = sum(float(r["proj_total"]) - float(r["actual_score"]) for r in subset) / len(subset)

    team_bias_map: dict[str, float] = {}
    for team in teams_found:
        subset = [r for r in comparable if r["team_code"] == team]
        if subset:
            team_bias_map[team] = sum(float(r["proj_total"]) - float(r["actual_score"]) for r in subset) / len(subset)

    # Simulate applying corrections to each comparable row
    def _corrected_error(r: dict, apply_pos: bool, apply_team: bool) -> float:
        proj = float(r["proj_total"])
        actual = float(r["actual_score"])
        correction = 0.0
        if apply_pos:
            correction += pos_bias.get(r.get("position", ""), 0.0)
        if apply_team:
            correction += team_bias_map.get(r["team_code"], 0.0)
        return abs((proj - correction) - actual)

    baseline_mae = sum(abs(float(r["proj_total"]) - float(r["actual_score"])) for r in comparable) / len(comparable)
    pos_only_mae  = sum(_corrected_error(r, True, False)  for r in comparable) / len(comparable)
    team_only_mae = sum(_corrected_error(r, False, True)  for r in comparable) / len(comparable)
    both_mae      = sum(_corrected_error(r, True, True)   for r in comparable) / len(comparable)

    print(f"  Simulated MAE if corrections applied (in-sample estimate):")
    print(f"  {'Correction':<30} {'MAE':>6}   {'Δ vs baseline':>14}")
    print(f"  {'-'*54}")
    print(f"  {'Baseline (no correction)':<30} {baseline_mae:>6.1f}   {'':>14}")
    print(f"  {'Position bias correction':<30} {pos_only_mae:>6.1f}   {pos_only_mae - baseline_mae:>+13.1f} pts")
    print(f"  {'Team bias correction':<30} {team_only_mae:>6.1f}   {team_only_mae - baseline_mae:>+13.1f} pts")
    print(f"  {'Position + team correction':<30} {both_mae:>6.1f}   {both_mae - baseline_mae:>+13.1f} pts")
    print(f"  (Note: in-sample corrections are optimistic — validate on future rounds)\n")

    # Highlight corrections worth applying (|bias| > 3 pts)
    print(f"  Suggested position corrections (|bias| > 3 pts):")
    print(f"  {'Position':<20} {'Bias':>8}   {'Apply':>10}")
    print(f"  {'-'*42}")
    for pos, b in sorted(pos_bias.items(), key=lambda x: abs(x[1]), reverse=True):
        if abs(b) > 3:
            direction = f"subtract {abs(b):.1f}" if b > 0 else f"add {abs(b):.1f}"
            print(f"  {pos:<20} {b:>+8.1f}   {direction}")

    print(f"\n  Suggested team corrections (|bias| > 3 pts):")
    print(f"  {'Team':<8} {'Bias':>8}   {'Apply':>10}")
    print(f"  {'-'*32}")
    for team, b in sorted(team_bias_map.items(), key=lambda x: abs(x[1]), reverse=True):
        if abs(b) > 3:
            direction = f"subtract {abs(b):.1f}" if b > 0 else f"add {abs(b):.1f}"
            print(f"  {team:<8} {b:>+8.1f}   {direction}")

    # Score bracket commentary
    poor = [r for r in comparable if float(r["actual_score"]) <= 29]
    poor_proj_avg = sum(float(r["proj_total"]) for r in poor) / len(poor) if poor else 0
    print(f"""
  Score bracket limitations (structural — not fixable with additive corrections):
    0–29 pts:   model projects {poor_proj_avg:.0f} avg → actual ~16 avg (+{poor_proj_avg - 16:.0f} bias)
                These are injury/benching events the model cannot anticipate.
                Recommendation: apply a 0.7× discount to any player with usage risk.

    90+ pts:    model cannot predict boom weeks by design. Use projectedCeiling
                (floorMean + spikeP90) rather than projectedTotal for captain picks.
                The ceiling projection captures the top-decile spike history.
""")
    print()

# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    # Shared flags available on every subcommand (placed after the subcommand name)
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument(
        "--api-url",
        default="http://localhost:8787",
        help="API base URL (default: http://localhost:8787)",
    )
    shared.add_argument(
        "--data-dir",
        default="data/projections",
        help="Directory to store CSV files (default: data/projections/)",
    )

    parser = argparse.ArgumentParser(
        prog="projection_tracker.py",
        description="Track NRL Supercoach projection accuracy week by week.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[shared],
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # capture-projections
    p = sub.add_parser(
        "capture-projections",
        parents=[shared],
        help="Capture pre-round projections for all players (run BEFORE round starts)",
    )
    p.add_argument("--year", type=int, required=True, help="NRL season year")
    p.add_argument("--round", type=int, required=True, help="Round number")
    p.add_argument(
        "--teams",
        help="Comma-separated team codes to query (default: all 17 NRL teams)",
    )
    p.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite projections already captured for this year/round",
    )

    # capture-actuals
    p = sub.add_parser(
        "capture-actuals",
        parents=[shared],
        help="Capture actual Supercoach scores for a completed round",
    )
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--round", type=int, required=True)
    p.add_argument(
        "--force",
        action="store_true",
        help="Collect even if the round is not yet fully complete",
    )

    # reconstruct-projections
    p = sub.add_parser(
        "reconstruct-projections",
        parents=[shared],
        help="Reconstruct historical projections by replaying the model over each player's game history",
    )
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--from-round", type=int, required=True, help="First round to reconstruct (min 2 — round 1 has no prior games)")
    p.add_argument("--to-round", type=int, required=True, help="Last round to reconstruct (inclusive)")
    p.add_argument("--teams", help="Comma-separated team codes (default: all 17 NRL teams)")
    p.add_argument("--overwrite", action="store_true", help="Replace existing projection data")

    # backfill-actuals
    p = sub.add_parser(
        "backfill-actuals",
        parents=[shared],
        help="Backfill actual scores for historical rounds",
    )
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--from-round", type=int, required=True, help="First round to backfill")
    p.add_argument("--to-round", type=int, required=True, help="Last round to backfill (inclusive)")

    # report
    p = sub.add_parser("report", parents=[shared], help="Print projection accuracy summary")
    p.add_argument("--year", type=int, required=True)

    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    try:
        if args.command == "capture-projections":
            teams = args.teams.split(",") if args.teams else NRL_TEAMS
            capture_projections(args.api_url, data_dir, args.year, args.round, teams, args.overwrite)

        elif args.command == "reconstruct-projections":
            teams = args.teams.split(",") if args.teams else NRL_TEAMS
            reconstruct_projections(args.api_url, data_dir, args.year, args.from_round, args.to_round, teams, args.overwrite)

        elif args.command == "capture-actuals":
            capture_actuals(args.api_url, data_dir, args.year, args.round, args.force)

        elif args.command == "backfill-actuals":
            backfill_actuals(args.api_url, data_dir, args.year, args.from_round, args.to_round)

        elif args.command == "report":
            report(data_dir, args.year)

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
