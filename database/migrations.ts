import type Database from 'better-sqlite3';
import { OPT_2026_SCORING_POINTS } from './opt2026Scoring';

/** Default blind schedule used when a tournament doesn't define its own. */
const DEFAULT_STRUCTURE = [
  { level: 1, small: 25, big: 50, ante: 0, duration: 15 },
  { level: 2, small: 50, big: 100, ante: 0, duration: 15 },
  { level: 3, small: 75, big: 150, ante: 25, duration: 15 },
  { level: 4, small: 100, big: 200, ante: 25, duration: 15 },
  { level: 5, small: 150, big: 300, ante: 50, duration: 20 },
  { level: 6, small: 200, big: 400, ante: 75, duration: 20 },
  { level: 7, small: 300, big: 600, ante: 100, duration: 20 },
  { level: 8, small: 400, big: 800, ante: 150, duration: 20 },
  { level: 9, small: 500, big: 1000, ante: 200, duration: 20 },
  { level: 10, small: 600, big: 1200, ante: 250, duration: 25 },
];

export function runMigrations(db: Database.Database): void {
  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      buy_in         INTEGER NOT NULL,
      bounty_amount  INTEGER NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS players (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT    NOT NULL UNIQUE,
      total_career_earnings INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tables (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT    NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id       INTEGER NOT NULL REFERENCES tournaments(id),
      player_id           INTEGER NOT NULL REFERENCES players(id),
      table_id            INTEGER REFERENCES tables(id),
      seat_number         INTEGER,
      chip_count          INTEGER NOT NULL DEFAULT 10000,
      is_active           INTEGER NOT NULL DEFAULT 1,
      bounties_collected  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tournament_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS bounty_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      killer_id     INTEGER NOT NULL REFERENCES players(id),
      victim_id     INTEGER NOT NULL REFERENCES players(id),
      timestamp     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blind_structure (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id    INTEGER NOT NULL REFERENCES tournaments(id),
      level            INTEGER NOT NULL,
      small_blind      INTEGER NOT NULL,
      big_blind        INTEGER NOT NULL,
      ante             INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 900,
      UNIQUE(tournament_id, level)
    );

    CREATE TABLE IF NOT EXISTS table_state (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      table_id      INTEGER NOT NULL REFERENCES tables(id),
      button_seat   INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tournament_id, table_id)
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL UNIQUE,
      status        TEXT    NOT NULL DEFAULT 'pending',
      start_date    TEXT,
      end_date      TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS season_tournaments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id     INTEGER NOT NULL REFERENCES seasons(id),
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      tournament_number INTEGER NOT NULL,
      UNIQUE(season_id, tournament_id)
    );

    CREATE TABLE IF NOT EXISTS season_results (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id      INTEGER NOT NULL REFERENCES seasons(id),
      player_id      INTEGER NOT NULL REFERENCES players(id),
      tournament_id  INTEGER NOT NULL REFERENCES tournaments(id),
      placement      INTEGER NOT NULL,
      bounties       INTEGER NOT NULL DEFAULT 0,
      points         REAL NOT NULL DEFAULT 0.0,
      is_opt_player  INTEGER NOT NULL DEFAULT 1,
      UNIQUE(season_id, tournament_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS scoring_matrix (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      placement      INTEGER NOT NULL,
      players_10     REAL,
      players_15     REAL,
      players_20     REAL,
      players_25     REAL,
      players_30     REAL,
      players_35     REAL,
      players_40     REAL,
      UNIQUE(placement)
    );

    CREATE TABLE IF NOT EXISTS scoring_points (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      placement     INTEGER NOT NULL,
      player_count  INTEGER NOT NULL,
      points        REAL NOT NULL,
      UNIQUE(placement, player_count)
    );

    CREATE TABLE IF NOT EXISTS migrations (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT    NOT NULL UNIQUE,
      applied TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Always ensure the required seed rows exist (idempotent via OR IGNORE)
  ensureSeedData(db);
}

const SUIT_TABLES = ['Hearts', 'Spades', 'Clubs', 'Diamonds'];

function ensureSeedData(db: Database.Database): void {
  // Template tournament (id=0) used as blind-structure reference
  db.prepare(
    `INSERT OR IGNORE INTO tournaments (id, name, buy_in, bounty_amount, status)
     VALUES (0, '__default_template__', 0, 0, 'pending')`
  ).run();

  // Always ensure the 4 suit tables exist
  const insertTable = db.prepare('INSERT OR IGNORE INTO tables (name) VALUES (?)');
  for (const suit of SUIT_TABLES) insertTable.run(suit);

  // Add table_id / seat_number columns to registrations on existing DBs (idempotent)
  const hasTables = db
    .prepare("SELECT 1 FROM pragma_table_info('registrations') WHERE name = 'table_id'")
    .get();
  if (!hasTables) {
    db.exec('ALTER TABLE registrations ADD COLUMN table_id INTEGER REFERENCES tables(id)');
  }
  const hasSeat = db
    .prepare("SELECT 1 FROM pragma_table_info('registrations') WHERE name = 'seat_number'")
    .get();
  if (!hasSeat) {
    db.exec('ALTER TABLE registrations ADD COLUMN seat_number INTEGER');
  }

  // Add email / phone columns to players on existing DBs (idempotent)
  const hasEmail = db
    .prepare("SELECT 1 FROM pragma_table_info('players') WHERE name = 'email'")
    .get();
  if (!hasEmail) {
    db.exec('ALTER TABLE players ADD COLUMN email TEXT');
  }
  const hasPhone = db
    .prepare("SELECT 1 FROM pragma_table_info('players') WHERE name = 'phone'")
    .get();
  if (!hasPhone) {
    db.exec('ALTER TABLE players ADD COLUMN phone TEXT');
  }

  // Ensure table_state exists on older DBs
  db.exec(
    `CREATE TABLE IF NOT EXISTS table_state (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
      table_id      INTEGER NOT NULL REFERENCES tables(id),
      button_seat   INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tournament_id, table_id)
    )`
  );

  seedDefaultStructureIfNeeded(db);
  seedDummyPlayersIfNeeded(db);
  seedScoringMatrixIfNeeded(db);
  seedExactOptScoringPointsIfNeeded(db);
  normalizeTournamentStatusesIfNeeded(db);
}

/**
 * Seeds a default blind structure row set for tournament_id 0 (template).
 * Real tournaments copy from here or define their own.
 */
function seedDefaultStructureIfNeeded(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM migrations WHERE name = 'seed_default_structure'")
    .get();

  if (exists) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO blind_structure
       (tournament_id, level, small_blind, big_blind, ante, duration_seconds)
     VALUES (0, @level, @small, @big, @ante, @duration)`
  );

  const seedAll = db.transaction(() => {
    for (const row of DEFAULT_STRUCTURE) {
      insert.run({
        level: row.level,
        small: row.small,
        big: row.big,
        ante: row.ante,
        duration: row.duration * 60,
      });
    }
  });

  seedAll();

  db.prepare(
    "INSERT INTO migrations (name) VALUES ('seed_default_structure')"
  ).run();
}

const ROSTER_PLAYERS = [
  'Brian Cooke', 'Jake Castaneda', 'Mitch May', 'Danny Delgado', 'Liliana Olalde',
  'Mark Callejo', 'Joe Greco', 'Monty Guevara', 'Marijana Wendt', 'Addie Burkhart',
  'Jose Zepeda', 'Matthew Gutierrez', 'Ryan Skarb', 'Vince Marzella', 'Heidi Obrien',
  'Shaun Green', 'Norberto Olalde', 'Kosta Zepeda', 'Garrick Gutierrez', 'Jaime Zepeda',
  'Brian Lilly', 'Guilllermo Delacruz', 'Connor Ray', 'Nena Guevara', 'Gary Slipke',
  'Julie Delgado', 'Kristen Gutierrez', 'Jeremy Hein', 'Ricardo Delgado', 'Andy Ceponis',
  'Joe Gonzalez', 'Jacob May', 'Julie Greco', 'Zeek Escamilla', 'Elda Jonson',
  'Jorge Delacruz', 'Rick Perez', 'Manny Zepeda', 'Yanni Zepeda', 'Aaron L',
  'Jr Zepeda',
];

function seedDummyPlayersIfNeeded(db: Database.Database): void {
  // Legacy migration — kept so the migration record is not re-run as a no-op
  db.prepare("INSERT OR IGNORE INTO migrations (name) VALUES ('seed_dummy_players')").run();
  seedRealPlayersIfNeeded(db);
}

function seedRealPlayersIfNeeded(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM migrations WHERE name = 'seed_real_players_v1'")
    .get();

  if (exists) return;

  db.transaction(() => {
    // Remove any dummy players that have no registrations
    db.prepare(
      `DELETE FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM registrations)`
    ).run();

    const insertPlayer = db.prepare(
      'INSERT OR IGNORE INTO players (name) VALUES (@name)'
    );
    for (const name of ROSTER_PLAYERS) {
      insertPlayer.run({ name });
    }

    db.prepare("INSERT INTO migrations (name) VALUES ('seed_real_players_v1')").run();
  })();
}

function seedScoringMatrixIfNeeded(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM migrations WHERE name = 'seed_scoring_matrix'")
    .get();

  if (exists) return;

  // Default scoring matrix based on field size
  const scoringData = [
    [1, 32.0, 48.0, 64.0, 80.0, 96.0, 112.0, 128.0],
    [2, 24.0, 36.0, 48.0, 60.0, 72.0, 84.0, 96.0],
    [3, 16.0, 24.0, 32.0, 40.0, 48.0, 56.0, 64.0],
    [4, 12.0, 18.0, 24.0, 30.0, 36.0, 42.0, 48.0],
    [5, 8.0, 12.0, 16.0, 20.0, 24.0, 28.0, 32.0],
    [6, 6.0, 9.0, 12.0, 15.0, 18.0, 21.0, 24.0],
    [7, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
    [8, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0],
    [9, 1.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0],
    [10, 0.5, 1.5, 2.0, 4.0, 6.0, 8.0, 10.0],
  ];

  db.transaction(() => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO scoring_matrix 
       (placement, players_10, players_15, players_20, players_25, players_30, players_35, players_40)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of scoringData) {
      insert.run(...row);
    }

    db.prepare("INSERT INTO migrations (name) VALUES ('seed_scoring_matrix')").run();
  })();
}

function seedExactOptScoringPointsIfNeeded(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM migrations WHERE name = 'seed_scoring_points_opt2026_v1'")
    .get();

  if (exists) return;

  db.transaction(() => {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO scoring_points (placement, player_count, points)
       VALUES (?, ?, ?)`
    );

    for (const row of OPT_2026_SCORING_POINTS) {
      insert.run(row.placement, row.playerCount, row.points);
    }

    db.prepare("INSERT INTO migrations (name) VALUES ('seed_scoring_points_opt2026_v1')").run();
  })();
}

function normalizeTournamentStatusesIfNeeded(db: Database.Database): void {
  const exists = db
    .prepare("SELECT 1 FROM migrations WHERE name = 'normalize_tournament_status_v2'")
    .get();

  if (exists) return;

  db.transaction(() => {
    db.prepare("UPDATE tournaments SET status = 'pending' WHERE status IN ('running', 'active')").run();
    db.prepare("UPDATE tournaments SET status = 'finished' WHERE status IN ('closed')").run();
    db.prepare("INSERT INTO migrations (name) VALUES ('normalize_tournament_status_v2')").run();
  })();
}
