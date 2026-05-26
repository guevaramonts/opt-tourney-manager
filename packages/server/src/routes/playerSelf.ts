import { Router } from 'express';
import pool from '../db/pool';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All routes here require a valid Firebase token (any user, not admin-only)
router.use(requireAuth);

// Link Firebase account to a player record (or create a new player).
// Call this once on first login / account creation.
router.post('/link', async (req, res, next) => {
  try {
    const uid = req.firebaseUid!;
    const email = req.firebaseEmail!;
    const { name, nickname, phone } = req.body as { name?: string; nickname?: string; phone?: string };

    // Already linked?
    const byUid = await pool.query(
      'SELECT id, name, nickname, email, phone, total_career_earnings FROM players WHERE firebase_uid = $1',
      [uid]
    );
    if ((byUid.rowCount ?? 0) > 0) { res.json(byUid.rows[0]); return; }

    // Existing player with matching email?
    if (email) {
      const byEmail = await pool.query(
        'SELECT id, name, nickname, email, phone, total_career_earnings FROM players WHERE email = $1',
        [email]
      );
      if ((byEmail.rowCount ?? 0) > 0) {
        await pool.query('UPDATE players SET firebase_uid = $1 WHERE id = $2', [uid, byEmail.rows[0].id]);
        res.json({ ...(byEmail.rows[0] as object), firebase_uid: uid });
        return;
      }
    }

    // Create new player record
    const displayName = name?.trim();
    if (!displayName) { res.status(400).json({ error: 'Name is required on first account setup' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO players (name, nickname, email, phone, firebase_uid)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, nickname, email, phone, total_career_earnings`,
      [displayName, nickname?.trim() || null, email || null, phone?.trim() || null, uid]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Get the current player's profile and their registrations
router.get('/me', async (req, res, next) => {
  try {
    const uid = req.firebaseUid!;
    const playerRes = await pool.query(
      'SELECT id, name, nickname, email, phone, total_career_earnings FROM players WHERE firebase_uid = $1',
      [uid]
    );
    if ((playerRes.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Player not found — complete account setup first' }); return; }
    const player = playerRes.rows[0] as { id: number };

    const regRes = await pool.query(
      `SELECT r.tournament_id, t.name AS tournament_name, t.status AS tournament_status,
              r.chip_count, r.is_active, r.bounties_collected,
              tab.name AS table_name, r.seat_number
       FROM registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       LEFT JOIN tables tab ON tab.id = r.table_id
       WHERE r.player_id = $1
       ORDER BY r.tournament_id DESC`,
      [player.id]
    );

    res.json({ player: playerRes.rows[0], registrations: regRes.rows });
  } catch (err) { next(err); }
});

// Accept an invitation and register for the tournament
router.post('/accept-invitation', async (req, res, next) => {
  try {
    const uid = req.firebaseUid!;
    const email = req.firebaseEmail!;
    const { token } = req.body as { token: string };
    if (!token) { res.status(400).json({ error: 'token required' }); return; }

    // Validate invitation
    const invRes = await pool.query(
      `SELECT i.id, i.email, i.status, i.expires_at, i.tournament_id,
              t.name AS tournament_name, t.status AS tournament_status
       FROM invitations i
       JOIN tournaments t ON t.id = i.tournament_id
       WHERE i.token = $1`,
      [token]
    );
    if ((invRes.rowCount ?? 0) === 0) { res.status(404).json({ error: 'Invitation not found' }); return; }

    const inv = invRes.rows[0] as {
      id: number; email: string; status: string; expires_at: string | null;
      tournament_id: number; tournament_name: string; tournament_status: string;
    };

    if (inv.status !== 'pending') { res.status(409).json({ error: 'Invitation already used or expired' }); return; }
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [inv.id]);
      res.status(410).json({ error: 'Invitation has expired' });
      return;
    }
    if (['finished', 'finalized'].includes(inv.tournament_status)) {
      res.status(409).json({ error: 'Tournament is already finished' }); return;
    }

    // Enforce email match
    if (email && inv.email !== email.toLowerCase()) {
      res.status(403).json({ error: 'This invitation was sent to a different email address' }); return;
    }

    // Resolve or create the player record
    let playerRes = await pool.query(
      'SELECT id FROM players WHERE firebase_uid = $1',
      [uid]
    );
    let playerId: number;
    if ((playerRes.rowCount ?? 0) > 0) {
      playerId = (playerRes.rows[0] as { id: number }).id;
    } else {
      // Try to match by email
      const byEmail = await pool.query('SELECT id FROM players WHERE email = $1', [inv.email]);
      if ((byEmail.rowCount ?? 0) > 0) {
        playerId = (byEmail.rows[0] as { id: number }).id;
        await pool.query('UPDATE players SET firebase_uid = $1 WHERE id = $2', [uid, playerId]);
      } else {
        res.status(400).json({ error: 'Complete account setup (POST /api/player/link) before accepting an invitation' });
        return;
      }
    }

    // Register for tournament (idempotent on conflict)
    try {
      await pool.query(
        `INSERT INTO registrations (tournament_id, player_id) VALUES ($1, $2)`,
        [inv.tournament_id, playerId]
      );
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Already registered for this tournament' }); return;
      }
      throw err;
    }

    // Mark invitation accepted
    await pool.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);

    res.json({ ok: true, tournament_id: inv.tournament_id, tournament_name: inv.tournament_name });
  } catch (err) { next(err); }
});

export default router;
