import { Router } from 'express';
import { randomUUID } from 'crypto';
import pool from '../db/pool';
import { requireAdmin } from '../middleware/requireAdmin';
import { sendInvitationEmail } from '../services/emailService';

const router = Router();
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

// List invitations for a tournament (admin only)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const tournamentId = parseInt(req.query.tournamentId as string);
    if (isNaN(tournamentId)) { res.status(400).json({ error: 'tournamentId required' }); return; }
    const { rows } = await pool.query(
      `SELECT id, tournament_id, email, status, created_at, expires_at
       FROM invitations
       WHERE tournament_id = $1
       ORDER BY created_at DESC`,
      [tournamentId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Validate a token (public — used by /join page)
router.get('/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.email, i.status, i.expires_at,
              t.id AS tournament_id, t.name AS tournament_name
       FROM invitations i
       JOIN tournaments t ON t.id = i.tournament_id
       WHERE i.token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) { res.status(404).json({ valid: false, error: 'Invitation not found' }); return; }
    const inv = rows[0] as { status: string; expires_at: string | null; email: string; tournament_id: number; tournament_name: string };
    if (inv.status !== 'pending') { res.status(410).json({ valid: false, error: 'Invitation already used or expired' }); return; }
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      await pool.query("UPDATE invitations SET status = 'expired' WHERE token = $1", [req.params.token]);
      res.status(410).json({ valid: false, error: 'Invitation has expired' });
      return;
    }
    res.json({ valid: true, email: inv.email, tournament_id: inv.tournament_id, tournament_name: inv.tournament_name });
  } catch (err) { next(err); }
});

// Send invitations (admin only)
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { tournamentId, emails } = req.body as { tournamentId: number; emails: string[] };
    if (!tournamentId || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'tournamentId and emails[] required' }); return;
    }
    const tournament = await pool.query('SELECT id, name FROM tournaments WHERE id = $1', [tournamentId]);
    if ((tournament.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Tournament not found' }); return; }
    const tournamentName = (tournament.rows[0] as { name: string }).name;

    const results: Array<{ email: string; status: 'sent' | 'skipped'; reason?: string }> = [];

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      if (!email) continue;
      try {
        const token = randomUUID();
        await pool.query(
          `INSERT INTO invitations (tournament_id, email, token)
           VALUES ($1, $2, $3)
           ON CONFLICT (tournament_id, email) DO NOTHING`,
          [tournamentId, email, token]
        );
        // Check if a row was actually inserted (vs skipped due to conflict)
        const check = await pool.query(
          'SELECT token FROM invitations WHERE tournament_id = $1 AND email = $2',
          [tournamentId, email]
        );
        const existingToken = (check.rows[0] as { token: string }).token;
        await sendInvitationEmail({
          to: email,
          tournamentName,
          token: existingToken,
          baseUrl: BASE_URL,
          senderEmail: req.firebaseEmail || undefined,
          senderName: req.firebaseName || undefined,
        });
        results.push({ email, status: 'sent' });
      } catch (err) {
        results.push({ email, status: 'skipped', reason: String(err) });
      }
    }

    res.json({ results });
  } catch (err) { next(err); }
});

// Revoke an invitation (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
