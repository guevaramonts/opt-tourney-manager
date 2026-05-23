import { Router } from 'express';
import pool from '../db/pool';
import { getIo } from '../services/io';
import { reassignAllSeats } from './tournaments';

const router = Router();
const TABLE_MAX_SEATS = 10;

async function getActiveSeatsForTable(tournamentId: number, tableId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT seat_number FROM registrations
     WHERE tournament_id=$1 AND table_id=$2 AND is_active=TRUE AND seat_number IS NOT NULL
     ORDER BY seat_number`,
    [tournamentId, tableId]
  );
  return rows.map((r: { seat_number: number }) => r.seat_number);
}

async function getTableButtonSeat(tournamentId: number, tableId: number): Promise<number> {
  const { rows } = await pool.query(
    'SELECT button_seat FROM table_state WHERE tournament_id=$1 AND table_id=$2',
    [tournamentId, tableId]
  );
  if (rows[0]) return rows[0].button_seat;
  const seats = await getActiveSeatsForTable(tournamentId, tableId);
  const seed = seats[0] ?? 1;
  await pool.query(
    'INSERT INTO table_state (tournament_id, table_id, button_seat) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [tournamentId, tableId, seed]
  );
  return seed;
}

async function normalizeTableButtonSeat(tournamentId: number, tableId: number): Promise<number> {
  const seats = await getActiveSeatsForTable(tournamentId, tableId);
  if (seats.length === 0) {
    await pool.query(
      `INSERT INTO table_state (tournament_id, table_id, button_seat) VALUES ($1,$2,1)
       ON CONFLICT (tournament_id, table_id) DO UPDATE SET button_seat = 1`,
      [tournamentId, tableId]
    );
    return 1;
  }
  const buttonSeat = await getTableButtonSeat(tournamentId, tableId);
  if (seats.includes(buttonSeat)) return buttonSeat;
  const next = seats.find((s) => s > buttonSeat) ?? seats[0];
  await pool.query(
    'UPDATE table_state SET button_seat=$1 WHERE tournament_id=$2 AND table_id=$3',
    [next, tournamentId, tableId]
  );
  return next;
}

async function advanceButtonSeat(tournamentId: number, tableId: number): Promise<void> {
  const seats = await getActiveSeatsForTable(tournamentId, tableId);
  if (seats.length === 0) return;
  const current = await normalizeTableButtonSeat(tournamentId, tableId);
  const next = seats.find((s) => s > current) ?? seats[0];
  await pool.query(
    'UPDATE table_state SET button_seat=$1 WHERE tournament_id=$2 AND table_id=$3',
    [next, tournamentId, tableId]
  );
}

async function pickRebalanceDestinationSeat(tournamentId: number, tableId: number): Promise<number> {
  const occupied = await getActiveSeatsForTable(tournamentId, tableId);
  if (occupied.length === 0) return 1;
  const { rows: recent } = await pool.query(
    `SELECT r.seat_number FROM registrations r
     JOIN bounty_log bl ON bl.victim_id = r.player_id
     WHERE bl.tournament_id=$1 AND r.table_id=$2 AND r.is_active=FALSE AND r.seat_number IS NOT NULL
     ORDER BY bl.id DESC LIMIT 1`,
    [tournamentId, tableId]
  );
  if (recent[0] && !occupied.includes(recent[0].seat_number)) return recent[0].seat_number;
  const max = Math.max(TABLE_MAX_SEATS, occupied[occupied.length - 1] + 1);
  for (let s = 1; s <= max; s++) {
    if (!occupied.includes(s)) return s;
  }
  return occupied[occupied.length - 1] + 1;
}

async function getRebalanceSuggestion(tournamentId: number) {
  const { rows: tableCounts } = await pool.query(
    `SELECT t.id, t.name, COUNT(r.player_id)::int AS player_count
     FROM tables t
     LEFT JOIN registrations r ON r.table_id=t.id AND r.tournament_id=$1 AND r.is_active=TRUE
     GROUP BY t.id, t.name
     HAVING COUNT(r.player_id) > 0
     ORDER BY player_count DESC, t.id ASC`,
    [tournamentId]
  );
  if (tableCounts.length < 2) return null;
  const source = tableCounts[0];
  const target = tableCounts[tableCounts.length - 1];
  if (source.player_count - target.player_count < 2) return null;
  const { rows: candidates } = await pool.query(
    `SELECT p.id AS "playerId", p.name, r.table_id AS "tableId", t.name AS "tableName",
            r.seat_number AS "seatNumber", r.chip_count AS "chipCount"
     FROM registrations r JOIN players p ON p.id=r.player_id JOIN tables t ON t.id=r.table_id
     WHERE r.tournament_id=$1 AND r.is_active=TRUE AND r.table_id=$2
     ORDER BY r.seat_number`,
    [tournamentId, source.id]
  );
  return { sourceTableId: source.id, sourceTableName: source.name, sourceCount: source.player_count, targetTableId: target.id, targetTableName: target.name, targetCount: target.player_count, candidates };
}

async function broadcastSeatChart(tournamentId: number): Promise<void> {
  const { rows: chart } = await pool.query(
    `SELECT p.name AS player_name, t.name AS table_name, r.seat_number
     FROM registrations r JOIN players p ON p.id=r.player_id JOIN tables t ON t.id=r.table_id
     WHERE r.tournament_id=$1 AND r.is_active=TRUE
     ORDER BY t.id, r.seat_number`,
    [tournamentId]
  );
  getIo()?.emit('seats:assigned', { chart });
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tables ORDER BY id');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/assignments/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows } = await pool.query(
      `SELECT t.id AS table_id, t.name AS table_name,
              p.id, p.name AS player_name, r.chip_count,
              r.is_active::int AS is_active, r.bounties_collected, r.seat_number
       FROM tables t
       LEFT JOIN registrations r ON r.table_id=t.id AND r.tournament_id=$1 AND r.is_active=TRUE
       LEFT JOIN players p ON p.id=r.player_id
       ORDER BY t.id, r.seat_number`,
      [tournamentId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/position-state/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows: tables } = await pool.query('SELECT id, name FROM tables ORDER BY id');
    const result = await Promise.all(
      tables.map(async (table: { id: number; name: string }) => ({
        tableId: table.id,
        tableName: table.name,
        buttonSeat: await normalizeTableButtonSeat(tournamentId, table.id),
      }))
    );
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/consolidation-plan/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows: activeTables } = await pool.query(
      `SELECT t.id, t.name, COUNT(r.player_id)::int AS player_count
       FROM tables t
       LEFT JOIN registrations r ON r.table_id=t.id AND r.tournament_id=$1 AND r.is_active=TRUE
       GROUP BY t.id, t.name
       HAVING COUNT(r.player_id) > 0
       ORDER BY t.id`,
      [tournamentId]
    );
    const totalActive = activeTables.reduce((s: number, t: { player_count: number }) => s + t.player_count, 0);
    const target = totalActive <= 10 ? 1 : 2;
    if (activeTables.length <= target || totalActive > 20) {
      res.json({ eligible: false, reason: totalActive > 20 ? `Consolidation opens at 20 or fewer players (currently ${totalActive}).` : `Only ${activeTables.length} tables active, need more than ${target}.`, sourceTables: [], destinationTables: activeTables.map((t: { id: number; name: string; player_count: number }) => ({ tableId: t.id, tableName: t.name, playerCount: t.player_count, openSeats: Math.max(0, TABLE_MAX_SEATS - t.player_count) })), totalPlayersToMove: 0, totalOpenSeats: 0, previewMoves: [] });
      return;
    }
    const sorted = [...activeTables].sort((a: { player_count: number; id: number }, b: { player_count: number; id: number }) => (b.player_count - a.player_count) || (a.id - b.id));
    const destTables = sorted.slice(0, target).map((t: { id: number; name: string; player_count: number }) => ({ tableId: t.id, tableName: t.name, playerCount: t.player_count, openSeats: Math.max(0, TABLE_MAX_SEATS - t.player_count) }));
    const srcTables = sorted.slice(target).map((t: { id: number; name: string; player_count: number }) => ({ tableId: t.id, tableName: t.name, playerCount: t.player_count }));
    const toMove = srcTables.reduce((s: number, t: { playerCount: number }) => s + t.playerCount, 0);
    const openSeats = destTables.reduce((s: number, t: { openSeats: number }) => s + (t.openSeats ?? 0), 0);
    res.json({ eligible: openSeats >= toMove, reason: openSeats >= toMove ? `Ready to consolidate ${toMove} players into ${target} table(s).` : `Need ${toMove} seats but only ${openSeats} available.`, sourceTables: srcTables, destinationTables: destTables, totalPlayersToMove: toMove, totalOpenSeats: openSeats, previewMoves: [] });
  } catch (err) { next(err); }
});

router.post('/consolidate/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows: activeTables } = await pool.query(
      `SELECT t.id, t.name, COUNT(r.player_id)::int AS player_count
       FROM tables t LEFT JOIN registrations r ON r.table_id=t.id AND r.tournament_id=$1 AND r.is_active=TRUE
       GROUP BY t.id, t.name HAVING COUNT(r.player_id) > 0 ORDER BY player_count DESC, t.id`,
      [tournamentId]
    );
    const totalActive = activeTables.reduce((s: number, t: { player_count: number }) => s + t.player_count, 0);
    const target = totalActive <= 10 ? 1 : 2;
    const destIds = new Set(activeTables.slice(0, target).map((t: { id: number }) => t.id));
    const srcTables = activeTables.slice(target);
    let movedCount = 0;
    const liveCounts = new Map<number, number>(activeTables.map((t: { id: number; player_count: number }) => [t.id, t.player_count]));
    for (const src of srcTables) {
      const { rows: srcPlayers } = await pool.query(
        'SELECT player_id FROM registrations WHERE tournament_id=$1 AND table_id=$2 AND is_active=TRUE ORDER BY seat_number, player_id',
        [tournamentId, src.id]
      );
      for (const row of srcPlayers) {
        const dest = [...liveCounts.entries()].filter(([id, cnt]) => destIds.has(id) && cnt < TABLE_MAX_SEATS).sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))[0];
        if (!dest) break;
        const seat = await pickRebalanceDestinationSeat(tournamentId, dest[0]);
        await pool.query('UPDATE registrations SET table_id=$1, seat_number=$2 WHERE tournament_id=$3 AND player_id=$4 AND is_active=TRUE', [dest[0], seat, tournamentId, row.player_id]);
        liveCounts.set(src.id, Math.max(0, (liveCounts.get(src.id) ?? 0) - 1));
        liveCounts.set(dest[0], (liveCounts.get(dest[0]) ?? 0) + 1);
        movedCount++;
      }
    }
    for (const t of activeTables) await normalizeTableButtonSeat(tournamentId, t.id);
    await broadcastSeatChart(tournamentId);
    getIo()?.emit('table:consolidationExecuted', { tournamentId, movedCount });
    res.json({ ok: true, movedCount, closedTables: srcTables.map((t: { name: string }) => t.name), rebalance: await getRebalanceSuggestion(tournamentId) });
  } catch (err) { next(err); }
});

router.post('/random-assign/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const count = await reassignAllSeats(tournamentId);
    await broadcastSeatChart(tournamentId);
    res.json({ ok: true, count });
  } catch (err) { next(err); }
});

router.post('/reset-seating/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    await pool.query('DELETE FROM table_state WHERE tournament_id=$1', [tournamentId]);
    const count = await reassignAllSeats(tournamentId);
    await broadcastSeatChart(tournamentId);
    res.json({ ok: true, count });
  } catch (err) { next(err); }
});

router.post('/move-player', async (req, res, next) => {
  try {
    const { tournamentId, playerId, toTableId } = req.body as { tournamentId: number; playerId: number; toTableId: number };
    const { rows: [targetTable] } = await pool.query('SELECT name FROM tables WHERE id=$1', [toTableId]);
    if (!targetTable) { res.status(404).json({ error: 'Target table not found' }); return; }
    const { rows: [src] } = await pool.query('SELECT table_id FROM registrations WHERE tournament_id=$1 AND player_id=$2 AND is_active=TRUE', [tournamentId, playerId]);
    const seat = await pickRebalanceDestinationSeat(tournamentId, toTableId);
    await pool.query('UPDATE registrations SET table_id=$1, seat_number=$2 WHERE tournament_id=$3 AND player_id=$4', [toTableId, seat, tournamentId, playerId]);
    if (src?.table_id) await normalizeTableButtonSeat(tournamentId, src.table_id);
    await normalizeTableButtonSeat(tournamentId, toTableId);
    await broadcastSeatChart(tournamentId);
    res.json({ ok: true, seatNumber: seat, tableName: targetTable.name, rebalance: await getRebalanceSuggestion(tournamentId) });
  } catch (err) { next(err); }
});

export { advanceButtonSeat, broadcastSeatChart, getRebalanceSuggestion, normalizeTableButtonSeat };
export default router;
