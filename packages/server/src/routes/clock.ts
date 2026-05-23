import { Router } from 'express';
import * as clockService from '../services/clockService';

const router = Router();

router.post('/play', async (req, res, next) => {
  try {
    const tournamentId = req.body.tournamentId ? Number(req.body.tournamentId) : undefined;
    const result = await clockService.clockPlay(tournamentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/pause', (_req, res) => {
  res.json(clockService.clockPause());
});

router.post('/reset', (_req, res) => {
  res.json(clockService.clockReset());
});

router.post('/next-level', (_req, res) => {
  res.json(clockService.clockNextLevel());
});

router.get('/state', (_req, res) => {
  res.json(clockService.getClockState());
});

export default router;
