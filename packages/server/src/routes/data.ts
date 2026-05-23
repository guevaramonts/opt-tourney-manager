import { Router } from 'express';
import pool from '../db/pool';
import { clockPause, clockReset } from '../services/clockService';

const router = Router();

router.post('/reset-keep-players', async (_req, res, next) => {
  try {
    clockPause();
    clockReset();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const delSeasonResults = (await client.query('DELETE FROM season_results')).rowCount ?? 0;
      const delSeasonTournaments = (await client.query('DELETE FROM season_tournaments')).rowCount ?? 0;
      const delSeasons = (await client.query('DELETE FROM seasons')).rowCount ?? 0;
      const delTableState = (await client.query('DELETE FROM table_state')).rowCount ?? 0;
      const delBlindLevels = (await client.query('DELETE FROM blind_structure')).rowCount ?? 0;
      const delBountyLog = (await client.query('DELETE FROM bounty_log')).rowCount ?? 0;
      const delRegistrations = (await client.query('DELETE FROM registrations')).rowCount ?? 0;
      const delTournaments = (await client.query('DELETE FROM tournaments WHERE id != 0')).rowCount ?? 0;
      await client.query('UPDATE players SET total_career_earnings = 0');
      await client.query('COMMIT');
      res.json({ ok: true, deleted: { seasonResults: delSeasonResults, seasonTournaments: delSeasonTournaments, seasons: delSeasons, tableState: delTableState, blindStructureLevels: delBlindLevels, bountyLog: delBountyLog, registrations: delRegistrations, tournaments: delTournaments } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
