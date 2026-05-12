import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { getDatabase } from '../../database/DatabaseService';
import { TournamentEngine } from '../../engine/TournamentEngine';
import type { ConsolidationPlan, RebalanceSuggestion } from '../../src/shared/types';

// Single engine instance for the lifetime of the app
const engine = new TournamentEngine();

/**
 * Registers all IPC handlers for the main process.
 * @param ipcMain  - Electron's ipcMain instance
 * @param getClockWindow - Getter for the clock BrowserWindow (may be null)
 */
export function registerIpcHandlers(
  ipcMain: IpcMain,
  _getClockWindow: () => BrowserWindow | null
): void {
  const db = getDatabase();
  const TABLE_MAX_SEATS = 10;
  let clockTournamentId: number | null = null;

  function loadLevelsForTournament(tournamentId: number): Array<{
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    durationSeconds: number;
    isBreak: boolean;
    breakLabel: string | null;
  }> {
    const tournament = db
      .prepare('SELECT blind_structure_id FROM tournaments WHERE id = ?')
      .get(tournamentId) as { blind_structure_id: number | null } | undefined;

    let structureId = tournament?.blind_structure_id ?? null;

    if (structureId === null) {
      const fallback = db
        .prepare("SELECT id FROM blind_structures WHERE name = 'OPT Default' ORDER BY id LIMIT 1")
        .get() as { id: number } | undefined;
      structureId = fallback?.id ?? null;
    }

    if (structureId === null) return [];

    const rows = db
      .prepare(
        `SELECT level, small_blind, big_blind, duration_seconds, is_break, break_label
         FROM blind_structure_levels
         WHERE blind_structure_id = ?
         ORDER BY level ASC`
      )
      .all(structureId) as Array<{
      level: number;
      small_blind: number;
      big_blind: number;
      duration_seconds: number;
      is_break: 0 | 1;
      break_label: string | null;
    }>;

    return rows.map((row) => ({
      level: row.level,
      smallBlind: row.small_blind,
      bigBlind: row.big_blind,
      ante: 0,
      durationSeconds: row.duration_seconds,
      isBreak: row.is_break === 1,
      breakLabel: row.break_label,
    }));
  }

  function buildSeatChart(tournamentId: number) {
    return db
      .prepare(
        `SELECT p.name AS player_name, t.name AS table_name, r.seat_number
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         JOIN tables t ON t.id = r.table_id
         WHERE r.tournament_id = ? AND r.is_active = 1
         ORDER BY t.id, r.seat_number`
      )
      .all(tournamentId);
  }

  function nextOccupiedSeat(occupiedSeats: number[], seat: number): number {
    if (occupiedSeats.length === 0) return 1;
    const next = occupiedSeats.find((value) => value > seat);
    return next ?? occupiedSeats[0];
  }

  function getActiveSeatsForTable(tournamentId: number, tableId: number): number[] {
    const rows = db
      .prepare(
        `SELECT seat_number
         FROM registrations
         WHERE tournament_id = ? AND table_id = ? AND is_active = 1 AND seat_number IS NOT NULL
         ORDER BY seat_number`
      )
      .all(tournamentId, tableId) as Array<{ seat_number: number }>;
    return rows.map((row) => row.seat_number);
  }

  function getTableButtonSeat(tournamentId: number, tableId: number): number {
    const existing = db
      .prepare(
        `SELECT button_seat
         FROM table_state
         WHERE tournament_id = ? AND table_id = ?`
      )
      .get(tournamentId, tableId) as { button_seat: number } | undefined;

    if (!existing) {
      const seats = getActiveSeatsForTable(tournamentId, tableId);
      const seedSeat = seats[0] ?? 1;
      db.prepare(
        `INSERT INTO table_state (tournament_id, table_id, button_seat)
         VALUES (?, ?, ?)`
      ).run(tournamentId, tableId, seedSeat);
      return seedSeat;
    }

    return existing.button_seat;
  }

  function normalizeTableButtonSeat(tournamentId: number, tableId: number): number {
    const seats = getActiveSeatsForTable(tournamentId, tableId);
    if (seats.length === 0) {
      db.prepare(
        `INSERT INTO table_state (tournament_id, table_id, button_seat)
         VALUES (?, ?, 1)
         ON CONFLICT(tournament_id, table_id)
         DO UPDATE SET button_seat = 1`
      ).run(tournamentId, tableId);
      return 1;
    }

    const buttonSeat = getTableButtonSeat(tournamentId, tableId);
    if (seats.includes(buttonSeat)) return buttonSeat;

    const normalized = nextOccupiedSeat(seats, buttonSeat);
    db.prepare(
      `UPDATE table_state
       SET button_seat = ?
       WHERE tournament_id = ? AND table_id = ?`
    ).run(normalized, tournamentId, tableId);
    return normalized;
  }

  function advanceButtonSeat(tournamentId: number, tableId: number): number {
    const seats = getActiveSeatsForTable(tournamentId, tableId);
    if (seats.length === 0) {
      db.prepare(
        `UPDATE table_state
         SET button_seat = 1
         WHERE tournament_id = ? AND table_id = ?`
      ).run(tournamentId, tableId);
      return 1;
    }

    const current = normalizeTableButtonSeat(tournamentId, tableId);
    const next = nextOccupiedSeat(seats, current);
    db.prepare(
      `UPDATE table_state
       SET button_seat = ?
       WHERE tournament_id = ? AND table_id = ?`
    ).run(next, tournamentId, tableId);
    return next;
  }

  function pickRebalanceDestinationSeat(tournamentId: number, tableId: number): number {
    const occupiedSeats = getActiveSeatsForTable(tournamentId, tableId);
    if (occupiedSeats.length === 0) return 1;

    // First, look for the most recently eliminated player's seat on this table.
    const recentElimination = db
      .prepare(
        `SELECT r.seat_number
         FROM registrations r
         JOIN bounty_log bl ON bl.victim_id = r.player_id
         WHERE bl.tournament_id = ? AND r.table_id = ? AND r.is_active = 0 AND r.seat_number IS NOT NULL
         ORDER BY bl.id DESC
         LIMIT 1`
      )
      .get(tournamentId, tableId) as { seat_number: number } | undefined;

    // Prefer the most recently vacated elimination seat if it's available.
    if (recentElimination && !occupiedSeats.includes(recentElimination.seat_number)) {
      return recentElimination.seat_number;
    }

    // Otherwise fill gaps (gaps from prior eliminations without moves).
    const maxSeat = Math.max(TABLE_MAX_SEATS, occupiedSeats[occupiedSeats.length - 1] + 1);
    const availableSeats: number[] = [];
    for (let seat = 1; seat <= maxSeat; seat++) {
      if (!occupiedSeats.includes(seat)) availableSeats.push(seat);
    }

    if (availableSeats.length > 0) return Math.min(...availableSeats);

    // Fallback when there are no gaps in current seat range.
    return occupiedSeats[occupiedSeats.length - 1] + 1;
  }

  function reassignAllSeats(tournamentId: number): number {
    // Fetch all active players and shuffle them.
    const players = db
      .prepare('SELECT player_id FROM registrations WHERE tournament_id = ? AND is_active = 1')
      .all(tournamentId) as { player_id: number }[];

    const tables = db.prepare('SELECT id FROM tables ORDER BY id').all() as Array<{ id: number }>;

    if (tables.length === 0) return 0;

    // Fisher-Yates shuffle.
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Assign via round-robin distribution.
    const seatCounts: Record<number, number> = {};
    shuffled.forEach((p, i) => {
      const table = tables[i % tables.length];
      seatCounts[table.id] = (seatCounts[table.id] ?? 0) + 1;
      db.prepare(
        'UPDATE registrations SET table_id = ?, seat_number = ? WHERE tournament_id = ? AND player_id = ?'
      ).run(table.id, seatCounts[table.id], tournamentId, p.player_id);
    });

    // Initialize button positions for all tables.
    for (const table of tables) {
      const seats = getActiveSeatsForTable(tournamentId, table.id);
      const buttonSeat = seats[0] ?? 1;
      db.prepare(
        `INSERT INTO table_state (tournament_id, table_id, button_seat)
         VALUES (?, ?, ?)
         ON CONFLICT(tournament_id, table_id)
         DO UPDATE SET button_seat = excluded.button_seat`
      ).run(tournamentId, table.id, buttonSeat);
    }

    return shuffled.length;
  }

  function broadcastSeatChart(tournamentId: number): void {
    const chart = buildSeatChart(tournamentId);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('seats:assigned', { chart });
    });
  }

  function getRebalanceSuggestion(tournamentId: number): RebalanceSuggestion | null {
    const tableCounts = db
      .prepare(
        `SELECT t.id, t.name, COUNT(r.player_id) AS player_count
         FROM tables t
         LEFT JOIN registrations r
           ON r.table_id = t.id
          AND r.tournament_id = ?
          AND r.is_active = 1
         GROUP BY t.id, t.name
         HAVING COUNT(r.player_id) > 0
         ORDER BY player_count DESC, t.id ASC`
      )
      .all(tournamentId) as Array<{ id: number; name: string; player_count: number }>;

    if (tableCounts.length < 2) return null;

    const source = tableCounts[0];
    const target = tableCounts[tableCounts.length - 1];
    if (source.player_count - target.player_count < 2) return null;

    const candidates = db
      .prepare(
        `SELECT p.id AS playerId, p.name, r.table_id AS tableId, t.name AS tableName,
                r.seat_number AS seatNumber, r.chip_count AS chipCount
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         JOIN tables t ON t.id = r.table_id
         WHERE r.tournament_id = ? AND r.is_active = 1 AND r.table_id = ?
         ORDER BY r.seat_number`
      )
      .all(tournamentId, source.id) as RebalanceSuggestion['candidates'];

    return {
      sourceTableId: source.id,
      sourceTableName: source.name,
      sourceCount: source.player_count,
      targetTableId: target.id,
      targetTableName: target.name,
      targetCount: target.player_count,
      candidates,
    };
  }

  function getActiveTableCounts(tournamentId: number): Array<{ id: number; name: string; player_count: number }> {
    return db
      .prepare(
        `SELECT t.id, t.name, COUNT(r.player_id) AS player_count
         FROM tables t
         LEFT JOIN registrations r
           ON r.table_id = t.id
          AND r.tournament_id = ?
          AND r.is_active = 1
         GROUP BY t.id, t.name
         HAVING COUNT(r.player_id) > 0
         ORDER BY t.id`
      )
      .all(tournamentId) as Array<{ id: number; name: string; player_count: number }>;
  }

  function buildConsolidationPlan(tournamentId: number): ConsolidationPlan {
    const activeTables = getActiveTableCounts(tournamentId);
    const totalActivePlayers = activeTables.reduce((sum, table) => sum + table.player_count, 0);
    const targetActiveTables = totalActivePlayers <= 10 ? 1 : 2;

    if (activeTables.length <= targetActiveTables) {
      return {
        eligible: false,
        reason:
          targetActiveTables === 1
            ? 'Final-wave consolidation is available only when more than one table is active.'
            : 'Consolidation wave available only when more than two tables are active.',
        sourceTables: [],
        destinationTables: activeTables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          playerCount: table.player_count,
          openSeats: Math.max(0, TABLE_MAX_SEATS - table.player_count),
        })),
        totalPlayersToMove: 0,
        totalOpenSeats: activeTables.reduce((sum, table) => sum + Math.max(0, TABLE_MAX_SEATS - table.player_count), 0),
        previewMoves: [],
      };
    }

    if (totalActivePlayers > 20) {
      return {
        eligible: false,
        reason: `Consolidation wave opens at 20 or fewer active players (currently ${totalActivePlayers}).`,
        sourceTables: [],
        destinationTables: activeTables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          playerCount: table.player_count,
          openSeats: Math.max(0, TABLE_MAX_SEATS - table.player_count),
        })),
        totalPlayersToMove: 0,
        totalOpenSeats: activeTables.reduce((sum, table) => sum + Math.max(0, TABLE_MAX_SEATS - table.player_count), 0),
        previewMoves: [],
      };
    }

    const orderedBySizeDesc = [...activeTables].sort(
      (a, b) => (b.player_count - a.player_count) || (a.id - b.id)
    );

    const destinationSeed = orderedBySizeDesc.slice(0, targetActiveTables);
    const sourceSeed = orderedBySizeDesc.slice(targetActiveTables);
    const eligibleSourceTables = [...sourceSeed].sort(
      (a, b) => (a.player_count - b.player_count) || (a.id - b.id)
    );

    const destinationTables = destinationSeed
      .map((table) => ({
        tableId: table.id,
        tableName: table.name,
        playerCount: table.player_count,
        openSeats: Math.max(0, TABLE_MAX_SEATS - table.player_count),
      }));

    const totalPlayersToMove = eligibleSourceTables.reduce((sum, table) => sum + table.player_count, 0);
    const totalOpenSeats = destinationTables.reduce((sum, table) => sum + (table.openSeats ?? 0), 0);

    if (destinationTables.length === 0) {
      return {
        eligible: false,
        reason: 'No destination tables available for consolidation.',
        sourceTables: eligibleSourceTables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          playerCount: table.player_count,
        })),
        destinationTables,
        totalPlayersToMove,
        totalOpenSeats,
        previewMoves: [],
      };
    }

    if (totalOpenSeats < totalPlayersToMove) {
      return {
        eligible: false,
        reason: `Need ${totalPlayersToMove} open seats to consolidate, but only ${totalOpenSeats} are currently available.`,
        sourceTables: eligibleSourceTables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          playerCount: table.player_count,
        })),
        destinationTables,
        totalPlayersToMove,
        totalOpenSeats,
        previewMoves: [],
      };
    }

    const simulatedCounts = new Map<number, number>(
      destinationTables.map((table) => [table.tableId, table.playerCount])
    );
    const destinationNames = new Map<number, string>(
      destinationTables.map((table) => [table.tableId, table.tableName])
    );

    const previewMoves: ConsolidationPlan['previewMoves'] = [];
    const orderedSources = [...eligibleSourceTables].sort(
      (a, b) => (a.player_count - b.player_count) || (a.id - b.id)
    );

    for (const source of orderedSources) {
      const sourcePlayers = db
        .prepare(
          `SELECT r.player_id, p.name
           FROM registrations r
           JOIN players p ON p.id = r.player_id
           WHERE r.tournament_id = ? AND r.table_id = ? AND r.is_active = 1
           ORDER BY r.seat_number, r.player_id`
        )
        .all(tournamentId, source.id) as Array<{ player_id: number; name: string }>;

      for (const player of sourcePlayers) {
        const destination = Array.from(simulatedCounts.entries())
          .filter(([, count]) => count < TABLE_MAX_SEATS)
          .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))[0];

        if (!destination) break;

        const toTableId = destination[0];
        previewMoves.push({
          playerId: player.player_id,
          playerName: player.name,
          fromTableId: source.id,
          fromTableName: source.name,
          toTableId,
          toTableName: destinationNames.get(toTableId) ?? `Table ${toTableId}`,
        });
        simulatedCounts.set(toTableId, destination[1] + 1);
      }
    }

    return {
      eligible: true,
      reason: `Consolidation wave ready: ${totalActivePlayers} active players can be merged into ${targetActiveTables} table${targetActiveTables === 1 ? '' : 's'} by moving ${totalPlayersToMove} players.`,
      sourceTables: eligibleSourceTables.map((table) => ({
        tableId: table.id,
        tableName: table.name,
        playerCount: table.player_count,
      })),
      destinationTables,
      totalPlayersToMove,
      totalOpenSeats,
      previewMoves,
    };
  }

  function getPlacementPoints(placement: number, playerCount: number): number {
    const normalizedPlayerCount = Math.max(10, Math.min(41, playerCount));

    const exactScoringRow = db
      .prepare(
        `SELECT points
         FROM scoring_points
         WHERE placement = ? AND player_count = ?`
      )
      .get(placement, normalizedPlayerCount) as { points: number } | undefined;

    if (exactScoringRow?.points !== undefined) {
      return exactScoringRow.points;
    }

    // Backward compatibility for DBs still using only the legacy matrix.
    const playerBucket = Math.min(40, Math.ceil(normalizedPlayerCount / 5) * 5);
    const playerColumn = `players_${playerBucket}` as
      | 'players_10'
      | 'players_15'
      | 'players_20'
      | 'players_25'
      | 'players_30'
      | 'players_35'
      | 'players_40';

    const scoringRow = db
      .prepare(`SELECT ${playerColumn} FROM scoring_matrix WHERE placement = ?`)
      .get(placement) as { [key: string]: number | null } | undefined;

    return scoringRow?.[playerColumn] ?? 0;
  }

  function processEliminationsBatch(tournamentId: number, eliminations: Array<{ killerId: number; victimId: number }>) {
    if (eliminations.length === 0) {
      return { ok: true, rebalance: getRebalanceSuggestion(tournamentId) };
    }

    const victimRows = db
      .prepare(
        `SELECT r.player_id, r.table_id, r.bounties_collected, p.name
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ? AND r.is_active = 1`
      )
      .all(tournamentId) as Array<{ player_id: number; table_id: number | null; bounties_collected: number; name: string }>;

    const victimLookup = new Map(victimRows.map((row) => [row.player_id, row]));
    const seenVictims = new Set<number>();
    const validEliminations: Array<{ killerId: number; victimId: number }> = [];

    for (const elimination of eliminations) {
      if (seenVictims.has(elimination.victimId)) continue;
      const victim = victimLookup.get(elimination.victimId);
      if (!victim) continue;
      if (elimination.killerId === elimination.victimId) continue;
      seenVictims.add(elimination.victimId);
      validEliminations.push(elimination);
    }

    if (validEliminations.length === 0) {
      return { ok: true, rebalance: getRebalanceSuggestion(tournamentId) };
    }

    const affectedTables = new Set<number>();
    const totalEntrants = (
      db
        .prepare('SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = ?')
        .get(tournamentId) as { count: number }
    ).count;
    const activeBeforeBatch = victimRows.length;
    const eliminationSummaries: Array<{
      killerId: number;
      killerName: string;
      victimId: number;
      victimName: string;
      placement: number;
      placementPoints: number;
      victimBountiesCollected: number;
    }> = [];

    const eliminate = db.transaction(() => {
      for (const [index, elimination] of validEliminations.entries()) {
        const victim = victimLookup.get(elimination.victimId);
        if (!victim) continue;
        const killer = victimLookup.get(elimination.killerId);
        const placement = activeBeforeBatch - index;
        const placementPoints = getPlacementPoints(placement, totalEntrants);

        db.prepare(
          `UPDATE registrations
           SET is_active = 0
           WHERE tournament_id = ? AND player_id = ?`
        ).run(tournamentId, elimination.victimId);

        db.prepare(
          `UPDATE registrations
           SET bounties_collected = bounties_collected + 1
           WHERE tournament_id = ? AND player_id = ?`
        ).run(tournamentId, elimination.killerId);

        db.prepare(
          `INSERT INTO bounty_log (tournament_id, killer_id, victim_id)
           VALUES (?, ?, ?)`
        ).run(tournamentId, elimination.killerId, elimination.victimId);

        if (victim.table_id !== null) affectedTables.add(victim.table_id);
        eliminationSummaries.push({
          killerId: elimination.killerId,
          killerName: killer?.name ?? 'Unknown',
          victimId: elimination.victimId,
          victimName: victim.name,
          placement,
          placementPoints,
          victimBountiesCollected: victim.bounties_collected,
        });
      }

      for (const tableId of affectedTables) {
        advanceButtonSeat(tournamentId, tableId);
      }
    });

    eliminate();

    broadcastSeatChart(tournamentId);

    const leaderboard = db
      .prepare(
        `SELECT p.name, r.bounties_collected
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ? AND r.bounties_collected > 0
         ORDER BY r.bounties_collected DESC
         LIMIT 3`
      )
      .all(tournamentId);

    BrowserWindow.getAllWindows().forEach((win) => {
      for (const elimination of eliminationSummaries) {
        const killerBountyRow = db
          .prepare(
            `SELECT bounties_collected
             FROM registrations
             WHERE tournament_id = ? AND player_id = ?`
          )
          .get(tournamentId, elimination.killerId) as { bounties_collected: number } | undefined;

        const killerBountiesCollected = killerBountyRow?.bounties_collected ?? 0;

        win.webContents.send('player:eliminated', {
          tournamentId,
          killerId: elimination.killerId,
          killerName: elimination.killerName,
          victimId: elimination.victimId,
          victimName: elimination.victimName,
          placement: elimination.placement,
          awards: [
            {
              playerId: elimination.victimId,
              playerName: elimination.victimName,
              kind: 'placement',
              points: elimination.placementPoints,
              totalPoints: elimination.placementPoints + elimination.victimBountiesCollected * 3,
              placement: elimination.placement,
              bountiesCollected: elimination.victimBountiesCollected,
            },
            {
              playerId: elimination.killerId,
              playerName: elimination.killerName,
              kind: 'bounty',
              points: 3,
              totalPoints: killerBountiesCollected * 3,
              bountiesCollected: killerBountiesCollected,
            },
          ],
          leaderboard,
        });
      }
    });

    return { ok: true, rebalance: getRebalanceSuggestion(tournamentId) };
  }

  // ── Tournament ──────────────────────────────────────────────────────────────
  ipcMain.handle('tournament:create', (_event, data) => {
    const stmt = db.prepare(
      `INSERT INTO tournaments (name, buy_in, bounty_amount, blind_structure_id, status)
       VALUES (@name, @buyIn, @bountyAmount, @blindStructureId, 'pending')
       RETURNING *`
    );
    const created = stmt.get({
      ...data,
      blindStructureId: data.blindStructureId ?? null,
    }) as { id: number };
    return db
      .prepare(
        `SELECT t.*, bs.name AS blind_structure_name
         FROM tournaments t
         LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
         WHERE t.id = ?`
      )
      .get(created.id);
  });

  ipcMain.handle('tournament:get', (_event, id: number) => {
    return db
      .prepare(
        `SELECT t.*, bs.name AS blind_structure_name
         FROM tournaments t
         LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
         WHERE t.id = ?`
      )
      .get(id);
  });

  ipcMain.handle('tournament:getAll', () => {
    return db
      .prepare(
        `SELECT t.*, COUNT(r.id) AS player_count
            , bs.name AS blind_structure_name
         FROM tournaments t
         LEFT JOIN registrations r ON r.tournament_id = t.id
          LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
         WHERE t.id != 0
         GROUP BY t.id
         ORDER BY t.id DESC`
      )
      .all();
  });

        ipcMain.handle('tournament:update', (_event, data: { id: number; name: string; buyIn: number; bountyAmount: number; blindStructureId?: number | null }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Tournament name is required');

    const existing = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(data.id) as { id: number } | undefined;
    if (!existing) throw new Error('Tournament not found');

    db.prepare(
      `UPDATE tournaments
       SET name = ?, buy_in = ?, bounty_amount = ?, blind_structure_id = ?
       WHERE id = ?`
    ).run(trimmed, data.buyIn, data.bountyAmount, data.blindStructureId ?? null, data.id);

    return db
      .prepare(
        `SELECT t.*, bs.name AS blind_structure_name
         FROM tournaments t
         LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
         WHERE t.id = ?`
      )
      .get(data.id);
  });

  ipcMain.handle('tournament:finish', (_event, tournamentId: number) => {
    // Mark tournament finished
    db.prepare(`UPDATE tournaments SET status = 'finished' WHERE id = ?`).run(tournamentId);

    // Credit total bounty earnings to each player's career total
    const bountyWinners = db
      .prepare(
        `SELECT player_id, bounties_collected, t.bounty_amount
         FROM registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.tournament_id = ? AND r.bounties_collected > 0`
      )
      .all(tournamentId) as { player_id: number; bounties_collected: number; bounty_amount: number }[];

    const updateEarnings = db.prepare(
      `UPDATE players SET total_career_earnings = total_career_earnings + ? WHERE id = ?`
    );

    const finish = db.transaction(() => {
      for (const row of bountyWinners) {
        updateEarnings.run(row.bounties_collected * row.bounty_amount, row.player_id);
      }
    });
    finish();

    return { ok: true };
  });

  // ── Finalize Tournament ────────────────────────────────────────────────────
  // Atomically: mark finalized, credit bounty earnings, and commit season results.
  ipcMain.handle('tournament:finalize', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT id, name, status FROM tournaments WHERE id = ?')
      .get(tournamentId) as { id: number; name: string; status: string } | undefined;

    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status === 'finalized') throw new Error('Tournament is already finalized');

    // ── Collect data needed for sync before transaction ────────────────────
    const registrations = db
      .prepare(
        `SELECT r.player_id, p.name AS player_name, r.is_active, r.bounties_collected, r.chip_count
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ?`
      )
      .all(tournamentId) as Array<{
      player_id: number;
      player_name: string;
      is_active: 0 | 1;
      bounties_collected: number;
      chip_count: number;
    }>;

    const eliminatedOrder = db
      .prepare(
        `SELECT victim_id FROM bounty_log
         WHERE tournament_id = ?
         ORDER BY timestamp ASC, id ASC`
      )
      .all(tournamentId) as Array<{ victim_id: number }>;

    // Resolve placements from elimination log + remaining chip counts
    const placements = new Map<number, number>();
    const seenVictims = new Set<number>();
    let nextElimPlacement = registrations.length;
    for (const row of eliminatedOrder) {
      if (seenVictims.has(row.victim_id)) continue;
      seenVictims.add(row.victim_id);
      placements.set(row.victim_id, nextElimPlacement);
      nextElimPlacement -= 1;
    }

    const unresolved = registrations.filter((r) => !placements.has(r.player_id));
    const sorted = [...unresolved].sort((a, b) => {
      if (b.is_active !== a.is_active) return b.is_active - a.is_active;
      if (b.chip_count !== a.chip_count) return b.chip_count - a.chip_count;
      return a.player_id - b.player_id;
    });
    let nextTopPlacement = 1;
    for (const r of sorted.filter((e) => e.is_active === 1)) {
      placements.set(r.player_id, nextTopPlacement);
      nextTopPlacement += 1;
    }
    let fillPlacement = registrations.length;
    for (const r of sorted.filter((e) => !placements.has(e.player_id))) {
      while ([...placements.values()].includes(fillPlacement) && fillPlacement > 0) fillPlacement -= 1;
      placements.set(r.player_id, Math.max(fillPlacement, nextTopPlacement));
      fillPlacement -= 1;
    }

    const finalizeSummary = registrations
      .map((row) => {
        const placement = placements.get(row.player_id) ?? registrations.length;
        const bountyPoints = row.bounties_collected * 3;
        const tournamentPoints = getPlacementPoints(placement, registrations.length);
        return {
          player_id: row.player_id,
          player_name: row.player_name,
          placement,
          bounty_points: bountyPoints,
          tournament_points: tournamentPoints,
          total_points: tournamentPoints + bountyPoints,
        };
      })
      .sort((a, b) => (a.placement - b.placement) || a.player_name.localeCompare(b.player_name));

    const totalPointsByPlayer = new Map<number, number>(
      finalizeSummary.map((row) => [row.player_id, row.total_points])
    );

    // Find all seasons this tournament is linked to
    const linkedSeasons = db
      .prepare('SELECT season_id FROM season_tournaments WHERE tournament_id = ?')
      .all(tournamentId) as Array<{ season_id: number }>;

    const finalize = db.transaction(() => {
      // 1. Mark tournament finalized
      db.prepare(`UPDATE tournaments SET status = 'finalized' WHERE id = ?`).run(tournamentId);

      // 2. Credit bounty earnings to career totals
      const bountyWinners = db
        .prepare(
          `SELECT player_id, bounties_collected, t.bounty_amount
           FROM registrations r
           JOIN tournaments t ON t.id = r.tournament_id
           WHERE r.tournament_id = ? AND r.bounties_collected > 0`
        )
        .all(tournamentId) as { player_id: number; bounties_collected: number; bounty_amount: number }[];

      const updateEarnings = db.prepare(
        `UPDATE players SET total_career_earnings = total_career_earnings + ? WHERE id = ?`
      );
      for (const row of bountyWinners) {
        updateEarnings.run(row.bounties_collected * row.bounty_amount, row.player_id);
      }

      // 3. Commit season results for every linked season
      const upsert = db.prepare(
        `INSERT OR REPLACE INTO season_results
           (season_id, player_id, tournament_id, placement, bounties, points, is_opt_player)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      let totalUpserted = 0;
      for (const { season_id: seasonId } of linkedSeasons) {
        for (const row of registrations) {
          const placement = placements.get(row.player_id) ?? registrations.length;
          const totalPoints = totalPointsByPlayer.get(row.player_id)
            ?? computeSeasonTotalPoints(tournamentId, placement, row.bounties_collected);
          // players table does not carry is_opt_player; default season result rows to OPT-eligible.
          upsert.run(seasonId, row.player_id, tournamentId, placement, row.bounties_collected, totalPoints, 1);
          totalUpserted += 1;
        }
      }

      return totalUpserted;
    });

    const resultsCommitted = finalize();
    return { ok: true, resultsCommitted, summary: finalizeSummary };
  });

  ipcMain.handle('tournament:delete', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT id, name, status FROM tournaments WHERE id = ?')
      .get(tournamentId) as { id: number; name: string; status: string } | undefined;

    if (!tournament) throw new Error('Tournament not found');
    if (tournament.id === 0) throw new Error('Template tournament cannot be deleted');
    if (tournament.status === 'finished' || tournament.status === 'finalized') {
      throw new Error('Completed tournaments cannot be deleted');
    }

    const removeTournament = db.transaction(() => {
      const deletedSeasonResults = db
        .prepare('DELETE FROM season_results WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedSeasonLinks = db
        .prepare('DELETE FROM season_tournaments WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedTableState = db
        .prepare('DELETE FROM table_state WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedBlindLevels = db
        .prepare('DELETE FROM blind_structure WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedBounties = db
        .prepare('DELETE FROM bounty_log WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedRegistrations = db
        .prepare('DELETE FROM registrations WHERE tournament_id = ?')
        .run(tournamentId).changes;

      const deletedTournaments = db
        .prepare('DELETE FROM tournaments WHERE id = ?')
        .run(tournamentId).changes;

      if (deletedTournaments !== 1) throw new Error('Failed to delete tournament');

      return {
        deletedSeasonResults,
        deletedSeasonLinks,
        deletedTableState,
        deletedBlindLevels,
        deletedBounties,
        deletedRegistrations,
      };
    });

    const deleted = removeTournament();

    return {
      ok: true,
      tournamentId,
      name: tournament.name,
      deleted,
    };
  });

  ipcMain.handle('tournament:resetProgress', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT id FROM tournaments WHERE id = ?')
      .get(tournamentId) as { id: number } | undefined;
    if (!tournament) throw new Error('Tournament not found');

    const reset = db.transaction(() => {
      const bountyCredits = db
        .prepare(
          `SELECT r.player_id, r.bounties_collected, t.bounty_amount
           FROM registrations r
           JOIN tournaments t ON t.id = r.tournament_id
           WHERE r.tournament_id = ? AND r.bounties_collected > 0`
        )
        .all(tournamentId) as Array<{ player_id: number; bounties_collected: number; bounty_amount: number }>;

      let rolledBackCareerEarnings = 0;
      const rollbackEarnings = db.prepare(
        `UPDATE players
         SET total_career_earnings = CASE
           WHEN total_career_earnings - ? < 0 THEN 0
           ELSE total_career_earnings - ?
         END
         WHERE id = ?`
      );
      for (const row of bountyCredits) {
        const delta = row.bounties_collected * row.bounty_amount;
        rolledBackCareerEarnings += delta;
        rollbackEarnings.run(delta, delta, row.player_id);
      }

      const clearedSeasonResults = db
        .prepare('DELETE FROM season_results WHERE tournament_id = ?')
        .run(tournamentId);

      const restored = db
        .prepare(
          `UPDATE registrations
           SET is_active = 1,
               bounties_collected = 0,
               table_id = NULL,
               seat_number = NULL
           WHERE tournament_id = ?`
        )
        .run(tournamentId);

      const cleared = db
        .prepare('DELETE FROM bounty_log WHERE tournament_id = ?')
        .run(tournamentId);

      db.prepare("UPDATE tournaments SET status = 'pending' WHERE id = ? AND status != 'finished'").run(tournamentId);

      // Clear table_state so button positions get reset.
      db.prepare('DELETE FROM table_state WHERE tournament_id = ?').run(tournamentId);

      // Reseat all restored players via random distribution.
      const reseatCount = reassignAllSeats(tournamentId);

      return {
        clearedSeasonResults: clearedSeasonResults.changes,
        restoredPlayers: restored.changes,
        clearedBountyEvents: cleared.changes,
        rolledBackCareerEarnings,
        reseatCount,
      };
    });

    const result = reset();
    broadcastSeatChart(tournamentId);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('tournament:progressReset', { tournamentId });
    });

    return {
      ok: true,
      clearedSeasonResults: result.clearedSeasonResults,
      restoredPlayers: result.restoredPlayers,
      clearedBountyEvents: result.clearedBountyEvents,
      rolledBackCareerEarnings: result.rolledBackCareerEarnings,
    };
  });

  // ── Players ──────────────────────────────────────────────────────────────────
  ipcMain.handle('player:register', (_event, data) => {
    // Reliable get-or-create: avoid RETURNING quirks on ON CONFLICT no-ops
    let player = db
      .prepare('SELECT id FROM players WHERE name = @name')
      .get({ name: data.name }) as { id: number } | undefined;

    if (!player) {
      const result = db
        .prepare('INSERT INTO players (name) VALUES (@name)')
        .run({ name: data.name });
      player = { id: Number(result.lastInsertRowid) };
    }

    // Upsert the registration so re-registering the same player is idempotent
    db.prepare(
      `INSERT INTO registrations (tournament_id, player_id, chip_count)
       VALUES (@tournamentId, @playerId, @chipCount)
       ON CONFLICT(tournament_id, player_id)
       DO UPDATE SET is_active = 1, chip_count = @chipCount`
    ).run({
      tournamentId: data.tournamentId,
      playerId: player.id,
      chipCount: data.chipCount ?? 10000,
    });

    // Return the full registration row so the renderer can confirm success
    return db
      .prepare(
        `SELECT p.id, p.name, r.player_id, r.chip_count, r.is_active, r.bounties_collected
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = @tournamentId AND r.player_id = @playerId`
      )
      .get({ tournamentId: data.tournamentId, playerId: player.id });
  });

  ipcMain.handle('player:unregister', (_event, data: { tournamentId: number; playerId: number }) => {
    db.prepare(
      'UPDATE registrations SET is_active = 0 WHERE tournament_id = @tournamentId AND player_id = @playerId'
    ).run({ tournamentId: data.tournamentId, playerId: data.playerId });

    return { ok: true };
  });

  ipcMain.handle('player:getActive', (_event, tournamentId: number) => {
    return db
      .prepare(
        `SELECT p.id, p.name, p.nickname, r.player_id, r.chip_count, r.is_active, r.bounties_collected,
                r.table_id, t.name AS table_name, r.seat_number
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         LEFT JOIN tables t ON t.id = r.table_id
         WHERE r.tournament_id = ? AND r.is_active = 1
         ORDER BY r.table_id, r.seat_number`
      )
      .all(tournamentId);
  });

  ipcMain.handle('player:getAll', () => {
    return db
      .prepare(
        `SELECT p.id, p.name, p.nickname, p.email, p.phone, p.total_career_earnings,
                COUNT(DISTINCT r.tournament_id) AS tournaments_played
         FROM players p
         LEFT JOIN registrations r ON r.player_id = p.id
         GROUP BY p.id
         ORDER BY p.name ASC`
      )
      .all();
  });

  ipcMain.handle('player:create', (_event, data: { name: string; nickname?: string; email?: string; phone?: string }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Name is required');
    const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(trimmed);
    if (existing) throw new Error(`Player "${trimmed}" already exists`);
    const nickname = data.nickname?.trim() || null;
    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;
    const result = db
      .prepare('INSERT INTO players (name, nickname, email, phone) VALUES (?, ?, ?, ?)')
      .run(trimmed, nickname, email, phone);
    return db
      .prepare('SELECT id, name, nickname, email, phone, total_career_earnings FROM players WHERE id = ?')
      .get(result.lastInsertRowid);
  });

  ipcMain.handle('player:update', (_event, data: { id: number; name?: string; nickname?: string; email?: string; phone?: string }) => {
    const playerId = data.id;
    const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId);
    if (!player) throw new Error('Player not found');

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      const trimmed = (data.name as string).trim();
      if (!trimmed) throw new Error('Name cannot be empty');
      // Check if new name is unique (ignoring current player)
      const existing = db
        .prepare('SELECT id FROM players WHERE name = ? AND id != ?')
        .get(trimmed, playerId);
      if (existing) throw new Error(`Player "${trimmed}" already exists`);
      updates.push('name = ?');
      values.push(trimmed);
    }

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email.trim() || null);
    }

    if (data.nickname !== undefined) {
      updates.push('nickname = ?');
      values.push(data.nickname.trim() || null);
    }

    if (data.phone !== undefined) {
      updates.push('phone = ?');
      values.push(data.phone.trim() || null);
    }

    if (updates.length === 0) throw new Error('No fields to update');

    values.push(playerId);
    db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { ok: true };
  });

  ipcMain.handle('player:delete', (_event, playerId: number) => {
    // Only allow delete if player has never been in a tournament
    const used = db
      .prepare('SELECT 1 FROM registrations WHERE player_id = ? LIMIT 1')
      .get(playerId);
    if (used) throw new Error('Cannot delete a player who has tournament history');
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    return { ok: true };
  });

  // ── Tables ────────────────────────────────────────────────────────────────────
  ipcMain.handle('table:getAll', () => {
    return db.prepare('SELECT * FROM tables ORDER BY id').all();
  });

  ipcMain.handle('table:getPositionState', (_event, tournamentId: number) => {
    const tables = db
      .prepare('SELECT id, name FROM tables ORDER BY id')
      .all() as Array<{ id: number; name: string }>;

    return tables.map((table) => ({
      tableId: table.id,
      tableName: table.name,
      buttonSeat: normalizeTableButtonSeat(tournamentId, table.id),
    }));
  });

  ipcMain.handle('table:getAssignments', (_event, tournamentId: number) => {
    return db
      .prepare(
        `SELECT t.id AS table_id, t.name AS table_name,
                p.id, p.name AS player_name, r.chip_count, r.is_active, r.bounties_collected,
                r.seat_number
         FROM tables t
         LEFT JOIN registrations r ON r.table_id = t.id AND r.tournament_id = ? AND r.is_active = 1
         LEFT JOIN players p ON p.id = r.player_id
         ORDER BY t.id, r.seat_number`
      )
      .all(tournamentId);
  });

  ipcMain.handle('table:getConsolidationPlan', (_event, tournamentId: number) => {
    return buildConsolidationPlan(tournamentId);
  });

  ipcMain.handle('table:executeConsolidationWave', (_event, tournamentId: number) => {
    const plan = buildConsolidationPlan(tournamentId);
    if (!plan.eligible) {
      throw new Error(plan.reason);
    }

    const sourceTableIds = new Set(plan.sourceTables.map((table) => table.tableId));
    const liveCounts = new Map<number, number>();
    for (const table of getActiveTableCounts(tournamentId)) {
      liveCounts.set(table.id, table.player_count);
    }

    let movedCount = 0;

    const execute = db.transaction(() => {
      for (const source of plan.sourceTables) {
        const sourcePlayers = db
          .prepare(
            `SELECT r.player_id
             FROM registrations r
             WHERE r.tournament_id = ? AND r.table_id = ? AND r.is_active = 1
             ORDER BY r.seat_number, r.player_id`
          )
          .all(tournamentId, source.tableId) as Array<{ player_id: number }>;

        for (const row of sourcePlayers) {
          const destination = Array.from(liveCounts.entries())
            .filter(([tableId, count]) => !sourceTableIds.has(tableId) && count < TABLE_MAX_SEATS)
            .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))[0];

          if (!destination) {
            throw new Error('Consolidation capacity changed while executing. Refresh and try again.');
          }

          const destinationTableId = destination[0];
          const nextSeat = pickRebalanceDestinationSeat(tournamentId, destinationTableId);

          db.prepare(
            `UPDATE registrations
             SET table_id = ?, seat_number = ?
             WHERE tournament_id = ? AND player_id = ? AND is_active = 1`
          ).run(destinationTableId, nextSeat, tournamentId, row.player_id);

          liveCounts.set(source.tableId, Math.max(0, (liveCounts.get(source.tableId) ?? 0) - 1));
          liveCounts.set(destinationTableId, (liveCounts.get(destinationTableId) ?? 0) + 1);
          movedCount += 1;
        }
      }

      const involvedTableIds = new Set<number>([
        ...plan.sourceTables.map((table) => table.tableId),
        ...plan.destinationTables.map((table) => table.tableId),
      ]);

      for (const tableId of involvedTableIds) {
        normalizeTableButtonSeat(tournamentId, tableId);
      }
    });

    execute();
    broadcastSeatChart(tournamentId);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('table:consolidationExecuted', { tournamentId, movedCount });
    });

    return {
      ok: true,
      movedCount,
      closedTables: plan.sourceTables.map((table) => table.tableName),
      rebalance: getRebalanceSuggestion(tournamentId),
    };
  });

  // ── Seats ────────────────────────────────────────────────────────────────────
  ipcMain.handle('seats:randomAssign', (_event, tournamentId: number) => {
    const assign = db.transaction(() => {
      return reassignAllSeats(tournamentId);
    });

    const count = assign();

    broadcastSeatChart(tournamentId);

    return { ok: true, count };
  });

  ipcMain.handle('seats:reset', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT id FROM tournaments WHERE id = ?')
      .get(tournamentId) as { id: number } | undefined;
    if (!tournament) throw new Error('Tournament not found');

    const reset = db.transaction(() => {
      // Clear existing seat state, then reseat everyone.
      db.prepare('DELETE FROM table_state WHERE tournament_id = ?').run(tournamentId);
      return reassignAllSeats(tournamentId);
    });

    const count = reset();
    broadcastSeatChart(tournamentId);

    return { ok: true, count };
  });

  ipcMain.handle('rebalance:movePlayer', (_event, data) => {
    const { tournamentId, playerId, toTableId } = data as {
      tournamentId: number;
      playerId: number;
      toTableId: number;
    };

    const targetTable = db
      .prepare('SELECT name FROM tables WHERE id = ?')
      .get(toTableId) as { name: string } | undefined;
    if (!targetTable) throw new Error('Target table not found');

    const player = db
      .prepare(
        `SELECT player_id
         FROM registrations
         WHERE tournament_id = ? AND player_id = ? AND is_active = 1`
      )
      .get(tournamentId, playerId) as { player_id: number } | undefined;
    if (!player) throw new Error('Selected player is not active in this tournament');

    const source = db
      .prepare(
        `SELECT table_id
         FROM registrations
         WHERE tournament_id = ? AND player_id = ? AND is_active = 1`
      )
      .get(tournamentId, playerId) as { table_id: number | null } | undefined;

    const nextSeat = pickRebalanceDestinationSeat(tournamentId, toTableId);

    db.prepare(
      `UPDATE registrations
       SET table_id = ?, seat_number = ?
       WHERE tournament_id = ? AND player_id = ?`
    ).run(toTableId, nextSeat, tournamentId, playerId);

    if (source?.table_id) {
      normalizeTableButtonSeat(tournamentId, source.table_id);
    }
    normalizeTableButtonSeat(tournamentId, toTableId);

    broadcastSeatChart(tournamentId);

    return {
      ok: true,
      seatNumber: nextSeat,
      tableName: targetTable.name,
      rebalance: getRebalanceSuggestion(tournamentId),
    };
  });

  // ── Blind Structures ──────────────────────────────────────────────────────────
  ipcMain.handle('blindStructure:getAll', () => {
    return db
      .prepare(
        `SELECT bs.id, bs.name, bs.created_at, COUNT(bsl.id) AS level_count
         FROM blind_structures bs
         LEFT JOIN blind_structure_levels bsl ON bsl.blind_structure_id = bs.id
         GROUP BY bs.id, bs.name, bs.created_at
         ORDER BY bs.name ASC`
      )
      .all();
  });

  ipcMain.handle('blindStructure:getLevels', (_event, structureId: number) => {
    return db
      .prepare(
        `SELECT id, blind_structure_id, level, small_blind, big_blind, duration_seconds, is_break, break_label
         FROM blind_structure_levels
         WHERE blind_structure_id = ?
         ORDER BY level ASC`
      )
      .all(structureId);
  });

  ipcMain.handle('blindStructure:create', (_event, data: { name: string; levels: Array<{ level: number; small_blind: number; big_blind: number; duration_seconds: number; is_break: 0 | 1; break_label?: string | null; }>; }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Blind structure name is required');
    if (!Array.isArray(data.levels) || data.levels.length === 0) {
      throw new Error('At least one blind level is required');
    }

    const create = db.transaction(() => {
      const inserted = db
        .prepare('INSERT INTO blind_structures (name) VALUES (?)')
        .run(trimmed);

      const structureId = Number(inserted.lastInsertRowid);
      const insertLevel = db.prepare(
        `INSERT INTO blind_structure_levels
           (blind_structure_id, level, small_blind, big_blind, ante, duration_seconds, is_break, break_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const row of data.levels) {
        insertLevel.run(
          structureId,
          row.level,
          row.small_blind,
          row.big_blind,
          0,
          row.duration_seconds,
          row.is_break,
          row.break_label ?? null
        );
      }

      return structureId;
    });

    let structureId: number;
    try {
      structureId = create();
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes('unique')) {
        throw new Error('Blind structure name already exists');
      }
      throw err;
    }
    return db.prepare('SELECT id, name, created_at FROM blind_structures WHERE id = ?').get(structureId);
  });

  ipcMain.handle('blindStructure:update', (_event, data: { id: number; name: string; levels: Array<{ level: number; small_blind: number; big_blind: number; duration_seconds: number; is_break: 0 | 1; break_label?: string | null; }>; }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Blind structure name is required');
    if (!Array.isArray(data.levels) || data.levels.length === 0) {
      throw new Error('At least one blind level is required');
    }

    const existing = db
      .prepare('SELECT id FROM blind_structures WHERE id = ?')
      .get(data.id) as { id: number } | undefined;
    if (!existing) throw new Error('Blind structure not found');

    try {
      db.transaction(() => {
        db.prepare('UPDATE blind_structures SET name = ? WHERE id = ?').run(trimmed, data.id);
        db.prepare('DELETE FROM blind_structure_levels WHERE blind_structure_id = ?').run(data.id);

        const insertLevel = db.prepare(
          `INSERT INTO blind_structure_levels
             (blind_structure_id, level, small_blind, big_blind, ante, duration_seconds, is_break, break_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const row of data.levels) {
          insertLevel.run(
            data.id,
            row.level,
            row.small_blind,
            row.big_blind,
            0,
            row.duration_seconds,
            row.is_break,
            row.break_label ?? null
          );
        }
      })();
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes('unique')) {
        throw new Error('Blind structure name already exists');
      }
      throw err;
    }

    return db.prepare('SELECT id, name, created_at FROM blind_structures WHERE id = ?').get(data.id);
  });

  ipcMain.handle('blindStructure:delete', (_event, structureId: number) => {
    const linked = db
      .prepare('SELECT COUNT(*) AS count FROM tournaments WHERE blind_structure_id = ?')
      .get(structureId) as { count: number };
    if (linked.count > 0) {
      throw new Error('Cannot delete a blind structure that is linked to tournaments');
    }

    const removed = db.prepare('DELETE FROM blind_structures WHERE id = ?').run(structureId);
    if (removed.changes === 0) throw new Error('Blind structure not found');
    return { ok: true };
  });

  // ── Clock / Engine ────────────────────────────────────────────────────────────
  ipcMain.handle('clock:play', (_event, tournamentId?: number) => {
    if (tournamentId !== undefined && tournamentId !== null && clockTournamentId !== tournamentId) {
      const levels = loadLevelsForTournament(tournamentId);
      if (levels.length > 0) {
        engine.configureBlindStructure(levels);
      }
      clockTournamentId = tournamentId;
    }

    engine.play((tickPayload) => {
      // Broadcast to every open window (admin + clock)
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('clock:tick', tickPayload);
      });
    });
    return { running: true };
  });

  ipcMain.handle('clock:pause', () => {
    engine.pause();
    return { running: false };
  });

  ipcMain.handle('clock:reset', () => {
    engine.reset();
    return engine.getState();
  });

  ipcMain.handle('clock:nextLevel', () => {
    engine.nextLevel();
    return engine.getState();
  });

  // ── Bounty ────────────────────────────────────────────────────────────────────
  ipcMain.handle('bounty:recordElimination', (_event, data) => {
    const { killerId, victimId, tournamentId } = data as {
      killerId: number;
      victimId: number;
      tournamentId: number;
    };

    return processEliminationsBatch(tournamentId, [{ killerId, victimId }]);
  });

  ipcMain.handle('bounty:recordEliminations', (_event, data) => {
    const { tournamentId, eliminations } = data as {
      tournamentId: number;
      eliminations: Array<{ killerId: number; victimId: number }>;
    };
    return processEliminationsBatch(tournamentId, eliminations);
  });

  ipcMain.handle('bounty:getLeaderboard', (_event, tournamentId: number) => {
    return db
      .prepare(
        `SELECT p.name,
                r.bounties_collected
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ? AND r.bounties_collected > 0
         ORDER BY r.bounties_collected DESC, p.name ASC
         LIMIT 10`
      )
      .all(tournamentId);
  });

  // ── Payouts ───────────────────────────────────────────────────────────────────
  ipcMain.handle('payout:calculate', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT * FROM tournaments WHERE id = ?')
      .get(tournamentId) as { buy_in: number; bounty_amount: number } | undefined;

    if (!tournament) throw new Error('Tournament not found');

    const totalEntrants = (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM registrations WHERE tournament_id = ?'
        )
        .get(tournamentId) as { count: number }
    ).count;

    const totalBounties = (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM bounty_log WHERE tournament_id = ?'
        )
        .get(tournamentId) as { count: number }
    ).count;

    const grossPool = totalEntrants * tournament.buy_in;
    const bountyPool = totalEntrants * tournament.bounty_amount;
    const prizePool = grossPool - bountyPool;
    const paidOutBounties = totalBounties * tournament.bounty_amount;

    // Default 50/30/20 split for top 3
    const splits = [0.5, 0.3, 0.2];
    const payouts = splits.map((pct, i) => ({
      place: i + 1,
      amount: Math.floor(prizePool * pct),
    }));

    return {
      playerCount: totalEntrants,
      buyInTotal: grossPool,
      prizePool,
      bountyPool,
      paidOutBounties,
      payouts,
    };
  });

  // ── Seasons ────────────────────────────────────────────────────────────────────
  function computeSeasonTotalPoints(tournamentId: number, placement: number, bounties: number): number {
    const tournament = db
      .prepare('SELECT COUNT(*) as count FROM registrations WHERE tournament_id = ?')
      .get(tournamentId) as { count: number };

    const playerCount = tournament.count;
    const normalizedPlayerCount = Math.max(10, Math.min(41, playerCount));

    const exactScoringRow = db
      .prepare(
        `SELECT points
         FROM scoring_points
         WHERE placement = ? AND player_count = ?`
      )
      .get(placement, normalizedPlayerCount) as { points: number } | undefined;

    let placementPoints = exactScoringRow?.points ?? 0;

    const playerBucket = Math.min(40, Math.ceil(normalizedPlayerCount / 5) * 5);
    const playerColumn = `players_${playerBucket}` as
      | 'players_10'
      | 'players_15'
      | 'players_20'
      | 'players_25'
      | 'players_30'
      | 'players_35'
      | 'players_40';

    if (exactScoringRow === undefined) {
      const scoringRow = db
        .prepare(`SELECT ${playerColumn} FROM scoring_matrix WHERE placement = ?`)
        .get(placement) as { [key: string]: number | null } | undefined;
      placementPoints = scoringRow?.[playerColumn] ?? 0;
    }

    const bountyPoints = bounties * 3;
    return placementPoints + bountyPoints;
  }

  ipcMain.handle('season:create', (_event, name: string) => {
    const trimmed = (name as string).trim();
    if (!trimmed) throw new Error('Season name is required');
    const result = db
      .prepare('INSERT INTO seasons (name, status) VALUES (?, ?)')
      .run(trimmed, 'pending');
    return db
      .prepare('SELECT id, name, status, start_date, end_date, created_at FROM seasons WHERE id = ?')
      .get(result.lastInsertRowid);
  });

  ipcMain.handle('season:getAll', () => {
    return db
      .prepare('SELECT id, name, status, start_date, end_date, created_at FROM seasons ORDER BY created_at DESC')
      .all();
  });

  ipcMain.handle('season:start', (_event, seasonId: number) => {
    const season = db
      .prepare('SELECT id, name FROM seasons WHERE id = ?')
      .get(seasonId) as { id: number; name: string } | undefined;
    if (!season) throw new Error('Season not found');

    const defaultBlindStructure = db
      .prepare("SELECT id FROM blind_structures WHERE name = 'OPT Default' ORDER BY id LIMIT 1")
      .get() as { id: number } | undefined;

    const start = db.transaction(() => {
      db.prepare("UPDATE seasons SET status = 'active', start_date = COALESCE(start_date, date('now')) WHERE id = ?").run(seasonId);

      const linked = db
        .prepare('SELECT tournament_number FROM season_tournaments WHERE season_id = ?')
        .all(seasonId) as Array<{ tournament_number: number }>;
      const linkedNumbers = new Set(linked.map((row) => row.tournament_number));

      const insertTournament = db.prepare(
        `INSERT INTO tournaments (name, buy_in, bounty_amount, blind_structure_id, status)
         VALUES (?, ?, ?, ?, 'pending')`
      );
      const linkTournament = db.prepare(
        'INSERT OR IGNORE INTO season_tournaments (season_id, tournament_id, tournament_number) VALUES (?, ?, ?)'
      );

      let createdTournaments = 0;
      for (let tournamentNumber = 1; tournamentNumber <= 7; tournamentNumber += 1) {
        if (linkedNumbers.has(tournamentNumber)) continue;

        const tournamentName = `${season.name} - Tournament ${tournamentNumber}`;
        const inserted = insertTournament.run(
          tournamentName,
          20,
          5,
          defaultBlindStructure?.id ?? null
        );
        linkTournament.run(seasonId, Number(inserted.lastInsertRowid), tournamentNumber);
        createdTournaments += 1;
      }

      return createdTournaments;
    });

    return { ok: true, createdTournaments: start() };
  });

  ipcMain.handle('season:finish', (_event, seasonId: number) => {
    const existing = db
      .prepare('SELECT id FROM seasons WHERE id = ?')
      .get(seasonId) as { id: number } | undefined;
    if (!existing) throw new Error('Season not found');

    db.prepare("UPDATE seasons SET status = 'finished', end_date = COALESCE(end_date, date('now')) WHERE id = ?").run(seasonId);
    return { ok: true };
  });

  ipcMain.handle('season:getLeaderboard', (_event, seasonId: number) => {
    const results = db
      .prepare(
        `SELECT 
           p.id as player_id,
           p.name as player_name,
           SUM(sr.points) as total_points,
           COUNT(DISTINCT sr.tournament_id) as tournament_count,
           GROUP_CONCAT(sr.points, ',') as all_scores
         FROM season_results sr
         JOIN players p ON p.id = sr.player_id
         WHERE sr.season_id = ? AND sr.is_opt_player = 1
         GROUP BY p.id, p.name
         ORDER BY total_points DESC`
      )
      .all(seasonId) as Array<{
        player_id: number;
        player_name: string;
        total_points: number;
        tournament_count: number;
        all_scores: string;
      }>;

    const tournamentScores = db
      .prepare(
        `SELECT
           sr.player_id,
           sr.tournament_id,
           sr.points AS total_points,
           sr.bounties
         FROM season_results sr
         WHERE sr.season_id = ? AND sr.is_opt_player = 1`
      )
      .all(seasonId) as Array<{
        player_id: number;
        tournament_id: number;
        total_points: number;
        bounties: number;
      }>;

    const scoresByPlayer = new Map<number, Array<{
      tournament_id: number;
      tournament_points: number;
      bounty_points: number;
      total_points: number;
    }>>();

    for (const score of tournamentScores) {
      const bountyPoints = score.bounties * 3;
      const tournamentPoints = score.total_points - bountyPoints;
      const existing = scoresByPlayer.get(score.player_id) ?? [];
      existing.push({
        tournament_id: score.tournament_id,
        tournament_points: tournamentPoints,
        bounty_points: bountyPoints,
        total_points: score.total_points,
      });
      scoresByPlayer.set(score.player_id, existing);
    }

    // Calculate top 6 scores for each player
    return results.map((row) => {
      const scores = row.all_scores
        .split(',')
        .map((s) => parseFloat(s))
        .sort((a, b) => b - a)
        .slice(0, 6);
      return {
        player_id: row.player_id,
        player_name: row.player_name,
        total_points: scores.reduce((a, b) => a + b, 0),
        tournament_count: row.tournament_count,
        top_6_scores: scores,
        tournament_scores: scoresByPlayer.get(row.player_id) ?? [],
        is_toc_eligible: true,
      };
    });
  });

  ipcMain.handle(
    'season:addTournament',
    (_event, data: { seasonId: number; tournamentId: number; tournamentNumber: number }) => {
      const season = db
        .prepare('SELECT id FROM seasons WHERE id = ?')
        .get(data.seasonId) as { id: number } | undefined;
      if (!season) throw new Error('Season not found');

      const tournament = db
        .prepare('SELECT id FROM tournaments WHERE id = ?')
        .get(data.tournamentId) as { id: number } | undefined;
      if (!tournament) throw new Error('Tournament not found');

      db.prepare(
        'INSERT OR IGNORE INTO season_tournaments (season_id, tournament_id, tournament_number) VALUES (?, ?, ?)'
      ).run(data.seasonId, data.tournamentId, data.tournamentNumber);

      return { ok: true };
    }
  );

  ipcMain.handle('season:getTournaments', (_event, seasonId: number) => {
    return db
      .prepare(
        `SELECT st.season_id,
                st.tournament_id,
                st.tournament_number,
                t.name AS tournament_name,
                t.status AS tournament_status,
                COUNT(DISTINCT r.player_id) AS player_count,
                COUNT(DISTINCT sr.player_id) AS synced_results_count
         FROM season_tournaments st
         JOIN tournaments t ON t.id = st.tournament_id
         LEFT JOIN registrations r ON r.tournament_id = st.tournament_id
         LEFT JOIN season_results sr ON sr.season_id = st.season_id AND sr.tournament_id = st.tournament_id
         WHERE st.season_id = ?
         GROUP BY st.season_id, st.tournament_id, st.tournament_number, t.name, t.status
         ORDER BY st.tournament_number ASC, st.tournament_id ASC`
      )
      .all(seasonId);
  });

  ipcMain.handle('season:syncTournamentResults', (_event, data: { seasonId: number; tournamentId: number }) => {
    const season = db
      .prepare('SELECT id FROM seasons WHERE id = ?')
      .get(data.seasonId) as { id: number } | undefined;
    if (!season) throw new Error('Season not found');

    const tournament = db
      .prepare('SELECT id FROM tournaments WHERE id = ?')
      .get(data.tournamentId) as { id: number } | undefined;
    if (!tournament) throw new Error('Tournament not found');

    const linked = db
      .prepare('SELECT 1 FROM season_tournaments WHERE season_id = ? AND tournament_id = ?')
      .get(data.seasonId, data.tournamentId);
    if (!linked) throw new Error('Tournament is not linked to this season');

    const registrations = db
      .prepare(
        `SELECT player_id, is_active, bounties_collected, chip_count
         FROM registrations
         WHERE tournament_id = ?
         ORDER BY player_id ASC`
      )
      .all(data.tournamentId) as Array<{
      player_id: number;
      is_active: 0 | 1;
      bounties_collected: number;
      chip_count: number;
    }>;

    if (registrations.length === 0) {
      return { ok: true, upserted: 0 };
    }

    const placements = new Map<number, number>();
    const eliminatedOrder = db
      .prepare(
        `SELECT victim_id
         FROM bounty_log
         WHERE tournament_id = ?
         ORDER BY timestamp ASC, id ASC`
      )
      .all(data.tournamentId) as Array<{ victim_id: number }>;

    const seenVictims = new Set<number>();
    let nextEliminationPlacement = registrations.length;
    for (const row of eliminatedOrder) {
      if (seenVictims.has(row.victim_id)) continue;
      seenVictims.add(row.victim_id);
      placements.set(row.victim_id, nextEliminationPlacement);
      nextEliminationPlacement -= 1;
    }

    const unresolved = registrations.filter((row) => !placements.has(row.player_id));
    const survivorsFirst = [...unresolved].sort((a, b) => {
      if (b.is_active !== a.is_active) return b.is_active - a.is_active;
      if (b.chip_count !== a.chip_count) return b.chip_count - a.chip_count;
      return a.player_id - b.player_id;
    });

    let nextTopPlacement = 1;
    for (const row of survivorsFirst.filter((entry) => entry.is_active === 1)) {
      placements.set(row.player_id, nextTopPlacement);
      nextTopPlacement += 1;
    }

    let fillPlacement = registrations.length;
    for (const row of survivorsFirst.filter((entry) => !placements.has(entry.player_id))) {
      while ([...placements.values()].includes(fillPlacement) && fillPlacement > 0) {
        fillPlacement -= 1;
      }
      placements.set(row.player_id, Math.max(fillPlacement, nextTopPlacement));
      fillPlacement -= 1;
    }

    const upsert = db.prepare(
      `INSERT OR REPLACE INTO season_results
         (season_id, player_id, tournament_id, placement, bounties, points, is_opt_player)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const run = db.transaction(() => {
      let count = 0;
      for (const row of registrations) {
        const placement = placements.get(row.player_id) ?? registrations.length;
        const totalPoints = computeSeasonTotalPoints(data.tournamentId, placement, row.bounties_collected);
        upsert.run(
          data.seasonId,
          row.player_id,
          data.tournamentId,
          placement,
          row.bounties_collected,
          totalPoints,
          1
        );
        count += 1;
      }
      return count;
    });

    return { ok: true, upserted: run() };
  });

  ipcMain.handle(
    'season:recordResult',
    (
      _event,
      data: {
        season_id: number;
        player_id: number;
        tournament_id: number;
        placement: number;
        bounties: number;
        is_opt_player: 0 | 1;
      }
    ) => {
      const totalPoints = computeSeasonTotalPoints(data.tournament_id, data.placement, data.bounties);

      db.prepare(
        `INSERT OR REPLACE INTO season_results 
         (season_id, player_id, tournament_id, placement, bounties, points, is_opt_player)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        data.season_id,
        data.player_id,
        data.tournament_id,
        data.placement,
        data.bounties,
        totalPoints,
        data.is_opt_player
      );

      return { ok: true };
    }
  );

  ipcMain.handle('season:getScoringMatrix', () => {
    return db.prepare('SELECT * FROM scoring_matrix ORDER BY placement').all();
  });

  ipcMain.handle('data:resetAllKeepPlayers', () => {
    const run = db.transaction(() => {
      const deletedSeasonResults = db.prepare('DELETE FROM season_results').run().changes;
      const deletedSeasonTournaments = db.prepare('DELETE FROM season_tournaments').run().changes;
      const deletedSeasons = db.prepare('DELETE FROM seasons').run().changes;

      const deletedTableState = db
        .prepare('DELETE FROM table_state WHERE tournament_id != 0')
        .run().changes;
      const deletedBlindStructureRows = db
        .prepare('DELETE FROM blind_structure WHERE tournament_id != 0')
        .run().changes;
      const deletedBountyLog = db
        .prepare('DELETE FROM bounty_log WHERE tournament_id != 0')
        .run().changes;
      const deletedRegistrations = db
        .prepare('DELETE FROM registrations WHERE tournament_id != 0')
        .run().changes;
      const deletedTournaments = db
        .prepare('DELETE FROM tournaments WHERE id != 0')
        .run().changes;

      // Keep roster rows but clear derived lifetime totals tied to removed tournament history.
      db.prepare('UPDATE players SET total_career_earnings = 0').run();

      return {
        seasonResults: deletedSeasonResults,
        seasonTournaments: deletedSeasonTournaments,
        seasons: deletedSeasons,
        tableState: deletedTableState,
        blindStructureLevels: deletedBlindStructureRows,
        bountyLog: deletedBountyLog,
        registrations: deletedRegistrations,
        tournaments: deletedTournaments,
      };
    });

    engine.pause();
    engine.reset();
    clockTournamentId = null;

    return {
      ok: true,
      deleted: run(),
    };
  });
}
