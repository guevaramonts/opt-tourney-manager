import { Router } from 'express';
import pool from '../db/pool';

const router = Router();

router.get('/:tournamentId', async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.params.tournamentId);
    const { rows: [tournament] } = await pool.query('SELECT * FROM tournaments WHERE id=$1', [tournamentId]);
    if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }
    const { rows: [{ count: totalEntrants }] } = await pool.query('SELECT COUNT(*)::int AS count FROM registrations WHERE tournament_id=$1', [tournamentId]);
    const { rows: [{ count: totalBounties }] } = await pool.query('SELECT COUNT(*)::int AS count FROM bounty_log WHERE tournament_id=$1', [tournamentId]);
    const grossPool = totalEntrants * tournament.buy_in;
    const bountyPool = totalEntrants * tournament.bounty_amount;
    const prizePool = grossPool - bountyPool;
    const paidOutBounties = totalBounties * tournament.bounty_amount;
    const payouts = [0.5, 0.3, 0.2].map((pct, i) => ({ place: i + 1, amount: Math.floor(prizePool * pct) }));
    res.json({ playerCount: totalEntrants, buyInTotal: grossPool, prizePool, bountyPool, paidOutBounties, payouts });
  } catch (err) { next(err); }
});

export default router;
