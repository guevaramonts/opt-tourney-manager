import { Router } from 'express';
import pool from '../db/pool';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.nickname, p.email, p.phone, p.total_career_earnings,
              COUNT(DISTINCT r.tournament_id)::int AS tournaments_played
       FROM players p
       LEFT JOIN registrations r ON r.player_id = p.id
       GROUP BY p.id
       ORDER BY p.name ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, nickname, email, phone } = req.body as Record<string, string>;
    const trimmed = name?.trim();
    if (!trimmed) { res.status(400).json({ error: 'Name is required' }); return; }
    const exists = await pool.query('SELECT id FROM players WHERE name = $1', [trimmed]);
    if ((exists.rowCount ?? 0) > 0) { res.status(409).json({ error: `Player "${trimmed}" already exists` }); return; }
    const { rows } = await pool.query(
      `INSERT INTO players (name, nickname, email, phone)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, nickname, email, phone, total_career_earnings`,
      [trimmed, nickname?.trim() || null, email?.trim() || null, phone?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const playerId = parseInt(req.params.id);
    const { name, nickname, email, phone } = req.body as Record<string, string | undefined>;
    const exists = await pool.query('SELECT id FROM players WHERE id = $1', [playerId]);
    if ((exists.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Player not found' }); return; }
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) { res.status(400).json({ error: 'Name cannot be empty' }); return; }
      const dup = await pool.query('SELECT id FROM players WHERE name = $1 AND id != $2', [trimmed, playerId]);
      if ((dup.rowCount ?? 0) > 0) { res.status(409).json({ error: `Player "${trimmed}" already exists` }); return; }
      updates.push(`name = $${idx++}`); values.push(trimmed);
    }
    if (nickname !== undefined) { updates.push(`nickname = $${idx++}`); values.push(nickname.trim() || null); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email.trim() || null); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone.trim() || null); }
    if (updates.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    values.push(playerId);
    await pool.query(`UPDATE players SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const playerId = parseInt(req.params.id);
    const used = await pool.query('SELECT 1 FROM registrations WHERE player_id = $1 LIMIT 1', [playerId]);
    if ((used.rowCount ?? 0) > 0) { res.status(400).json({ error: 'Cannot delete a player who has tournament history' }); return; }
    await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Registration endpoints
router.post('/register', async (req, res, next) => {
  try {
    const { name, tournamentId, chipCount } = req.body as { name: string; tournamentId: number; chipCount?: number };
    let player = await pool.query('SELECT id FROM players WHERE name = $1', [name]);
    let playerId: number;
    if ((player.rowCount ?? 0) === 0) {
      const { rows } = await pool.query('INSERT INTO players (name) VALUES ($1) RETURNING id', [name]);
      playerId = rows[0].id;
    } else {
      playerId = player.rows[0].id;
    }
    await pool.query(
      `INSERT INTO registrations (tournament_id, player_id, chip_count)
       VALUES ($1,$2,$3)
       ON CONFLICT (tournament_id, player_id)
       DO UPDATE SET is_active = TRUE, chip_count = $3`,
      [tournamentId, playerId, chipCount ?? 10000]
    );
    const { rows } = await pool.query(
      `SELECT p.id, p.name, r.player_id, r.chip_count, r.is_active::int AS is_active, r.bounties_collected
       FROM registrations r
       JOIN players p ON p.id = r.player_id
       WHERE r.tournament_id = $1 AND r.player_id = $2`,
      [tournamentId, playerId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/unregister', async (req, res, next) => {
  try {
    const { tournamentId, playerId } = req.body as { tournamentId: number; playerId: number };
    await pool.query(
      'UPDATE registrations SET is_active = FALSE WHERE tournament_id = $1 AND player_id = $2',
      [tournamentId, playerId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/active/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.nickname, r.player_id, r.chip_count,
              r.is_active::int AS is_active, r.bounties_collected,
              r.table_id, t.name AS table_name, r.seat_number
       FROM registrations r
       JOIN players p ON p.id = r.player_id
       LEFT JOIN tables t ON t.id = r.table_id
       WHERE r.tournament_id = $1 AND r.is_active = TRUE
       ORDER BY r.table_id, r.seat_number`,
      [tournamentId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
