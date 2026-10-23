import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../db.js';
import { optionalAuth, publicUser, requireAuth } from '../auth.js';
import { HttpError, decodeCursor, encodeCursor, validate, wrap } from '../util.js';
import { deleteObject, keyBelongsTo, mediaUrl } from '../storage.js';
import { VIDEO_SELECT, clampLimit, toVideo } from './shared.js';

const router = Router();

// ---- Current user ------------------------------------------------------------
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [req.user.id]);
    if (!rows.length) throw new HttpError(401, 'Account not found', 'unauthorized');
    res.json({ ...publicUser(rows[0]), email: rows[0].email });
  }),
);

router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const body = validate(
      z.object({
        displayName: z.string().trim().min(1).max(40).optional(),
        bio: z.string().trim().max(160).optional(),
        avatarKey: z.string().optional(),
      }),
      req.body,
    );
    if (body.avatarKey && !keyBelongsTo(body.avatarKey, req.user.id)) throw new HttpError(403, 'Invalid avatar key', 'bad_key');
    const { rows } = await query(
      `UPDATE users SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio), avatar_url = COALESCE($4, avatar_url)
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [req.user.id, body.displayName ?? null, body.bio ?? null, body.avatarKey ? mediaUrl(body.avatarKey) : null],
    );
    res.json({ ...publicUser(rows[0]), email: rows[0].email });
  }),
);

// Account deletion (required by Apple App Store and Google Play for apps with accounts).
router.delete(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const keys = await withTx(async (c) => {
      const media = await c.query('SELECT video_key, thumb_key FROM videos WHERE user_id = $1', [req.user.id]);
      await c.query('DELETE FROM videos WHERE user_id = $1', [req.user.id]);
      await c.query('UPDATE comments SET deleted_at = now() WHERE user_id = $1 AND deleted_at IS NULL', [req.user.id]);
      await c.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);
      await c.query('DELETE FROM follows WHERE follower_id = $1 OR followee_id = $1', [req.user.id]);
      await c.query('DELETE FROM likes WHERE user_id = $1', [req.user.id]);
      // Free the unique email/username and remove personal data; keep the row so reports stay referentially valid.
      await c.query(
        `UPDATE users SET deleted_at = now(), email = 'deleted+' || id || '@invalid', username = 'deleted_' || substr(id::text, 1, 8),
           password_hash = NULL, google_sub = NULL, display_name = '', bio = '', avatar_url = NULL WHERE id = $1`,
        [req.user.id],
      );
      return media.rows.flatMap((r) => [r.video_key, r.thumb_key]);
    });
    await Promise.all(keys.filter(Boolean).map(deleteObject));
    res.json({ ok: true });
  }),
);

// ---- Profiles --------------------------------------------------------------------
async function findUser(username) {
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1) AND deleted_at IS NULL', [username]);
  if (!rows.length) throw new HttpError(404, 'User not found', 'not_found');
  return rows[0];
}

router.get(
  '/users/:username',
  optionalAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    const viewer = req.user?.id ?? null;
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM follows WHERE followee_id = $1) AS followers,
         (SELECT count(*)::int FROM follows WHERE follower_id = $1) AS following,
         (SELECT coalesce(sum(likes_count), 0)::int FROM videos WHERE user_id = $1 AND status = 'active') AS likes,
         (SELECT count(*)::int FROM videos WHERE user_id = $1 AND status = 'active') AS videos,
         EXISTS (SELECT 1 FROM follows WHERE follower_id = $2::uuid AND followee_id = $1) AS is_following,
         EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $2::uuid AND blocked_id = $1) AS is_blocked`,
      [u.id, viewer],
    );
    const s = rows[0];
    res.json({
      ...publicUser(u),
      stats: { followers: s.followers, following: s.following, likes: s.likes, videos: s.videos },
      isFollowing: s.is_following,
      isBlocked: s.is_blocked,
      isMe: viewer === u.id,
    });
  }),
);

router.get(
  '/users/:username/videos',
  optionalAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    const limit = clampLimit(req.query.limit, 18, 30);
    const cursor = decodeCursor(req.query.cursor);
    const params = [req.user?.id ?? null, u.id];
    let sql = `${VIDEO_SELECT} AND v.user_id = $2`;
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      sql += ` AND (v.created_at, v.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit + 1);
    sql += ` ORDER BY v.created_at DESC, v.id DESC LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    const page = rows.slice(0, limit);
    res.json({ items: page.map(toVideo), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null });
  }),
);

// ---- Follow / block ------------------------------------------------------------------
router.post(
  '/users/:username/follow',
  requireAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    if (u.id === req.user.id) throw new HttpError(400, "You can't follow yourself", 'invalid');
    const blocked = await query(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
      [req.user.id, u.id],
    );
    if (blocked.rowCount) throw new HttpError(403, 'Unable to follow this user', 'blocked');
    await query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, u.id]);
    res.json({ following: true });
  }),
);

router.delete(
  '/users/:username/follow',
  requireAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    await query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [req.user.id, u.id]);
    res.json({ following: false });
  }),
);

router.post(
  '/users/:username/block',
  requireAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    if (u.id === req.user.id) throw new HttpError(400, "You can't block yourself", 'invalid');
    await withTx(async (c) => {
      await c.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, u.id]);
      await c.query('DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)', [
        req.user.id,
        u.id,
      ]);
    });
    res.json({ blocked: true });
  }),
);

router.delete(
  '/users/:username/block',
  requireAuth,
  wrap(async (req, res) => {
    const u = await findUser(req.params.username);
    await query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, u.id]);
    res.json({ blocked: false });
  }),
);

// ---- Search ------------------------------------------------------------------------------
const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

router.get(
  '/search',
  optionalAuth,
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 60);
    if (q.length < 2) return res.json({ users: [], videos: [] });
    const pattern = `%${likeEscape(q)}%`;
    const viewer = req.user?.id ?? null;
    const [users, videos] = await Promise.all([
      query(
        `SELECT * FROM users u WHERE u.deleted_at IS NULL AND (u.username ILIKE $1 OR u.display_name ILIKE $1)
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2::uuid AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2::uuid))
         ORDER BY (lower(u.username) = lower($3)) DESC, u.username LIMIT 15`,
        [pattern, viewer, q],
      ),
      query(`${VIDEO_SELECT} AND v.caption ILIKE $2 ORDER BY v.likes_count DESC, v.created_at DESC LIMIT 18`, [viewer, pattern]),
    ]);
    res.json({ users: users.rows.map(publicUser), videos: videos.rows.map(toVideo) });
  }),
);

export default router;
