import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTx } from '../db.js';
import { optionalAuth, requireAuth } from '../auth.js';
import { HttpError, decodeCursor, encodeCursor, validate, wrap } from '../util.js';
import { deleteObject, keyBelongsTo, objectSize } from '../storage.js';
import { VIDEO_SELECT, clampLimit, toVideo } from './shared.js';

const router = Router();

// ---- Feed ---------------------------------------------------------------
router.get(
  '/feed',
  optionalAuth,
  wrap(async (req, res) => {
    const limit = clampLimit(req.query.limit);
    const cursor = decodeCursor(req.query.cursor);
    const tab = req.query.tab === 'following' ? 'following' : 'foryou';
    if (tab === 'following' && !req.user) throw new HttpError(401, 'Sign in to see your following feed', 'unauthorized');

    const params = [req.user?.id ?? null];
    let sql = VIDEO_SELECT;
    if (tab === 'following') sql += ` AND v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1::uuid)`;
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      sql += ` AND (v.created_at, v.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit + 1);
    sql += ` ORDER BY v.created_at DESC, v.id DESC LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    const page = rows.slice(0, limit);
    res.json({
      items: page.map(toVideo),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    });
  }),
);

// ---- Create / read / delete ----------------------------------------------
const createSchema = z.object({
  videoKey: z.string().min(1),
  thumbKey: z.string().min(1).optional(),
  caption: z.string().trim().max(300).default(''),
  durationMs: z.number().int().min(0).max(config.MAX_VIDEO_SECONDS * 1000 + 1000).default(0),
});

router.post(
  '/videos',
  requireAuth,
  wrap(async (req, res) => {
    const body = validate(createSchema, req.body);
    if (!keyBelongsTo(body.videoKey, req.user.id) || (body.thumbKey && !keyBelongsTo(body.thumbKey, req.user.id))) {
      throw new HttpError(403, 'Upload key does not belong to you', 'bad_key');
    }
    const size = await objectSize(body.videoKey);
    if (size == null) throw new HttpError(400, 'Video file was not uploaded', 'missing_upload');
    if (size > config.maxUploadBytes) {
      await deleteObject(body.videoKey);
      throw new HttpError(413, 'Video file is too large', 'too_large');
    }
    const { rows } = await query(
      `INSERT INTO videos (user_id, video_key, thumb_key, caption, duration_ms) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, body.videoKey, body.thumbKey ?? null, body.caption, body.durationMs],
    );
    const v = await query(`${VIDEO_SELECT} AND v.id = $2`, [req.user.id, rows[0].id]);
    res.status(201).json(toVideo(v.rows[0]));
  }),
);

router.get(
  '/videos/:id',
  optionalAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`${VIDEO_SELECT} AND v.id = $2::uuid`, [req.user?.id ?? null, req.params.id]).catch(
      (err) => {
        if (err.code === '22P02') return { rows: [] };
        throw err;
      },
    );
    if (!rows.length) throw new HttpError(404, 'Video not found', 'not_found');
    res.json(toVideo(rows[0]));
  }),
);

router.delete(
  '/videos/:id',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query('DELETE FROM videos WHERE id = $1::uuid AND user_id = $2 RETURNING video_key, thumb_key', [
      req.params.id,
      req.user.id,
    ]);
    if (!rows.length) throw new HttpError(404, 'Video not found', 'not_found');
    await Promise.all([deleteObject(rows[0].video_key), deleteObject(rows[0].thumb_key)]);
    res.json({ ok: true });
  }),
);

// ---- Likes / views --------------------------------------------------------
async function setLike(req, res, like) {
  const result = await withTx(async (c) => {
    const exists = await c.query("SELECT 1 FROM videos WHERE id = $1::uuid AND status = 'active'", [req.params.id]);
    if (!exists.rowCount) throw new HttpError(404, 'Video not found', 'not_found');
    const changed = like
      ? await c.query('INSERT INTO likes (user_id, video_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING', [req.user.id, req.params.id])
      : await c.query('DELETE FROM likes WHERE user_id = $1 AND video_id = $2::uuid', [req.user.id, req.params.id]);
    if (changed.rowCount) {
      await c.query('UPDATE videos SET likes_count = GREATEST(likes_count + $2, 0) WHERE id = $1::uuid', [
        req.params.id,
        like ? 1 : -1,
      ]);
    }
    const { rows } = await c.query('SELECT likes_count FROM videos WHERE id = $1::uuid', [req.params.id]);
    return rows[0].likes_count;
  });
  res.json({ liked: like, likes: result });
}
router.post('/videos/:id/like', requireAuth, wrap((req, res) => setLike(req, res, true)));
router.delete('/videos/:id/like', requireAuth, wrap((req, res) => setLike(req, res, false)));

router.post(
  '/videos/:id/view',
  optionalAuth,
  wrap(async (req, res) => {
    await query("UPDATE videos SET views_count = views_count + 1 WHERE id = $1::uuid AND status = 'active'", [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---- Comments --------------------------------------------------------------
const toComment = (r) => ({
  id: r.id,
  body: r.body,
  createdAt: r.created_at,
  author: { id: r.user_id, username: r.username, displayName: r.display_name || r.username, avatarUrl: r.avatar_url || null },
});

router.get(
  '/videos/:id/comments',
  optionalAuth,
  wrap(async (req, res) => {
    const limit = clampLimit(req.query.limit, 20, 50);
    const cursor = decodeCursor(req.query.cursor);
    const params = [req.params.id, req.user?.id ?? null];
    let sql = `SELECT c.*, u.username, u.display_name, u.avatar_url
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.video_id = $1::uuid AND c.deleted_at IS NULL AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2::uuid AND b.blocked_id = c.user_id) OR (b.blocker_id = c.user_id AND b.blocked_id = $2::uuid))`;
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      sql += ` AND (c.created_at, c.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit + 1);
    sql += ` ORDER BY c.created_at DESC, c.id DESC LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    const page = rows.slice(0, limit);
    res.json({ items: page.map(toComment), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null });
  }),
);

router.post(
  '/videos/:id/comments',
  requireAuth,
  wrap(async (req, res) => {
    const { body } = validate(z.object({ body: z.string().trim().min(1).max(500) }), req.body);
    const comment = await withTx(async (c) => {
      const v = await c.query("SELECT 1 FROM videos WHERE id = $1::uuid AND status = 'active'", [req.params.id]);
      if (!v.rowCount) throw new HttpError(404, 'Video not found', 'not_found');
      const ins = await c.query('INSERT INTO comments (video_id, user_id, body) VALUES ($1::uuid, $2, $3) RETURNING id', [
        req.params.id,
        req.user.id,
        body,
      ]);
      await c.query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = $1::uuid', [req.params.id]);
      const full = await c.query(
        'SELECT c.*, u.username, u.display_name, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1',
        [ins.rows[0].id],
      );
      return full.rows[0];
    });
    res.status(201).json(toComment(comment));
  }),
);

router.delete(
  '/comments/:id',
  requireAuth,
  wrap(async (req, res) => {
    await withTx(async (c) => {
      // The comment's author or the video's owner may delete it.
      const { rows } = await c.query(
        `UPDATE comments SET deleted_at = now()
           WHERE id = $1::uuid AND deleted_at IS NULL
             AND (user_id = $2 OR video_id IN (SELECT id FROM videos WHERE user_id = $2))
           RETURNING video_id`,
        [req.params.id, req.user.id],
      );
      if (!rows.length) throw new HttpError(404, 'Comment not found', 'not_found');
      await c.query('UPDATE videos SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1', [rows[0].video_id]);
    });
    res.json({ ok: true });
  }),
);

export default router;
