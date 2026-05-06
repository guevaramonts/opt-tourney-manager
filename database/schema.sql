-- ─────────────────────────────────────────────────────────────────────────────
-- Pocket Director — SQLite Schema Reference
-- ─────────────────────────────────────────────────────────────────────────────
-- This file is for reference only.  The authoritative schema is in migrations.ts.

CREATE TABLE IF NOT EXISTS tournaments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  buy_in         INTEGER NOT NULL,
  bounty_amount  INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'pending'  -- pending | finished
);

CREATE TABLE IF NOT EXISTS players (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL UNIQUE,
  total_career_earnings INTEGER NOT NULL DEFAULT 0
);

-- Junction table: one row per player per tournament entry
CREATE TABLE IF NOT EXISTS registrations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id       INTEGER NOT NULL REFERENCES tournaments(id),
  player_id           INTEGER NOT NULL REFERENCES players(id),
  chip_count          INTEGER NOT NULL DEFAULT 10000,
  is_active           INTEGER NOT NULL DEFAULT 1,  -- 0 = eliminated
  bounties_collected  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, player_id)
);

-- Each row is one elimination / bounty event
CREATE TABLE IF NOT EXISTS bounty_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  killer_id     INTEGER NOT NULL REFERENCES players(id),
  victim_id     INTEGER NOT NULL REFERENCES players(id),
  timestamp     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Blind schedule for a tournament
CREATE TABLE IF NOT EXISTS blind_structure (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id    INTEGER NOT NULL REFERENCES tournaments(id),
  level            INTEGER NOT NULL,
  small_blind      INTEGER NOT NULL,
  big_blind        INTEGER NOT NULL,
  ante             INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 900,  -- 15 min default
  UNIQUE(tournament_id, level)
);
