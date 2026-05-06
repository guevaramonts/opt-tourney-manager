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

  function handsUntilBigBlind(buttonSeat: number, occupiedSeats: number[], seatToEvaluate: number): number {
    const seats = [...occupiedSeats, seatToEvaluate].sort((a, b) => a - b);
    if (!seats.includes(buttonSeat)) {
      buttonSeat = nextOccupiedSeat(seats, buttonSeat);
    }

    let simulatedButton = buttonSeat;
    for (let hand = 1; hand <= seats.length + 3; hand++) {
      const sb = nextOccupiedSeat(seats, simulatedButton);
      const bb = nextOccupiedSeat(seats, sb);
      if (bb === seatToEvaluate) return hand;
      simulatedButton = nextOccupiedSeat(seats, simulatedButton);
    }
    return 1;
  }

  function pickRebalanceDestinationSeat(tournamentId: number, tableId: number): number {
    const occupiedSeats = getActiveSeatsForTable(tournamentId, tableId);
    if (occupiedSeats.length === 0) return 1;

    const maxSeat = Math.max(TABLE_MAX_SEATS, occupiedSeats[occupiedSeats.length - 1] + 1);
    const availableSeats: number[] = [];
    for (let seat = 1; seat <= maxSeat; seat++) {
      if (!occupiedSeats.includes(seat)) availableSeats.push(seat);
    }

    const buttonSeat = normalizeTableButtonSeat(tournamentId, tableId);
    let bestSeat = availableSeats[0] ?? (occupiedSeats[occupiedSeats.length - 1] + 1);
    let bestHands = -1;

    for (const seat of availableSeats) {
      const hands = handsUntilBigBlind(buttonSeat, occupiedSeats, seat);
      if (hands > bestHands) {
        bestHands = hands;
        bestSeat = seat;
      }
    }

    return bestSeat;
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
    const eligibleSourceTables = activeTables.filter((table) => table.player_count > 0 && table.player_count <= 4);

    if (eligibleSourceTables.length < 2) {
      return {
        eligible: false,
        reason:
          eligibleSourceTables.length === 1
            ? 'Single-table consolidation is disabled. Wait until at least two short tables are eligible.'
            : 'No consolidation wave available yet (need at least two short tables with 4 or fewer players).',
        sourceTables: eligibleSourceTables.map((table) => ({
          tableId: table.id,
          tableName: table.name,
          playerCount: table.player_count,
        })),
        destinationTables: [],
        totalPlayersToMove: eligibleSourceTables.reduce((sum, table) => sum + table.player_count, 0),
        totalOpenSeats: 0,
        previewMoves: [],
      };
    }

    const sourceIds = new Set(eligibleSourceTables.map((table) => table.id));
    const destinationTables = activeTables
      .filter((table) => !sourceIds.has(table.id))
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
      reason: `Consolidation wave ready: move ${totalPlayersToMove} players from ${eligibleSourceTables.length} short tables.`,
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

  function processEliminationsBatch(tournamentId: number, eliminations: Array<{ killerId: number; victimId: number }>) {
    if (eliminations.length === 0) {
      return { ok: true, rebalance: getRebalanceSuggestion(tournamentId) };
    }

    const victimRows = db
      .prepare(
        `SELECT r.player_id, r.table_id, p.name
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ? AND r.is_active = 1`
      )
      .all(tournamentId) as Array<{ player_id: number; table_id: number | null; name: string }>;

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
    const victimNames: Array<{ id: number; name: string }> = [];

    const eliminate = db.transaction(() => {
      for (const elimination of validEliminations) {
        const victim = victimLookup.get(elimination.victimId);
        if (!victim) continue;

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
        victimNames.push({ id: elimination.victimId, name: victim.name });
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
      for (const victim of victimNames) {
        win.webContents.send('player:eliminated', {
          victimId: victim.id,
          victimName: victim.name,
          leaderboard,
        });
      }
    });

    return { ok: true, rebalance: getRebalanceSuggestion(tournamentId) };
  }

  // ── Tournament ──────────────────────────────────────────────────────────────
  ipcMain.handle('tournament:create', (_event, data) => {
    const stmt = db.prepare(
      `INSERT INTO tournaments (name, buy_in, bounty_amount, status)
       VALUES (@name, @buyIn, @bountyAmount, 'pending')
       RETURNING *`
    );
    return stmt.get(data);
  });

  ipcMain.handle('tournament:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  });

  ipcMain.handle('tournament:getAll', () => {
    return db
      .prepare(
        `SELECT t.*, COUNT(r.id) AS player_count
         FROM tournaments t
         LEFT JOIN registrations r ON r.tournament_id = t.id
         WHERE t.id != 0
         GROUP BY t.id
         ORDER BY t.id DESC`
      )
      .all();
  });

  ipcMain.handle('tournament:update', (_event, data: { id: number; name: string; buyIn: number; bountyAmount: number }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Tournament name is required');

    const existing = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(data.id) as { id: number } | undefined;
    if (!existing) throw new Error('Tournament not found');

    db.prepare(
      `UPDATE tournaments
       SET name = ?, buy_in = ?, bounty_amount = ?
       WHERE id = ?`
    ).run(trimmed, data.buyIn, data.bountyAmount, data.id);

    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(data.id);
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

  ipcMain.handle('tournament:resetProgress', (_event, tournamentId: number) => {
    const tournament = db
      .prepare('SELECT id FROM tournaments WHERE id = ?')
      .get(tournamentId) as { id: number } | undefined;
    if (!tournament) throw new Error('Tournament not found');

    const reset = db.transaction(() => {
      const restored = db
        .prepare(
          `UPDATE registrations
           SET is_active = 1,
               bounties_collected = 0
           WHERE tournament_id = ?`
        )
        .run(tournamentId);

      const cleared = db
        .prepare('DELETE FROM bounty_log WHERE tournament_id = ?')
        .run(tournamentId);

      db.prepare("UPDATE tournaments SET status = 'pending' WHERE id = ? AND status != 'finished'").run(tournamentId);

      // Keep seat/button state coherent after mass restore.
      const tables = db.prepare('SELECT id FROM tables ORDER BY id').all() as Array<{ id: number }>;
      for (const table of tables) {
        normalizeTableButtonSeat(tournamentId, table.id);
      }

      return {
        restoredPlayers: restored.changes,
        clearedBountyEvents: cleared.changes,
      };
    });

    const result = reset();
    broadcastSeatChart(tournamentId);

    return {
      ok: true,
      restoredPlayers: result.restoredPlayers,
      clearedBountyEvents: result.clearedBountyEvents,
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

  ipcMain.handle('player:getActive', (_event, tournamentId: number) => {
    return db
      .prepare(
        `SELECT p.id, p.name, r.player_id, r.chip_count, r.is_active, r.bounties_collected,
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
        `SELECT p.id, p.name, p.email, p.phone, p.total_career_earnings,
                COUNT(DISTINCT r.tournament_id) AS tournaments_played
         FROM players p
         LEFT JOIN registrations r ON r.player_id = p.id
         GROUP BY p.id
         ORDER BY p.name ASC`
      )
      .all();
  });

  ipcMain.handle('player:create', (_event, data: { name: string; email?: string; phone?: string }) => {
    const trimmed = (data.name as string).trim();
    if (!trimmed) throw new Error('Name is required');
    const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(trimmed);
    if (existing) throw new Error(`Player "${trimmed}" already exists`);
    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;
    const result = db
      .prepare('INSERT INTO players (name, email, phone) VALUES (?, ?, ?)')
      .run(trimmed, email, phone);
    return db
      .prepare('SELECT id, name, email, phone, total_career_earnings FROM players WHERE id = ?')
      .get(result.lastInsertRowid);
  });

  ipcMain.handle('player:update', (_event, data: { id: number; name?: string; email?: string; phone?: string }) => {
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

    return {
      ok: true,
      movedCount,
      closedTables: plan.sourceTables.map((table) => table.tableName),
      rebalance: getRebalanceSuggestion(tournamentId),
    };
  });

  // ── Seats ────────────────────────────────────────────────────────────────────
  ipcMain.handle('seats:randomAssign', (_event, tournamentId: number) => {
    // Fetch all active player IDs
    const players = db
      .prepare('SELECT player_id FROM registrations WHERE tournament_id = ? AND is_active = 1')
      .all(tournamentId) as { player_id: number }[];

    // Fisher-Yates shuffle
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const tables = db
      .prepare('SELECT id FROM tables ORDER BY id')
      .all() as { id: number }[];

    const seatCounts: Record<number, number> = {};

    const assign = db.transaction(() => {
      shuffled.forEach((p, i) => {
        const table = tables[i % tables.length];
        seatCounts[table.id] = (seatCounts[table.id] ?? 0) + 1;
        db.prepare(
          'UPDATE registrations SET table_id = ?, seat_number = ? WHERE tournament_id = ? AND player_id = ?'
        ).run(table.id, seatCounts[table.id], tournamentId, p.player_id);
      });

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
    });

    assign();

    broadcastSeatChart(tournamentId);

    return { ok: true, count: shuffled.length };
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

  // ── Clock / Engine ────────────────────────────────────────────────────────────
  ipcMain.handle('clock:play', (_event, _tournamentId?: number) => {
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
        `SELECT p.name, r.bounties_collected
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = ? AND r.bounties_collected > 0
         ORDER BY r.bounties_collected DESC
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

    return { prizePool, bountyPool, paidOutBounties, payouts };
  });

  // ── Seasons ────────────────────────────────────────────────────────────────────
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
        is_toc_eligible: true,
      };
    });
  });

  ipcMain.handle(
    'season:addTournament',
    (_event, data: { seasonId: number; tournamentId: number; tournamentNumber: number }) => {
      db.prepare(
        'INSERT OR IGNORE INTO season_tournaments (season_id, tournament_id, tournament_number) VALUES (?, ?, ?)'
      ).run(data.seasonId, data.tournamentId, data.tournamentNumber);
      return { ok: true };
    }
  );

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
      // Get points from scoring matrix based on field size
      const tournament = db
        .prepare('SELECT COUNT(*) as count FROM registrations WHERE tournament_id = ?')
        .get(data.tournament_id) as { count: number };

      const playerCount = tournament.count;
      const normalizedPlayerCount = Math.max(10, Math.min(41, playerCount));

      // Prefer exact OPT 2026 lookup table by exact field size and placement.
      const exactScoringRow = db
        .prepare(
          `SELECT points
           FROM scoring_points
           WHERE placement = ? AND player_count = ?`
        )
        .get(data.placement, normalizedPlayerCount) as { points: number } | undefined;

      let placementPoints = exactScoringRow?.points ?? 0;

      // Fallback to legacy bucketed matrix for older DB snapshots.
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
          .get(data.placement) as { [key: string]: number | null } | undefined;
        placementPoints = scoringRow?.[playerColumn] ?? 0;
      }

      const bountyPoints = data.bounties * 3;
      const totalPoints = placementPoints + bountyPoints;

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
}
