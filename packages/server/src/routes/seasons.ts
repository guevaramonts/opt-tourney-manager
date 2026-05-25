import { Router } from 'express';
import pool from '../db/pool';

const router = Router();

async function getPlacementPoints(placement: number, playerCount: number): Promise<number> {
  const normalized = Math.max(10, Math.min(41, playerCount));
  const { rows } = await pool.query('SELECT points FROM scoring_points WHERE placement=$1 AND player_count=$2', [placement, normalized]);
  if (rows[0]) return parseFloat(rows[0].points);
  const bucket = Math.min(40, Math.ceil(normalized / 5) * 5);
  const col = `players_${bucket}`;
  const { rows: m } = await pool.query(`SELECT ${col} FROM scoring_matrix WHERE placement=$1`, [placement]);
  return parseFloat(m[0]?.[col] ?? '0');
}

async function computeSeasonTotalPoints(tournamentId: number, placement: number, bounties: number): Promise<number> {
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM registrations WHERE tournament_id=$1', [tournamentId]);
  const pts = await getPlacementPoints(placement, count);
  return pts + bounties * 3;
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, status, start_date, end_date, created_at FROM seasons ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body as { name: string };
    const trimmed = name?.trim();
    if (!trimmed) { res.status(400).json({ error: 'Name is required' }); return; }
    const { rows: [season] } = await pool.query(
      "INSERT INTO seasons (name, status) VALUES ($1,'pending') RETURNING id, name, status, start_date, end_date, created_at",
      [trimmed]
    );
    res.status(201).json(season);
  } catch (err) { next(err); }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const { rows: [season] } = await pool.query('SELECT id, name FROM seasons WHERE id=$1', [seasonId]);
    if (!season) { res.status(404).json({ error: 'Season not found' }); return; }
    const { rows: [defaultStructure] } = await pool.query("SELECT id FROM blind_structures WHERE name='OPT Default' ORDER BY id LIMIT 1");
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE seasons SET status='active', start_date=COALESCE(start_date,CURRENT_DATE::text) WHERE id=$1", [seasonId]);
      const { rows: linked } = await client.query('SELECT tournament_number FROM season_tournaments WHERE season_id=$1', [seasonId]);
      const linkedNums = new Set(linked.map((r: { tournament_number: number }) => r.tournament_number));
      let created = 0;
      for (let n = 1; n <= 7; n++) {
        if (linkedNums.has(n)) continue;
        const { rows: [t] } = await client.query(
          "INSERT INTO tournaments (name,buy_in,bounty_amount,blind_structure_id,status) VALUES ($1,20,5,$2,'pending') RETURNING id",
          [`${season.name} - Tournament ${n}`, defaultStructure?.id ?? null]
        );
        await client.query(
          'INSERT INTO season_tournaments (season_id,tournament_id,tournament_number) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [seasonId, t.id, n]
        );
        created++;
      }
      await client.query('COMMIT');
      res.json({ ok: true, createdTournaments: created });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.post('/:id/finish', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const exists = await pool.query('SELECT id FROM seasons WHERE id=$1', [seasonId]);
    if ((exists.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Not found' }); return; }
    await pool.query("UPDATE seasons SET status='finished', end_date=COALESCE(end_date,CURRENT_DATE::text) WHERE id=$1", [seasonId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/delete-impact', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    res.json(await getSeasonDeleteImpact(seasonId));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const impact = await getSeasonDeleteImpact(seasonId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: linked } = await client.query('SELECT tournament_id FROM season_tournaments WHERE season_id=$1', [seasonId]);
      const linkedIds = linked.map((r: { tournament_id: number }) => r.tournament_id);
      let exclusiveIds: number[] = [];
      if (linkedIds.length > 0) {
        const placeholders = linkedIds.map((_: unknown, i: number) => `$${i + 2}`).join(',');
        const { rows: shared } = await client.query(
          `SELECT DISTINCT tournament_id FROM season_tournaments WHERE season_id != $1 AND tournament_id IN (${placeholders})`,
          [seasonId, ...linkedIds]
        );
        const sharedSet = new Set(shared.map((r: { tournament_id: number }) => r.tournament_id));
        exclusiveIds = linkedIds.filter((id: number) => !sharedSet.has(id));
      }
      if (exclusiveIds.length > 0) {
        const ph = exclusiveIds.map((_: unknown, i: number) => `$${i + 1}`).join(',');
        await client.query(`DELETE FROM season_results WHERE tournament_id IN (${ph})`, exclusiveIds);
        await client.query(`DELETE FROM table_state WHERE tournament_id IN (${ph})`, exclusiveIds);
        await client.query(`DELETE FROM blind_structure WHERE tournament_id IN (${ph})`, exclusiveIds);
        await client.query(`DELETE FROM bounty_log WHERE tournament_id IN (${ph})`, exclusiveIds);
        await client.query(`DELETE FROM registrations WHERE tournament_id IN (${ph})`, exclusiveIds);
        await client.query(`DELETE FROM tournaments WHERE id IN (${ph})`, exclusiveIds);
      }
      await client.query('DELETE FROM season_results WHERE season_id=$1', [seasonId]);
      await client.query('DELETE FROM season_tournaments WHERE season_id=$1', [seasonId]);
      await client.query('DELETE FROM seasons WHERE id=$1', [seasonId]);
      await client.query('COMMIT');
      res.json({ ok: true, seasonId, name: impact.name, impact, deleted: {} });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.get('/:id/leaderboard', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const { rows: results } = await pool.query(
      `SELECT p.id AS player_id, p.name AS player_name,
              SUM(sr.points) AS total_points,
              COUNT(DISTINCT sr.tournament_id)::int AS tournament_count,
              STRING_AGG(sr.points::text, ',') AS all_scores
       FROM season_results sr JOIN players p ON p.id=sr.player_id
       WHERE sr.season_id=$1 AND sr.is_opt_player=TRUE
       GROUP BY p.id, p.name
       ORDER BY total_points DESC`,
      [seasonId]
    );
    const { rows: tScores } = await pool.query(
      `SELECT sr.player_id, sr.tournament_id, sr.points AS total_points, sr.bounties
       FROM season_results sr WHERE sr.season_id=$1 AND sr.is_opt_player=TRUE`,
      [seasonId]
    );
    const scoresByPlayer = new Map<number, Array<{ tournament_id: number; tournament_points: number; bounty_points: number; total_points: number }>>();
    for (const s of tScores) {
      const bp = s.bounties * 3;
      const tp = parseFloat(s.total_points) - bp;
      const arr = scoresByPlayer.get(s.player_id) ?? [];
      arr.push({ tournament_id: s.tournament_id, tournament_points: tp, bounty_points: bp, total_points: parseFloat(s.total_points) });
      scoresByPlayer.set(s.player_id, arr);
    }
    const leaderboard = results.map((row: { player_id: number; player_name: string; total_points: string; tournament_count: number; all_scores: string }) => {
      const scores = (row.all_scores ?? '').split(',').map(parseFloat).filter((n) => !isNaN(n)).sort((a, b) => b - a).slice(0, 6);
      return { player_id: row.player_id, player_name: row.player_name, total_points: scores.reduce((a, b) => a + b, 0), tournament_count: row.tournament_count, top_6_scores: scores, tournament_scores: scoresByPlayer.get(row.player_id) ?? [], is_toc_eligible: true };
    });
    res.json(leaderboard);
  } catch (err) { next(err); }
});

router.get('/:id/tournaments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.season_id, st.tournament_id, st.tournament_number, t.name AS tournament_name,
              t.status AS tournament_status,
              COUNT(DISTINCT r.player_id)::int AS player_count,
              COUNT(DISTINCT sr.player_id)::int AS synced_results_count
       FROM season_tournaments st
       JOIN tournaments t ON t.id=st.tournament_id
       LEFT JOIN registrations r ON r.tournament_id=st.tournament_id
       LEFT JOIN season_results sr ON sr.season_id=st.season_id AND sr.tournament_id=st.tournament_id
       WHERE st.season_id=$1
       GROUP BY st.season_id, st.tournament_id, st.tournament_number, t.name, t.status
       ORDER BY st.tournament_number ASC, st.tournament_id ASC`,
      [parseInt(req.params.id)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/add-tournament', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const { tournamentId, tournamentNumber } = req.body as { tournamentId: number; tournamentNumber: number };
    await pool.query(
      'INSERT INTO season_tournaments (season_id,tournament_id,tournament_number) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [seasonId, tournamentId, tournamentNumber]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/sync/:tournamentId', async (req, res, next) => {
  try {
    const seasonId = parseInt(req.params.id);
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows: regs } = await pool.query(
      'SELECT player_id, is_active::int AS is_active, bounties_collected, chip_count FROM registrations WHERE tournament_id=$1',
      [tournamentId]
    );
    if (!regs.length) { res.json({ ok: true, upserted: 0 }); return; }
    const { rows: elimOrder } = await pool.query('SELECT victim_id FROM bounty_log WHERE tournament_id=$1 ORDER BY timestamp, id', [tournamentId]);
    const placements = new Map<number, number>();
    const seen = new Set<number>();
    let nextElim = regs.length;
    for (const r of elimOrder) {
      if (seen.has(r.victim_id)) continue;
      seen.add(r.victim_id); placements.set(r.victim_id, nextElim--);
    }
    const unresolved = regs.filter((r: { player_id: number }) => !placements.has(r.player_id));
    const sorted = [...unresolved].sort((a: { is_active: number; chip_count: number; player_id: number }, b: { is_active: number; chip_count: number; player_id: number }) => {
      if (b.is_active !== a.is_active) return b.is_active - a.is_active;
      if (b.chip_count !== a.chip_count) return b.chip_count - a.chip_count;
      return a.player_id - b.player_id;
    });
    let nextTop = 1;
    for (const r of sorted.filter((e: { is_active: number }) => e.is_active === 1)) placements.set(r.player_id, nextTop++);
    let fill = regs.length;
    for (const r of sorted.filter((e: { player_id: number }) => !placements.has(e.player_id))) {
      while ([...placements.values()].includes(fill) && fill > 0) fill--;
      placements.set(r.player_id, Math.max(fill, nextTop)); fill--;
    }
    let upserted = 0;
    for (const row of regs) {
      const placement = placements.get(row.player_id) ?? regs.length;
      const total = await computeSeasonTotalPoints(tournamentId, placement, row.bounties_collected);
      await pool.query(
        `INSERT INTO season_results (season_id,player_id,tournament_id,placement,bounties,points,is_opt_player)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         ON CONFLICT (season_id,tournament_id,player_id) DO UPDATE SET placement=$4,bounties=$5,points=$6`,
        [seasonId, row.player_id, tournamentId, placement, row.bounties_collected, total]
      );
      upserted++;
    }
    res.json({ ok: true, upserted });
  } catch (err) { next(err); }
});

router.get('/scoring-matrix', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM scoring_matrix ORDER BY placement');
    res.json(rows);
  } catch (err) { next(err); }
});

async function getSeasonDeleteImpact(seasonId: number) {
  const { rows: [season] } = await pool.query('SELECT id, name FROM seasons WHERE id=$1', [seasonId]);
  if (!season) throw new Error('Season not found');
  const { rows: linked } = await pool.query('SELECT tournament_id FROM season_tournaments WHERE season_id=$1', [seasonId]);
  const linkedIds = linked.map((r: { tournament_id: number }) => r.tournament_id);
  const { rows: [{ count: seasonResultCount }] } = await pool.query('SELECT COUNT(*)::int AS count FROM season_results WHERE season_id=$1', [seasonId]);
  return { seasonId: season.id, name: season.name, linkedTournamentCount: linkedIds.length, sharedTournamentCount: 0, exclusiveTournamentCount: 0, seasonResultCount, registrationCount: 0, bountyLogCount: 0, tableStateCount: 0, blindLevelCount: 0, hasData: linkedIds.length > 0 || seasonResultCount > 0 };
}

export default router;
