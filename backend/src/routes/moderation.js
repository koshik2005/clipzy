import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { HttpError, validate, wrap } from '../util.js';

const router = Router();

const REASONS = ['spam', 'nudity', 'violence', 'hate', 'harassment', 'self_harm', 'illegal', 'minor_safety', 'other'];

// Users report content/accounts (required for UGC apps by App Store guideline 1.2 and Play UGC policy).
router.post(
  '/reports',
  requireAuth,
  wrap(async (req, res) => {
    const body = validate(
      z.object({
        targetType: z.enum(['video', 'comment', 'user']),
        targetId: z.string().uuid(),
        reason: z.enum(REASONS),
        details: z.string().trim().max(500).default(''),
      }),
      req.body,
    );
    const table = { video: 'videos', comment: 'comments', user: 'users' }[body.targetType];
    const exists = await query(`SELECT 1 FROM ${table} WHERE id = $1`, [body.targetId]);
    if (!exists.rowCount) throw new HttpError(404, 'Reported item not found', 'not_found');
    await query('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5)', [
      req.user.id,
      body.targetType,
      body.targetId,
      body.reason,
      body.details,
    ]);
    res.status(201).json({ ok: true });
  }),
);

// ---- Admin moderation queue (header: x-admin-key) ----------------------------------------
router.get(
  '/admin/reports',
  requireAdmin,
  wrap(async (req, res) => {
    const status = ['open', 'actioned', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const { rows } = await query(
      `SELECT r.*, ru.username AS reporter_username FROM reports r JOIN users ru ON ru.id = r.reporter_id
       WHERE r.status = $1 ORDER BY r.created_at ASC LIMIT 100`,
      [status],
    );
    res.json({ items: rows });
  }),
);

router.post(
  '/admin/reports/:id/resolve',
  requireAdmin,
  wrap(async (req, res) => {
    const { action } = validate(z.object({ action: z.enum(['hide_content', 'ban_user', 'dismiss']) }), req.body);
    await withTx(async (c) => {
      const { rows } = await c.query("SELECT * FROM reports WHERE id = $1::uuid AND status = 'open' FOR UPDATE", [req.params.id]);
      if (!rows.length) throw new HttpError(404, 'Open report not found', 'not_found');
      const r = rows[0];

      if (action === 'hide_content') {
        if (r.target_type === 'video') await c.query("UPDATE videos SET status = 'hidden' WHERE id = $1", [r.target_id]);
        else if (r.target_type === 'comment') {
          const upd = await c.query('UPDATE comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING video_id', [r.target_id]);
          if (upd.rowCount) await c.query('UPDATE videos SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1', [upd.rows[0].video_id]);
        } else throw new HttpError(400, 'Use ban_user for user reports', 'invalid');
      }

      if (action === 'ban_user') {
        const owner =
          r.target_type === 'user'
            ? r.target_id
            : (await c.query(`SELECT user_id FROM ${r.target_type === 'video' ? 'videos' : 'comments'} WHERE id = $1`, [r.target_id])).rows[0]?.user_id;
        if (!owner) throw new HttpError(404, 'Offending account not found', 'not_found');
        await c.query('UPDATE users SET deleted_at = now() WHERE id = $1', [owner]);
        await c.query("UPDATE videos SET status = 'hidden' WHERE user_id = $1", [owner]);
        await c.query('DELETE FROM refresh_tokens WHERE user_id = $1', [owner]);
      }

      await c.query('UPDATE reports SET status = $2 WHERE id = $1', [r.id, action === 'dismiss' ? 'dismissed' : 'actioned']);
    });
    res.json({ ok: true });
  }),
);

export default router;
