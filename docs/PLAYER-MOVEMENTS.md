# Player Movement Algorithm

Explains how the system classifies changes between two consecutive round team lists into seven mutually-exclusive categories.

---

## Position semantics

**Both named squad membership and starting status are determined by the player's position label, not their jersey number.**

### Named squad membership

| Position label | Meaning |
|---|---|
| Any of the nine starting positions | Named in the squad — in the run-on 13 |
| Interchange | Named in the squad — on the interchange bench |
| Anything else (e.g. Reserve) | Not named — reserve / extended squad |

Jersey numbers are still stored and displayed in the UI, but they play no role in the algorithm's classification logic.

### Starting positions

The nine starting positions are: Fullback, Wing, Centre, Five-Eighth, Halfback, Prop, Hooker, Second Row, Lock.

- A player listed as **Lock** is a starting-position player regardless of their jersey number.
- A player listed as **Interchange** is named but is not at a starting position.
- A player listed as **Reserve** (or any other non-named label) is not in the named squad.

### Position label normalisation

NRL team list data uses variant spellings. These are normalised before any comparison or map lookup:

| Raw label | Canonical form |
|---|---|
| Winger | Wing |
| 2nd Row | Second Row |

All other labels are lowercased and used as-is.

---

## Inputs

For round **R**, the algorithm receives:

- **Current team lists** — every team's named 17 (plus reserves) for round R
- **Previous team lists** — the same for round R-1
- **Open casualty ward entries** — injuries currently active (player absent or playing through)
- **Recently-closed casualty ward entries** — injuries resolved since the previous round's matches

---

## Three-phase algorithm

### Phase 1 — Identify newly non-named players

Iterates every player in the **previous** team lists. If a player:

- was **named** (position was a starting position or Interchange) in round R-1, **and**
- is currently **not in a named position** — either absent from the team list entirely, or present at a non-named position (e.g. Reserve),

they are classified as:

- **Injured** — if there is an open casualty ward entry for them
- **Dropped** — otherwise (assumed form/selection)

Players whose previous position was Reserve (or any other non-named label) are ignored; they were never named.

**Example — Injured (absent):**
> Billy Smith was #9 Hooker for BRO in round 9. He is absent from round 10. His open CW entry says "Hamstring, return Round 12". → **Injured**.

**Example — Dropped (absent):**
> Nicho Hynes was #7 Halfback for SHA in round 9. He is absent from round 10. No open CW entry. → **Dropped**.

**Example — Dropped (Reserve, no CW):**
> A player was #10 Prop in round 9 and is listed as #18 Reserve in round 10. No open CW entry. → **Dropped**. They are still in the team list but no longer named.

**Example — Injured (Reserve, open CW):**
> A player was #10 Prop in round 9 and is now listed as #18 Reserve in round 10. They have an open CW entry for a knee injury. → **Injured**. Being present at Reserve does not change the classification when a CW entry exists.

**Example — Interchange → Reserve, Dropped:**
> An interchange player ("Interchange") in round 9 is now listed as "Reserve" in round 10. No open CW entry. → **Dropped**.

**Example — Reserve leaving silently:**
> A player had position "Reserve" in round 9 and is absent in round 10. Their position was not named, so no movement is recorded.

**Example — Starting-position player injured, then Reserve:**
> Joe Roddy was "2nd Row" for CBR in round 9. He is now listed as "Reserve" in round 10 with a hand injury. He is classified as **Injured** ("2nd Row" is a named position). However, his injury does not seed the covering cascade (see Phase 2).

---

### Phase 2 — Build the covering-injury cascade (per team)

For each team with at least one injured player, this phase determines which current players are covering the vacant position. The cascade is **entirely position-based** — jersey numbers play no role.

#### Cascade seeding

For each injured player from Phase 1:

- If their last position was a **starting position** → seed the cascade with that canonical position as the vacated slot.
- If their last position was not a starting position (e.g. "Interchange") → no cascade. An interchange player's absence does not create a starting-lineup vacancy.

**Note:** A player like Joe Roddy ("2nd Row") **does** seed the cascade because "2nd Row" is a starting position. However, whether the cascade produces any results depends on who currently holds that position slot — see the incumbent rule below.

#### Cascade propagation

All vacancies at the same canonical position are grouped together and processed as a batch. Within each batch:

1. **Collect candidate movers** — current named starting-position players at the vacated position who are not incumbents and not returning from injury.
2. **Skip if returning from injury** — a player who missed last round due to injury takes Priority 1 in Phase 3; their return is the primary story, not cascade coverage.
3. **Skip if an incumbent** — if the player held this exact position last round too, they haven't moved to cover anything. They are continuing their normal role and are not part of the cascade.
4. **Pair 1-to-1 by player ID** — vacancies and candidate movers are each sorted by player ID, then zipped: the lowest-ID mover covers the lowest-ID vacancy, the next-lowest covers the next-lowest, etc. This ensures no mover is attributed to more than one injury. Surplus movers (more movers than vacancies) are not added to the covering map and fall through to Phase 3.
5. **Continue the cascade** — for each paired mover, if they came from a different starting position, that position is now vacant. Add it to the batch queue, referencing the **original** injured player. If the mover came from a non-starting position (e.g. Interchange) or is new to the team, the cascade stops here.

**Why movers only, not incumbents:**

> Simi Sasagi was jersey 12 "2nd Row" for CBR last round and is still jersey 12 "2nd Row" this round. Joe Roddy (jersey 17, "2nd Row") is injured. Because Sasagi's position hasn't changed, he is an incumbent — he is not covering Roddy; he's just continuing in his role. The cascade finds no movers at "second row" and produces no covering entries for this injury.

**Multi-player positions (Prop, Wing, Centre, Second Row):**

Each of these positions can have two named players (e.g. two props). The cascade collects **all** candidate movers at the vacated position and pairs them to vacancies 1-to-1 by sorted player ID. An incumbent and a newly-moved player at the same position are handled independently. When two players at the same position are both injured, their vacancies are batched together so each replacement is paired with exactly one injury — no replacement is credited with covering two injuries.

**Example — Simple cover (new player):**
> Billy Smith (#9 Hooker, BRO) is injured. Cory Paix is now at Hooker and was not in the previous team list. Paix is a mover (new to the team → `prevPosition = null`). → **Covering Injury** for Billy Smith. No further cascade (Paix had no prior position to vacate).

**Example — Cascade (position shift):**
> Jack Wighton (#4 Centre, STH) is injured.
> 1. Vacated position: "centre". Campbell Graham (was #5 Winger) is now at Centre — a mover. Added to covering map for Wighton. Graham vacated "wing".
> 2. Vacated position: "wing". Edward Kosi is now at Wing and was not in the previous team list — a mover. Added to covering map for Wighton. Kosi is new to the team, cascade stops.
>
> Both Graham and Kosi show as **Covering Injury** for Jack Wighton.

**Example — Interchange player injured (no cascade):**
> Joe Roddy was "2nd Row" for CBR. The cascade seeds with "second row". The current named "2nd Row" players were both at "2nd Row" last round — they are incumbents. The cascade produces no movers. **No covering entries** for Joe Roddy's injury.

**Example — Interchange fills injury slot (cascade terminates):**
> An interchange player (position "Interchange") is now at "Prop" to cover an injured starter. They came from "Interchange" — not a starting position. They are added to the covering map but the cascade stops (no starting position was vacated by the interchange player).

---

### Phase 3 — Classify current members (strict priority order)

For every player in the current team list, exactly one category is assigned. Priorities are evaluated top-down; the first match wins.

---

#### Pre-classification: Reserves (position not named)

Players whose current position is not named (not a starting position and not Interchange) are handled before the priority chain. They have already been classified in Phase 1 (as Injured or Dropped if previously named) or are silently ignored (if they were never named). Either way, they do not enter the priority chain:

- **Silently passed over** — no further classification is attempted.

#### Pre-classification: Interchange (named but not starting) — Benched

Players whose current position is Interchange (named but not a starting position) are evaluated next, before the numbered priorities:

- **Benched** — if:
  - Was at a **starting position** (by position label) last round
- **Falls through to priority chain** — otherwise (was Interchange or Reserve/absent last round)

"Replaced by" is recorded using the same slot-index pairing as for Promoted: find the player's former slot index among previous holders at that starting position (sorted by player ID), then pair with the same-indexed current holder. If no new player took their slot, `replacedByPlayerId` is null.

**Example — Benched:**
> Jordan Riki was #13 Lock for BRO in round 9 (starting position). He is now #14 Interchange in round 10. → **Benched**, prevPosition=Lock, currentPosition=Interchange, consecutiveRoundsBenched=1, replacedByPlayerId=Kobe Hetherington.

**Example — Reserve always-reserve (silently passed over):**
> A player had position "Reserve" last round and has position "Reserve" this round. They were never named. Phase 1 ignores them (not previously named), and they are skipped in Phase 3.

**Example — Interchange → Reserve (Dropped, not Benched):**
> A player had position "Interchange" last round and is now "Reserve". They were named (Interchange is named) and are now not named. → **Dropped** in Phase 1 (if no CW) or **Injured** (if open CW). They do not reach Phase 3.

**Example — Interchange → Interchange (silently ignored, falls through):**
> A player was #14 Interchange last round and is still #14 Interchange this round. `wasStarting=false` → the Benched check does not fire. They fall through the priority chain and are not classified (no notable movement).

**Example — Position is the authority, not jersey:**
> Trent Loiero was jersey 17 Lock in round 9. He is jersey 13 Lock in round 10. He is NOT benched because his current position is Lock — a named starting position. He continues to the priority chain below.

---

#### Priority 1 — Returning from injury

Conditions (all must hold):

- Was **absent** from the round R-1 team list (missed at least one game), **and**
- Has an **open** or **recently-closed** casualty ward entry

If they were present last round (played last week), they did not miss a game and are not "returning" — they fall through to lower priorities.

Recorded fields include: the injury type, `roundsOut` (how many rounds missed, computed by walking back through team lists), pre-injury jersey and position, and current jersey and position (with a flag if the position changed).

**Example — Returning (closed CW entry):**
> Valentine Holmes missed rounds 7–9 with a knee injury. His CW entry was closed. He is named #3 Wing for NQC in round 10 and was absent from round 9. → **Returning from Injury**, roundsOut=3, injury="Knee".

**Example — Playing through injury (not returning):**
> A player has an open CW entry for a shoulder injury but appeared in both round 9 and round 10. They did not miss a game → not "returning"; falls through to positionChanged or unchanged.

**Example — Returning to a different position:**
> A player last played as Centre before their injury. They return as a Wing this round. → **Returning from Injury**, positionChanged=true.

---

#### Priority 2 — Covering an injury

Condition: the player appears in the covering map built in Phase 2.

**Example — Direct cover:**
> Cory Paix is now at Hooker, covering Billy Smith (injured Hooker). → **Covering Injury**, showing Billy Smith as the player being covered, with `prevJersey=null` (Paix was not in the previous squad).

**Example — Cascade cover (moved position):**
> Campbell Graham moved from Wing to Centre to cover Jack Wighton. → **Covering Injury** for Wighton, with `prevPosition="Winger"` indicating he moved from Wing. Edward Kosi (filled Graham's vacated Wing slot) also shows as **Covering Injury** for Wighton.

---

#### Priority 3 — Position changed

Conditions (all must hold):

- Was **named** last round (position was a starting position or Interchange), **and**
- Was at a **starting position** (by position label) last round, **and**
- Is at a **starting position** (by position label) this round, **and**
- The (normalised) position label changed between rounds

If the player was at a **non-starting position** last round (e.g. "Interchange") and is now at a starting position, they fall through to **Priority 4** (Promoted) instead.

**Example — Position changed:**
> Jackson Hastings was jersey 6 "Halfback" for NEW in round 9 and is jersey 6 "Five-Eighth" in round 10. Both are starting positions, he was named both rounds. → **Position Changed**.

**Example — Interchange player position change (not reported):**
> A player was jersey 14 "Interchange" last round and is jersey 14 "Interchange" this round (different role label). "Interchange" is not a starting position — neither wasStarting nor isStarting. → Silently ignored.

**Example — Non-starting to starting (falls to Promoted):**
> A player was jersey 15 "Interchange" last round and is now jersey 6 "Five-Eighth". Their previous position was not a starting position. → Falls through to **Priority 4** (Promoted).

---

#### Priority 4 — Promoted

Reaches here when a player is named (position is a starting position or Interchange) and none of the above priorities matched. This covers:

- A player **new to the named 17** (was Reserve or absent last round)
- A player who was at a **non-starting position** last round and is now at a starting position (e.g. interchange → starter)
- A player who was at a **non-starting position** last round and remains at a non-starting position (e.g. new interchange player)

"Replacing" is recorded if the previous named holder of this starting position no longer occupies that slot — they are absent (dropped/injured), demoted to a non-named position (benched), or have moved to a different position (still named but elsewhere). Players promoted to non-starting positions (Interchange, Reserve) never have a `replacingPlayerId` set. Only the most recent named holder of each position slot is considered — players who were Reserve in the previous round do not count as "the previous holder." For positions with two named players (Wing, Prop, Centre, Second Row), promoted players are sorted by player ID among all current holders at that position; each promoted player's rank determines which previous holder they are paired with (lowest-ID current → lowest-ID previous, etc.).

**Example — Promoted from reserve, replacing:**
> Jordan Riki (Lock) is now "Reserve". Kobe Hetherington was "Reserve" last round and is now Lock. → **Promoted**, replacingPlayerId = Jordan Riki.

**Example — New to the squad:**
> A player was absent last round and is now Wing. → **Promoted**, replacingPlayerId=null.

**Example — Previous holder changed positions:**
> Jayden Campbell was Halfback last round and is now Five-Eighth (positionChanged). Zane Harrison is promoted to Halfback. → **Promoted**, replacingPlayerId = Jayden Campbell. Campbell vacated the Halfback slot even though he is still in the named 17.

**Example — Same player, position unchanged (NOT promoted):**
> Trent Loiero was jersey 17 Lock last round and is jersey 13 Lock this round. `wasNamed = true` (Lock is a named position), `wasStarting = true` (Lock is a starting position). Priority 3 handles him: same position, no position change. → Silently ignored (no movement recorded).

---

## Mutual exclusivity

Every player in the current round ends up in exactly one category or none (no notable movement). The priority chain guarantees this:

```
Not named (Reserve) or absent:
  wasNamed AND open CW      → Injured              (Phase 1)
  wasNamed AND no CW        → Dropped              (Phase 1)
  !wasNamed                 → (ignored)

Present, position is Interchange (isNamed AND !isStarting):
  wasStarting               → Benched              (Phase 3 pre-chain)
  !wasStarting              → falls through to priority chain below

Present, position is a starting position:
  Missed last round AND CW  → Returning from Injury [Priority 1]
  In covering map           → Covering Injury       [Priority 2]
  wasNamed AND wasStarting
    AND isStarting
    AND position changed    → Position Changed      [Priority 3]
  wasNamed AND !wasStarting
    AND isStarting          → falls through to Promoted
  wasNamed AND no change    → (ignored, continue)
  otherwise                 → Promoted              [Priority 4]
```

---

## Edge cases

**Round 1:** No previous round data. All seven arrays are empty and `noPreviousRound: true` is set.

**Partial team lists:** If any team expected to play in round R has not yet submitted their team list, the algorithm exits without writing to the cache. The API returns `{ pending: true }`.

**Player named despite open CW entry:** If a player is named this round but has an open CW entry, they are classified as **Returning from Injury** only if they were absent last round (missed at least one game). The CW entry is left open — only the movements view treats them as returning.

**Multiple injuries in the same team:** Each injured player seeds the cascade independently. All cascade branches reference the **original** injured player that seeded them, not any intermediate mover in the chain.

**Two players at the same position (Prop, Wing, Centre, Second Row):** The cascade collects all candidate movers at the vacated position. Incumbents (unchanged from last round) are skipped. Movers are paired 1-to-1 with vacancies by sorted player ID. An incumbent and a newly-moved player at the same position are handled independently, and a mover may trigger a further cascade step for the position they vacated.

**Both players at the same position injured/dropped/benched in the same week:** Vacancies and movers/arrivals at that position are sorted by player ID and paired positionally. The data source does not distinguish left from right (e.g. left wing vs right wing), so the pairing is arbitrary but deterministic — each vacancy is linked to at most one mover, and no replacement is credited with covering two injuries. The same slot-index pairing applies to `replacingPlayerId` (Promoted) and `replacedByPlayerId` (Benched) for multi-player positions.

**Position label variants:** NRL data uses "Winger" and "2nd Row" interchangeably with "Wing" and "Second Row". All position comparisons and map lookups use the normalised canonical form. This prevents false position-change reports and ensures cascade lookups work across rounds where the label may vary.
