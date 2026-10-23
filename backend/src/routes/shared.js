import { mediaUrl } from '../storage.js';

// Shared SELECT for videos as seen by a viewer ($1 = viewer id or NULL).
// Hides hidden videos, deleted authors, and anything involving a block in either direction.
export const VIDEO_SELECT = `
  SELECT v.*, u.username, u.display_name, u.avatar_url,
    EXISTS (SELECT 1 FROM likes l WHERE l.video_id = v.id AND l.user_id = $1::uuid) AS liked,
    EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1::uuid AND f.followee_id = v.user_id) AS following
  FROM videos v
  JOIN users u ON u.id = v.user_id
  WHERE v.status = 'active'
    AND u.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = $1::uuid AND b.blocked_id = v.user_id)
         OR (b.blocker_id = v.user_id AND b.blocked_id = $1::uuid)
    )`;

export function toVideo(r) {
  return {
    id: r.id,
    videoUrl: mediaUrl(r.video_key),
    thumbUrl: mediaUrl(r.thumb_key),
    caption: r.caption,
    durationMs: r.duration_ms,
    likes: r.likes_count,
    comments: r.comments_count,
    views: r.views_count,
    createdAt: r.created_at,
    liked: !!r.liked,
    author: {
      id: r.user_id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: r.avatar_url || null,
      following: !!r.following,
    },
  };
}

export const clampLimit = (v, def = 10, max = 30) => Math.min(Math.max(parseInt(v, 10) || def, 1), max);
