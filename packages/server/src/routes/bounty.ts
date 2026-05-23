import { Router } from 'express';
import pool from '../db/pool';
import { getIo } from '../services/io';
import { getPlacementPoints } from './tournaments';
import { advanceButtonSeat, broadcastSeatChart, getRebalanceSuggestion } from './tables';

const router = Router();

router.post('/eliminate', async (req, res, next) => {
  try {
    const { killerId, victimId, tournamentId } = req.body as { killerId: number; victimId: number; tournamentId: number };
    const result = await processEliminations(tournamentId, [{ killerId, victimId }]);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/eliminate-batch', async (req, res, next) => {
  try {
    const { tournamentId, eliminations } = req.body as { tournamentId: number; eliminations: Array<{ killerId: number; victimId: number }> };
    const result = await processEliminations(tournamentId, eliminations);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/leaderboard/:tournamentId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.name, r.bounties_collected
       FROM registrations r JOIN players p ON p.id=r.player_id
       WHERE r.tournament_id=$1 AND r.bounties_collected > 0
       ORDER BY r.bounties_collected DESC, p.name ASC
       LIMIT 10`,
      [parseInt(req.params.tournamentId)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

async function processEliminations(tournamentId: number, eliminations: Array<{ killerId: number; victimId: number }>) {
  if (eliminations.length === 0) return { ok: true, rebalance: await getRebalanceSuggestion(tournamentId) };

  const { rows: victimRows } = await pool.query(
    `SELECT r.player_id, r.table_id, r.bounties_collected, p.name
     FROM registrations r JOIN players p ON p.id=r.player_id
     WHERE r.tournament_id=$1 AND r.is_active=TRUE`,
    [tournamentId]
  );
  const victimLookup = new Map(victimRows.map((r: { player_id: number; table_id: number | null; bounties_collected: number; name: string }) => [r.player_id, r]));
  const seenVictims = new Set<number>();
  const valid = eliminations.filter((e) => {
    if (seenVictims.has(e.victimId) || e.killerId === e.victimId) return false;
    if (!victimLookup.has(e.victimId)) return false;
    seenVictims.add(e.victimId);
    return true;
  });
  if (valid.length === 0) return { ok: true, rebalance: await getRebalanceSuggestion(tournamentId) };

  const { rows: [{ count: totalEntrants }] } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM registrations WHERE tournament_id=$1', [tournamentId]
  );
  const activeBeforeBatch = victimRows.length;
  const affectedTables = new Set<number>();
  const summaries: Array<{ killerId: number; killerName: string; victimId: number; victimName: string; placement: number; placementPoints: number; victimBountiesCollected: number }> = [];

  for (const [index, elimination] of valid.entries()) {
    const victim = victimLookup.get(elimination.victimId)!;
    const killer = victimLookup.get(elimination.killerId);
    const placement = activeBeforeBatch - index;
    const placementPoints = await getPlacementPoints(pool as unknown as { query: Function }, placement, totalEntrants);
    await pool.query('UPDATE registrations SET is_active=FALSE WHERE tournament_id=$1 AND player_id=$2', [tournamentId, elimination.victimId]);
    await pool.query('UPDATE registrations SET bounties_collected=bounties_collected+1 WHERE tournament_id=$1 AND player_id=$2', [tournamentId, elimination.killerId]);
    await pool.query('INSERT INTO bounty_log (tournament_id, killer_id, victim_id) VALUES ($1,$2,$3)', [tournamentId, elimination.killerId, elimination.victimId]);
    if (victim.table_id) affectedTables.add(victim.table_id);
    summaries.push({ killerId: elimination.killerId, killerName: killer?.name ?? 'Unknown', victimId: elimination.victimId, victimName: victim.name, placement, placementPoints, victimBountiesCollected: victim.bounties_collected });
  }

  for (const tableId of affectedTables) await advanceButtonSeat(tournamentId, tableId);
  await broadcastSeatChart(tournamentId);

  const { rows: leaderboard } = await pool.query(
    `SELECT p.name, r.bounties_collected
     FROM registrations r JOIN players p ON p.id=r.player_id
     WHERE r.tournament_id=$1 AND r.bounties_collected > 0
     ORDER BY r.bounties_collected DESC LIMIT 3`,
    [tournamentId]
  );

  const io = getIo();
  for (const s of summaries) {
    const { rows: [killerRow] } = await pool.query(
      'SELECT bounties_collected FROM registrations WHERE tournament_id=$1 AND player_id=$2',
      [tournamentId, s.killerId]
    );
    io?.emit('player:eliminated', {
      tournamentId, killerId: s.killerId, killerName: s.killerName,
      victimId: s.victimId, victimName: s.victimName, placement: s.placement,
      awards: [
        { playerId: s.victimId, playerName: s.victimName, kind: 'placement', points: s.placementPoints, totalPoints: s.placementPoints + s.victimBountiesCollected * 3, placement: s.placement, bountiesCollected: s.victimBountiesCollected },
        { playerId: s.killerId, playerName: s.killerName, kind: 'bounty', points: 3, totalPoints: (killerRow?.bounties_collected ?? 0) * 3, bountiesCollected: killerRow?.bounties_collected ?? 0 },
      ],
      leaderboard,
    });
  }

  return { ok: true, rebalance: await getRebalanceSuggestion(tournamentId) };
}

export default router;
