# OPT App — Requirements

## Purpose
This document captures the application-level and dependency requirements for the OPT App. Use it as the single source of truth for runtime platforms, language versions, third-party libraries, developer tools, CI, testing, security controls, and acceptance criteria.

> Note: This is a template and starter list. I made small assumptions about common components — update the sections below with exact versions and any platform-specific details from the repo.

## Assumptions
- The repository contains an application project (web or native). If the project is multi-language, list each language stack below.
- If you want me to auto-detect installed packages (e.g., `package.json`, `requirements.txt`, `pyproject.toml`, `Podfile`, `build.gradle`), ask and I'll scan the workspace to populate versions.
## Poker tournament rules (basic)

This section defines a baseline set of rules for an organized poker tournament. Use these as defaults for the OPT App; they are intentionally conservative and easy to change per-event.

### 1) Overview
- Tournament type: No-Limit Texas Hold'em (only supported variant).
- Objective: Players compete for prize pool positions according to final table standings.

### 2) Tournament structure
- Single-entry or Multi-entry: configurable per event. Default: single-entry.
- Start time and schedule should be recorded; late registration window and re-entry windows defined below.
- Target field size, estimated duration, and payout structure are set before registration closes.

### 3) Registration & buy-ins
- Buy-in components: Entry fee + house fee (e.g., $100 + $10). Show both components in the UI.
- Late registration: allowed for a configurable number of blind levels (default: first 6 levels).
- Rebuys / Add-ons: configurable. If enabled, provide rules for timing (e.g., rebuys allowed during late registration only; add-ons allowed at first break).
- Refunds: none after registration closes, except for documented exceptional circumstances.

### 4) Starting stacks & chip denominations
- Starting stack: fully configurable per tournament. Admins must be able to set the total starting chips per player (for example 8,500 or 10,000) or define chip denominations and per-denomination counts manually.
- The application should NOT enforce a single fixed global chip amount. Instead, provide two modes:
  - Auto-calc mode: admin selects desired starting stack and denominations; the app calculates a sensible count of each chip to match or approximate the starting stack and shows the resulting inventory.
  - Manual mode: admin specifies exact counts for each chip denomination.
- Show example denominations and counts when helpful, but they are only illustrative. Example denominations (editable):
  - 25 x 20 = 500
  - 100 x 30 = 3000
  - 500 x 10 = 5000
  - Total = 8500
- Validate that denomination counts and totals are consistent and surface warnings when the calculated total differs from the targeted starting stack.
- Allow exporting the chip inventory for a tournament (counts per denomination) for live event setup.

### 5) Blind structure & levels
- Blind levels should be an ordered list of (level number, small blind, big blind, duration minutes, ante if any).
- Default level duration: 20 minutes (configurable).
- Example first levels (No-Limit Hold'em):
  1. 25/50 (20m)
  2. 50/100 (20m)
  3. 75/150 (20m)
  4. 100/200 (20m)
  ...
- Increasing blinds must be strictly monotonic; allow import of common preset structures (e.g., Turbo, Regular, Deepstack).

### 6) Antes
- Antes may be introduced starting at a configurable level. When active, the app should compute total pot contributions and update per-player chip counts.

### 7) Breaks & clock management
- Break schedule: configurable per levels (e.g., 10 minute break every 4 levels).
- Tournament clock: authoritative source for level transitions. Admins can pause or resume the clock; pausing requires a short log entry and reason.

### 8) Seating, table balancing & breaks
- Seating: initial random seat assignment unless otherwise specified.
- Table balancing (moving players/combining tables) occurs when tables are below a configurable threshold (e.g., combine when tables have <= 5 players)
- Seat draw and dealer button movement follow standard casino rules (button moves one seat to left when table is combined).

### 9) Late registration, re-entry, and add-on policies
- Late registration cutoff: defined in levels or absolute time; players may register and receive the standard starting stack.
- Re-entry: if allowed, treated as separate entries for prize distribution; record each entry separately.
- Add-on: single optional chip bundle available at specified break(s).

### 10) Payout structure
- Payouts: defined before tournament start. Support standard payout curves (top-heavy vs flat) and custom percentages.
- Prize pool calculation: sum of collected buy-ins minus house fees; show breakdown to players.

### 11) Dealer, button & hand rules
- Dealer responsibilities (live events): protect the game, call clock/time if needed, and report disputes to the floor.
- Button rules: follows standard movement; late-arriving players take empty seats when available but do not receive missed blinds unless specified by local house rules.

### 12) Timekeeping, clock and penalties
- Action clock (optional): configurable per-table (e.g., 30s default; one 60s time extension per round).
- Penalties: warn -> time penalty -> small blind forced -> disqualification for repeated offenses; exact progression must be configurable.

### 13) Chip races & color-up
- When blinds grow and small denominations are removed, a chip race (color-up) procedure should be available and logged. Rules:
  - Players exchange small chips for larger chips by approximate value.
  - Any odd chips are rounded and awarded by a fair method (high card or seat order) — specify per-event.

### 14) Disputes & floor decisions
- All disputes are resolved by the tournament director / floor. The app should record dispute reports with timestamp, reported players, and decision.

### 15) Disqualification, withdrawals & medicals
- Voluntary withdrawal: player cashes out at current value only if the event supports cashing; otherwise eliminated.
- Medical or emergency removal: treat as withdrawal; tournament director may allow substitute chips or cancel depending on event rules (record decision).

### 16) Reporting & logging
- The app must log key events: registrations, rebuys, add-ons, level changes, breaks, table moves, disqualifications, and payouts. Logs must include timestamp and admin id.

### 17) Acceptance criteria for rule implementation
- The rules editor UI must allow creating/editing:
  - Blind level list (level, SB, BB, duration, ante)
  - Starting stack and chip denominations, including:
    - Set total starting chips per player (numeric)
    - Choose auto-calc or manual denomination mode
    - Validate and preview denomination counts and total inventory
  - Registration windows and re-entry/add-on toggles
  - Payout structure (preset and custom)
- The tournament run-view must display current level, time remaining, active tables, player chip counts, and upcoming break.

### 18) Edge cases to handle
- Player disconnects / late arrivals
- Multi-entry bookkeeping (multiple entries by same player)
- Ties for final table positions (split pots vs seat-based tie-breakers)

---

## Season management & scoring

This application manages a season of poker tournaments. The season is a collection of individual tournaments (typically 6–8) and ends with a Tournament of Champions that includes the top season scorers (default: top 10).

### Season overview
- Season admin can create a season with metadata: name, start/end dates, number of events, entry fees, and ruleset selection.
- Season roster: players register once at season start. Registration includes player profile, contact, and optional alias. Admins may add or remove players with audit logging.

### Tournament schedule
- Each season contains multiple scheduled tournaments. Each tournament has its own configuration (buy-in, starting stack, blind structure, late registration policy, re-entry/add-on rules).
- The Tournament of Champions is a special event automatically scheduled at season end and populated with qualified players.

### Scoring model (high-level)
- Scoring is the sum of two components: placement points and knockout (KO) points.
- Formula (default): TotalPoints = PlacementPoints + (KO_Points * KOs)
- All scoring parameters must be configurable at season creation: placement table, KO points per elimination, ties handling, and any bonuses (e.g., winning a tournament bonus).

### Default scoring (example)
- KO points: 1 point per elimination (configurable).
- Placement points (default example):
  - 1st: 100
  - 2nd: 80
  - 3rd: 70
  - 4th: 60
  - 5th: 50
  - 6th: 40
  - 7th: 30
  - 8th: 20
  - 9th: 10
  - 10th: 5

### Tournament of Champions qualification
- Default qualification: top 10 season scorers by TotalPoints.
- Tie-breakers (in order): 1) total KO count, 2) most tournament wins, 3) highest single-tournament placement, 4) head-to-head (if applicable), 5) coin flip. Tie-breaker order is configurable.

### Points recording & evidence
- For each tournament, record: finishing position, knockout count per player, payouts, and notes. These must be stored as immutable event results with an audit trail.
- Results can be entered manually by an admin or imported via CSV. Imports should validate format and require confirmation before applying.

### Season-level features required
- Create/edit a season and its scoring rules.
- Register season players and manage roster (bulk import/export CSV).
- Schedule tournaments and configure per-tournament overrides of scoring or buy-ins.
- Automatic leaderboard that updates after each tournament.
- Qualification view showing current top N players with projected qualification scenarios.
- Manual result adjustment with reasons and audit log (for disputes or errors).

### Acceptance criteria for season features
- Admin can create a season and configure scoring and number of tournaments.
- Players can register for the season; roster can be exported.
- After tournament results are applied, leaderboard correctly computes TotalPoints and ranks players.
- The Tournament of Champions qualifier list is derivable from the leaderboard and respects tie-break rules.
- CSV import validates and previews results before committing; invalid rows are reported.
- All changes to season configuration or results are logged with admin id and timestamp.

### Edge cases to handle at season level
- Players who join mid-season: define whether they are eligible for full-season points or only for remaining events (configurable).
- Multiple entries by the same person in a single tournament (if allowed) and how points are credited.
- Missing KO data on import — app should allow manual entry or flag incomplete imports.
- Player renames / merged identities — maintain identity mapping with admin confirmation and audit log.

---

---

(technical stack removed — this document now contains only tournament and season rules and procedures)

Last updated: 2026-01-26


## Poker tournament rules (basic)

This section defines a baseline set of rules for an organized poker tournament. Use these as defaults for the OPT App; they are intentionally conservative and easy to change per-event.

### 1) Overview
- Tournament type: No-Limit Texas Hold'em (default). Variants may be added per event (Omaha, Limit Hold'em, Mixed).
- Objective: Players compete for prize pool positions according to final table standings.

### 2) Tournament structure
- Single-entry or Multi-entry: configurable per event. Default: single-entry.
- Start time and schedule should be recorded; late registration window and re-entry windows defined below.
- Target field size, estimated duration, and payout structure are set before registration closes.

### 3) Registration & buy-ins
- Buy-in components: Entry fee + house fee (e.g., $100 + $10). Show both components in the UI.
- Late registration: allowed for a configurable number of blind levels (default: first 6 levels).
- Rebuys / Add-ons: configurable. If enabled, provide rules for timing (e.g., rebuys allowed during late registration only; add-ons allowed at first break).
- Refunds: none after registration closes, except for documented exceptional circumstances.

### 4) Starting stacks & chip denominations
- Standard starting stack: configurable (e.g., 10,000 chips).
- Show default chip denominations and counts (example):
  - 25 x 20 = 500
  - 100 x 30 = 3000
  - 500 x 10 = 5000
  - Total = 8500 (adjust to match chosen starting stack)
- Allow admins to configure denominations per live event.

### 5) Blind structure & levels
- Blind levels should be an ordered list of (level number, small blind, big blind, duration minutes, ante if any).
- Default level duration: 20 minutes (configurable).
- Example first levels (No-Limit Hold'em):
  1. 25/50 (20m)
  2. 50/100 (20m)
  3. 75/150 (20m)
  4. 100/200 (20m)
  ...
- Increasing blinds must be strictly monotonic; allow import of common preset structures (e.g., Turbo, Regular, Deepstack).

### 6) Antes
- Antes may be introduced starting at a configurable level. When active, the app should compute total pot contributions and update per-player chip counts.

### 7) Breaks & clock management
- Break schedule: configurable per levels (e.g., 10 minute break every 4 levels).
- Tournament clock: authoritative source for level transitions. Admins can pause or resume the clock; pausing requires a short log entry and reason.

### 8) Seating, table balancing & breaks
- Seating: initial random seat assignment unless otherwise specified.
- Table balancing (moving players/combining tables) occurs when tables are below a configurable threshold (e.g., combine when tables have <= 5 players)
- Seat draw and dealer button movement follow standard casino rules (button moves one seat to left when table is combined).

### 9) Late registration, re-entry, and add-on policies
- Late registration cutoff: defined in levels or absolute time; players may register and receive the standard starting stack.
- Re-entry: if allowed, treated as separate entries for prize distribution; record each entry separately.
- Add-on: single optional chip bundle available at specified break(s).

### 10) Payout structure
- Payouts: defined before tournament start. Support standard payout curves (top-heavy vs flat) and custom percentages.
- Prize pool calculation: sum of collected buy-ins minus house fees; show breakdown to players.

### 11) Dealer, button & hand rules
- Dealer responsibilities (live events): protect the game, call clock/time if needed, and report disputes to the floor.
- Button rules: follows standard movement; late-arriving players take empty seats when available but do not receive missed blinds unless specified by local house rules.

### 12) Timekeeping, clock and penalties
- Action clock (optional): configurable per-table (e.g., 30s default; one 60s time extension per round).
- Penalties: warn -> time penalty -> small blind forced -> disqualification for repeated offenses; exact progression must be configurable.

### 13) Chip races & color-up
- When blinds grow and small denominations are removed, a chip race (color-up) procedure should be available and logged. Rules:
  - Players exchange small chips for larger chips by approximate value.
  - Any odd chips are rounded and awarded by a fair method (high card or seat order) — specify per-event.

### 14) Disputes & floor decisions
- All disputes are resolved by the tournament director / floor. The app should record dispute reports with timestamp, reported players, and decision.

### 15) Disqualification, withdrawals & medicals
- Voluntary withdrawal: player cashes out at current value only if the event supports cashing; otherwise eliminated.
- Medical or emergency removal: treat as withdrawal; tournament director may allow substitute chips or cancel depending on event rules (record decision).

### 16) Reporting & logging
- The app must log key events: registrations, rebuys, add-ons, level changes, breaks, table moves, disqualifications, and payouts. Logs must include timestamp and admin id.

### 17) Acceptance criteria for rule implementation
- The rules editor UI must allow creating/editing:
  - Blind level list (level, SB, BB, duration, ante)
  - Starting stack and chip denominations
  - Registration windows and re-entry/add-on toggles
  - Payout structure (preset and custom)
- The tournament run-view must display current level, time remaining, active tables, player chip counts, and upcoming break.

### 18) Edge cases to handle
- Player disconnects / late arrivals
- Multi-entry bookkeeping (multiple entries by same player)
- Ties for final table positions (split pots vs seat-based tie-breakers)

---

