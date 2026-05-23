import { Router } from 'express';
import pool from '../db/pool';
import { getIo } from '../services/io';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, COUNT(r.id)::int AS player_count, bs.name AS blind_structure_name
       FROM tournaments t
       LEFT JOIN registrations r ON r.tournament_id = t.id
       LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
       WHERE t.id != 0
       GROUP BY t.id, bs.name
       ORDER BY t.id DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, bs.name AS blind_structure_name
       FROM tournaments t
       LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
       WHERE t.id = $1`,
      [parseInt(req.params.id)]
    );
    res.json(rows[0] ?? null);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, buyIn, bountyAmount, blindStructureId } = req.body as {
      name: string; buyIn: number; bountyAmount: number; blindStructureId?: number | null;
    };
    const { rows } = await pool.query(
      `INSERT INTO tournaments (name, buy_in, bounty_amount, blind_structure_id, status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING *`,
      [name.trim(), buyIn, bountyAmount, blindStructureId ?? null]
    );
    const { rows: full } = await pool.query(
      `SELECT t.*, bs.name AS blind_structure_name
       FROM tournaments t LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
       WHERE t.id = $1`,
      [rows[0].id]
    );
    res.status(201).json(full[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, buyIn, bountyAmount, blindStructureId } = req.body as {
      name: string; buyIn: number; bountyAmount: number; blindStructureId?: number | null;
    };
    const trimmed = name?.trim();
    if (!trimmed) { res.status(400).json({ error: 'Name is required' }); return; }
    const exists = await pool.query('SELECT id FROM tournaments WHERE id = $1', [id]);
    if ((exists.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Tournament not found' }); return; }
    await pool.query(
      'UPDATE tournaments SET name=$1, buy_in=$2, bounty_amount=$3, blind_structure_id=$4 WHERE id=$5',
      [trimmed, buyIn, bountyAmount, blindStructureId ?? null, id]
    );
    const { rows } = await pool.query(
      `SELECT t.*, bs.name AS blind_structure_name
       FROM tournaments t LEFT JOIN blind_structures bs ON bs.id = t.blind_structure_id
       WHERE t.id = $1`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id/finish', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE tournaments SET status = 'finished' WHERE id = $1", [id]);
      const { rows: bountyWinners } = await client.query(
        `SELECT r.player_id, r.bounties_collected, t.bounty_amount
         FROM registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.tournament_id = $1 AND r.bounties_collected > 0`,
        [id]
      );
      for (const row of bountyWinners) {
        await client.query(
          'UPDATE players SET total_career_earnings = total_career_earnings + $1 WHERE id = $2',
          [row.bounties_collected * row.bounty_amount, row.player_id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/finalize', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [tournament] } = await client.query(
        'SELECT id, name, status FROM tournaments WHERE id = $1', [tournamentId]
      );
      if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }
      if (tournament.status === 'finalized') { res.status(400).json({ error: 'Already finalized' }); return; }

      const { rows: registrations } = await client.query(
        `SELECT r.player_id, p.name AS player_name, r.is_active::int AS is_active,
                r.bounties_collected, r.chip_count
         FROM registrations r JOIN players p ON p.id = r.player_id
         WHERE r.tournament_id = $1`,
        [tournamentId]
      );
      const { rows: eliminatedOrder } = await client.query(
        'SELECT victim_id FROM bounty_log WHERE tournament_id = $1 ORDER BY timestamp ASC, id ASC',
        [tournamentId]
      );

      const placements = new Map<number, number>();
      const seenVictims = new Set<number>();
      let nextElimPlacement = registrations.length;
      for (const row of eliminatedOrder) {
        if (seenVictims.has(row.victim_id)) continue;
        seenVictims.add(row.victim_id);
        placements.set(row.victim_id, nextElimPlacement);
        nextElimPlacement--;
      }
      const unresolved = registrations.filter((r: { player_id: number }) => !placements.has(r.player_id));
      const sorted = [...unresolved].sort((a: { is_active: number; chip_count: number; player_id: number }, b: { is_active: number; chip_count: number; player_id: number }) => {
        if (b.is_active !== a.is_active) return b.is_active - a.is_active;
        if (b.chip_count !== a.chip_count) return b.chip_count - a.chip_count;
        return a.player_id - b.player_id;
      });
      let nextTop = 1;
      for (const r of sorted.filter((e: { is_active: number }) => e.is_active === 1)) {
        placements.set(r.player_id, nextTop++);
      }
      let fill = registrations.length;
      for (const r of sorted.filter((e: { player_id: number }) => !placements.has(e.player_id))) {
        while ([...placements.values()].includes(fill) && fill > 0) fill--;
        placements.set(r.player_id, Math.max(fill, nextTop));
        fill--;
      }

      await client.query("UPDATE tournaments SET status = 'finalized' WHERE id = $1", [tournamentId]);
      const { rows: bountyWinners } = await client.query(
        `SELECT r.player_id, r.bounties_collected, t.bounty_amount
         FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.tournament_id = $1 AND r.bounties_collected > 0`,
        [tournamentId]
      );
      for (const row of bountyWinners) {
        await client.query(
          'UPDATE players SET total_career_earnings = total_career_earnings + $1 WHERE id = $2',
          [row.bounties_collected * row.bounty_amount, row.player_id]
        );
      }
      const { rows: linkedSeasons } = await client.query(
        'SELECT season_id FROM season_tournaments WHERE tournament_id = $1', [tournamentId]
      );
      for (const { season_id: seasonId } of linkedSeasons) {
        for (const row of registrations) {
          const placement = placements.get(row.player_id) ?? registrations.length;
          const points = await getPlacementPoints(client, placement, registrations.length);
          const total = points + row.bounties_collected * 3;
          await client.query(
            `INSERT INTO season_results (season_id, player_id, tournament_id, placement, bounties, points, is_opt_player)
             VALUES ($1,$2,$3,$4,$5,$6,TRUE)
             ON CONFLICT (season_id, tournament_id, player_id) DO UPDATE
             SET placement=$4, bounties=$5, points=$6`,
            [seasonId, row.player_id, tournamentId, placement, row.bounties_collected, total]
          );
        }
      }
      await client.query('COMMIT');

      const summary = registrations.map((row: { player_id: number; player_name: string; bounties_collected: number }) => {
        const placement = placements.get(row.player_id) ?? registrations.length;
        const bountyPoints = row.bounties_collected * 3;
        return { player_id: row.player_id, player_name: row.player_name, placement, bounty_points: bountyPoints, tournament_points: 0, total_points: bountyPoints };
      }).sort((a: { placement: number; player_name: string }, b: { placement: number; player_name: string }) => (a.placement - b.placement) || a.player_name.localeCompare(b.player_name));
      res.json({ ok: true, resultsCommitted: linkedSeasons.length * registrations.length, summary });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { rows: [tournament] } = await pool.query('SELECT id, name, status FROM tournaments WHERE id = $1', [id]);
    if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }
    if (tournament.status === 'finished' || tournament.status === 'finalized') {
      res.status(400).json({ error: 'Completed tournaments cannot be deleted' }); return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const delSeasonResults = (await client.query('DELETE FROM season_results WHERE tournament_id = $1', [id])).rowCount ?? 0;
      const delSeasonLinks = (await client.query('DELETE FROM season_tournaments WHERE tournament_id = $1', [id])).rowCount ?? 0;
      const delTableState = (await client.query('DELETE FROM table_state WHERE tournament_id = $1', [id])).rowCount ?? 0;
      const delBlindLevels = (await client.query('DELETE FROM blind_structure WHERE tournament_id = $1', [id])).rowCount ?? 0;
      const delBounties = (await client.query('DELETE FROM bounty_log WHERE tournament_id = $1', [id])).rowCount ?? 0;
      const delRegistrations = (await client.query('DELETE FROM registrations WHERE tournament_id = $1', [id])).rowCount ?? 0;
      await client.query('DELETE FROM tournaments WHERE id = $1', [id]);
      await client.query('COMMIT');
      res.json({ ok: true, tournamentId: id, name: tournament.name, deleted: { deletedSeasonResults: delSeasonResults, deletedSeasonLinks: delSeasonLinks, deletedTableState: delTableState, deletedBlindLevels: delBlindLevels, deletedBounties: delBounties, deletedRegistrations: delRegistrations } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.post('/:id/reset', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: bountyCredits } = await client.query(
        `SELECT r.player_id, r.bounties_collected, t.bounty_amount
         FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.tournament_id = $1 AND r.bounties_collected > 0`,
        [tournamentId]
      );
      let rolledBackCareerEarnings = 0;
      for (const row of bountyCredits) {
        const delta = row.bounties_collected * row.bounty_amount;
        rolledBackCareerEarnings += delta;
        await client.query(
          'UPDATE players SET total_career_earnings = GREATEST(0, total_career_earnings - $1) WHERE id = $2',
          [delta, row.player_id]
        );
      }
      const clearedSeasonResults = (await client.query('DELETE FROM season_results WHERE tournament_id = $1', [tournamentId])).rowCount ?? 0;
      const restoredPlayers = (await client.query(
        'UPDATE registrations SET is_active = TRUE, bounties_collected = 0, table_id = NULL, seat_number = NULL WHERE tournament_id = $1',
        [tournamentId]
      )).rowCount ?? 0;
      const clearedBountyEvents = (await client.query('DELETE FROM bounty_log WHERE tournament_id = $1', [tournamentId])).rowCount ?? 0;
      await client.query("UPDATE tournaments SET status = 'pending' WHERE id = $1 AND status != 'finished'", [tournamentId]);
      await client.query('DELETE FROM table_state WHERE tournament_id = $1', [tournamentId]);
      await client.query('COMMIT');

      // Reseat after commit
      await reassignAllSeats(tournamentId);
      const { rows: chart } = await pool.query(
        `SELECT p.name AS player_name, t.name AS table_name, r.seat_number
         FROM registrations r JOIN players p ON p.id = r.player_id JOIN tables t ON t.id = r.table_id
         WHERE r.tournament_id = $1 AND r.is_active = TRUE ORDER BY t.id, r.seat_number`,
        [tournamentId]
      );
      getIo()?.emit('seats:assigned', { chart });
      getIo()?.emit('tournament:progressReset', { tournamentId });
      res.json({ ok: true, clearedSeasonResults, restoredPlayers, clearedBountyEvents, rolledBackCareerEarnings });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

async function getPlacementPoints(client: { query: Function }, placement: number, playerCount: number): Promise<number> {
  const normalized = Math.max(10, Math.min(41, playerCount));
  const { rows } = await client.query(
    'SELECT points FROM scoring_points WHERE placement = $1 AND player_count = $2',
    [placement, normalized]
  );
  if (rows[0]) return parseFloat(rows[0].points);
  const bucket = Math.min(40, Math.ceil(normalized / 5) * 5);
  const col = `players_${bucket}`;
  const { rows: matrixRows } = await client.query(
    `SELECT ${col} FROM scoring_matrix WHERE placement = $1`, [placement]
  );
  return parseFloat(matrixRows[0]?.[col] ?? '0');
}

async function reassignAllSeats(tournamentId: number): Promise<number> {
  const { rows: players } = await pool.query(
    'SELECT player_id FROM registrations WHERE tournament_id = $1 AND is_active = TRUE',
    [tournamentId]
  );
  const { rows: tables } = await pool.query('SELECT id FROM tables ORDER BY id');
  if (tables.length === 0 || players.length === 0) return 0;
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const seatCounts: Record<number, number> = {};
  for (let i = 0; i < shuffled.length; i++) {
    const table = tables[i % tables.length];
    seatCounts[table.id] = (seatCounts[table.id] ?? 0) + 1;
    await pool.query(
      'UPDATE registrations SET table_id=$1, seat_number=$2 WHERE tournament_id=$3 AND player_id=$4',
      [table.id, seatCounts[table.id], tournamentId, shuffled[i].player_id]
    );
  }
  for (const table of tables) {
    const { rows: seats } = await pool.query(
      'SELECT seat_number FROM registrations WHERE tournament_id=$1 AND table_id=$2 AND is_active=TRUE ORDER BY seat_number',
      [tournamentId, table.id]
    );
    if (seats.length === 0) continue;
    await pool.query(
      `INSERT INTO table_state (tournament_id, table_id, button_seat) VALUES ($1,$2,$3)
       ON CONFLICT (tournament_id, table_id) DO UPDATE SET button_seat = $3`,
      [tournamentId, table.id, seats[0].seat_number]
    );
  }
  return shuffled.length;
}

export { reassignAllSeats, getPlacementPoints };
export default router;
