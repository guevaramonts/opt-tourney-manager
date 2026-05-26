import pool from './pool';

const OPT_PLAYERS = [
  'Brian Cooke', 'Jake Castaneda', 'Mitch May', 'Danny Delgado', 'Liliana Olalde',
  'Mark Callejo', 'Joe Greco', 'Monty Guevara', 'Marijana Wendt', 'Addie Burkhart',
  'Jose Zepeda', 'Matthew Gutierrez', 'Ryan Skarb', 'Vince Marzella', 'Heidi Obrien',
  'Shaun Green', 'Norberto Olalde', 'Kosta Zepeda', 'Garrick Gutierrez', 'Jaime Zepeda',
  'Brian Lilly', 'Guilllermo Delacruz', 'Connor Ray', 'Nena Guevara', 'Gary Slipke',
  'Julie Delgado', 'Kristen Gutierrez', 'Jeremy Hein', 'Ricardo Delgado', 'Andy Ceponis',
  'Joe Gonzalez', 'Jacob May', 'Julie Greco', 'Zeek Escamilla', 'Elda Jonson',
  'Jorge Delacruz', 'Rick Perez', 'Manny Zepeda', 'Yanni Zepeda', 'Aaron L', 'Jr Zepeda',
];

const DEFAULT_BLIND_STRUCTURE = [
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

const SCORING_MATRIX = [
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

async function hasMigration(name: string): Promise<boolean> {
  const res = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [name]);
  return (res.rowCount ?? 0) > 0;
}

async function recordMigration(name: string): Promise<void> {
  await pool.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id      SERIAL PRIMARY KEY,
        name    TEXT    NOT NULL UNIQUE,
        applied TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blind_structures (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tournaments (
        id                 SERIAL PRIMARY KEY,
        name               TEXT    NOT NULL,
        buy_in             INTEGER NOT NULL,
        bounty_amount      INTEGER NOT NULL DEFAULT 0,
        blind_structure_id INTEGER REFERENCES blind_structures(id),
        status             TEXT    NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS blind_structure_levels (
        id                 SERIAL PRIMARY KEY,
        blind_structure_id INTEGER NOT NULL REFERENCES blind_structures(id) ON DELETE CASCADE,
        level              INTEGER NOT NULL,
        small_blind        INTEGER NOT NULL DEFAULT 0,
        big_blind          INTEGER NOT NULL DEFAULT 0,
        ante               INTEGER NOT NULL DEFAULT 0,
        duration_seconds   INTEGER NOT NULL DEFAULT 900,
        is_break           BOOLEAN NOT NULL DEFAULT FALSE,
        break_label        TEXT,
        UNIQUE(blind_structure_id, level)
      );

      CREATE TABLE IF NOT EXISTS players (
        id                    SERIAL PRIMARY KEY,
        name                  TEXT    NOT NULL UNIQUE,
        nickname              TEXT,
        email                 TEXT,
        phone                 TEXT,
        total_career_earnings INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tables (
        id   SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS registrations (
        id                 SERIAL PRIMARY KEY,
        tournament_id      INTEGER NOT NULL REFERENCES tournaments(id),
        player_id          INTEGER NOT NULL REFERENCES players(id),
        table_id           INTEGER REFERENCES tables(id),
        seat_number        INTEGER,
        chip_count         INTEGER NOT NULL DEFAULT 10000,
        is_active          BOOLEAN NOT NULL DEFAULT TRUE,
        bounties_collected INTEGER NOT NULL DEFAULT 0,
        UNIQUE(tournament_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS bounty_log (
        id            SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
        killer_id     INTEGER NOT NULL REFERENCES players(id),
        victim_id     INTEGER NOT NULL REFERENCES players(id),
        timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blind_structure (
        id               SERIAL PRIMARY KEY,
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
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        status     TEXT NOT NULL DEFAULT 'pending',
        start_date TEXT,
        end_date   TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS season_tournaments (
        id                SERIAL PRIMARY KEY,
        season_id         INTEGER NOT NULL REFERENCES seasons(id),
        tournament_id     INTEGER NOT NULL REFERENCES tournaments(id),
        tournament_number INTEGER NOT NULL,
        UNIQUE(season_id, tournament_id)
      );

      CREATE TABLE IF NOT EXISTS season_results (
        id            SERIAL PRIMARY KEY,
        season_id     INTEGER NOT NULL REFERENCES seasons(id),
        player_id     INTEGER NOT NULL REFERENCES players(id),
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
        placement     INTEGER NOT NULL,
        bounties      INTEGER NOT NULL DEFAULT 0,
        points        NUMERIC(12,9) NOT NULL DEFAULT 0,
        is_opt_player BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE(season_id, tournament_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS scoring_matrix (
        id         SERIAL PRIMARY KEY,
        placement  INTEGER NOT NULL,
        players_10 NUMERIC(12,9),
        players_15 NUMERIC(12,9),
        players_20 NUMERIC(12,9),
        players_25 NUMERIC(12,9),
        players_30 NUMERIC(12,9),
        players_35 NUMERIC(12,9),
        players_40 NUMERIC(12,9),
        UNIQUE(placement)
      );

      CREATE TABLE IF NOT EXISTS scoring_points (
        id           SERIAL PRIMARY KEY,
        placement    INTEGER NOT NULL,
        player_count INTEGER NOT NULL,
        points       NUMERIC(12,9) NOT NULL,
        UNIQUE(placement, player_count)
      );
    `);

    // Add firebase_uid to players
    if (!(await hasMigration('add_firebase_uid_v1'))) {
      await client.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE
      `);
      await recordMigration('add_firebase_uid_v1');
    }

    // Invitations table
    if (!(await hasMigration('create_invitations_v1'))) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS invitations (
          id            SERIAL PRIMARY KEY,
          tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          email         TEXT    NOT NULL,
          token         TEXT    NOT NULL UNIQUE,
          status        TEXT    NOT NULL DEFAULT 'pending',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at    TIMESTAMPTZ,
          UNIQUE(tournament_id, email)
        )
      `);
      await recordMigration('create_invitations_v1');
    }

    // Seed tables
    if (!(await hasMigration('seed_tables_v1'))) {
      for (const name of ['Hearts', 'Spades', 'Clubs', 'Diamonds']) {
        await client.query('INSERT INTO tables (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      }
      await recordMigration('seed_tables_v1');
    }

    // Seed default blind structure
    if (!(await hasMigration('seed_blind_structures_v1'))) {
      await client.query("INSERT INTO blind_structures (name) VALUES ('OPT Default') ON CONFLICT DO NOTHING");
      const { rows } = await client.query("SELECT id FROM blind_structures WHERE name = 'OPT Default'");
      const structureId = rows[0].id;
      for (const row of DEFAULT_BLIND_STRUCTURE) {
        await client.query(
          `INSERT INTO blind_structure_levels
             (blind_structure_id, level, small_blind, big_blind, ante, duration_seconds, is_break, break_label)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL)
           ON CONFLICT (blind_structure_id, level) DO NOTHING`,
          [structureId, row.level, row.small, row.big, row.ante, row.duration * 60]
        );
      }
      await recordMigration('seed_blind_structures_v1');
    }

    // Seed players
    if (!(await hasMigration('seed_real_players_v1'))) {
      for (const name of OPT_PLAYERS) {
        await client.query('INSERT INTO players (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      }
      await recordMigration('seed_real_players_v1');
    }

    // Seed scoring matrix
    if (!(await hasMigration('seed_scoring_matrix'))) {
      for (const row of SCORING_MATRIX) {
        await client.query(
          `INSERT INTO scoring_matrix
             (placement, players_10, players_15, players_20, players_25, players_30, players_35, players_40)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (placement) DO NOTHING`,
          row
        );
      }
      await recordMigration('seed_scoring_matrix');
    }

    console.log('Migrations complete');
  } finally {
    client.release();
  }
}
