import { Router } from 'express';
import pool from '../db/pool';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT bs.id, bs.name, bs.created_at, COUNT(bsl.id)::int AS level_count
       FROM blind_structures bs
       LEFT JOIN blind_structure_levels bsl ON bsl.blind_structure_id = bs.id
       GROUP BY bs.id, bs.name, bs.created_at
       ORDER BY bs.name ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id/levels', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, blind_structure_id, level, small_blind, big_blind, ante, duration_seconds,
              is_break::int AS is_break, break_label
       FROM blind_structure_levels
       WHERE blind_structure_id = $1
       ORDER BY level ASC`,
      [parseInt(req.params.id)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, levels } = req.body as { name: string; levels: Array<{ level: number; small_blind: number; big_blind: number; ante?: number; duration_seconds: number; is_break: 0 | 1; break_label?: string | null }> };
    const trimmed = name?.trim();
    if (!trimmed) { res.status(400).json({ error: 'Name is required' }); return; }
    if (!levels?.length) { res.status(400).json({ error: 'At least one level is required' }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [structure] } = await client.query(
        'INSERT INTO blind_structures (name) VALUES ($1) RETURNING id, name, created_at', [trimmed]
      );
      for (const row of levels) {
        await client.query(
          `INSERT INTO blind_structure_levels
             (blind_structure_id, level, small_blind, big_blind, ante, duration_seconds, is_break, break_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [structure.id, row.level, row.small_blind, row.big_blind, row.ante ?? 0, row.duration_seconds, row.is_break === 1, row.break_label ?? null]
        );
      }
      await client.query('COMMIT');
      res.status(201).json(structure);
    } catch (err) {
      await client.query('ROLLBACK');
      if (String(err).toLowerCase().includes('unique')) { res.status(409).json({ error: 'Name already exists' }); return; }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, levels } = req.body as { name: string; levels: Array<{ level: number; small_blind: number; big_blind: number; ante?: number; duration_seconds: number; is_break: 0 | 1; break_label?: string | null }> };
    const trimmed = name?.trim();
    if (!trimmed) { res.status(400).json({ error: 'Name is required' }); return; }
    if (!levels?.length) { res.status(400).json({ error: 'At least one level is required' }); return; }
    const exists = await pool.query('SELECT id FROM blind_structures WHERE id=$1', [id]);
    if ((exists.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Not found' }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE blind_structures SET name=$1 WHERE id=$2', [trimmed, id]);
      await client.query('DELETE FROM blind_structure_levels WHERE blind_structure_id=$1', [id]);
      for (const row of levels) {
        await client.query(
          `INSERT INTO blind_structure_levels
             (blind_structure_id, level, small_blind, big_blind, ante, duration_seconds, is_break, break_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, row.level, row.small_blind, row.big_blind, row.ante ?? 0, row.duration_seconds, row.is_break === 1, row.break_label ?? null]
        );
      }
      await client.query('COMMIT');
      const { rows: [updated] } = await pool.query('SELECT id, name, created_at FROM blind_structures WHERE id=$1', [id]);
      res.json(updated);
    } catch (err) {
      await client.query('ROLLBACK');
      if (String(err).toLowerCase().includes('unique')) { res.status(409).json({ error: 'Name already exists' }); return; }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { rows: [linked] } = await pool.query('SELECT COUNT(*)::int AS count FROM tournaments WHERE blind_structure_id=$1', [id]);
    if (linked.count > 0) { res.status(400).json({ error: 'Linked to tournaments' }); return; }
    const result = await pool.query('DELETE FROM blind_structures WHERE id=$1', [id]);
    if ((result.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
