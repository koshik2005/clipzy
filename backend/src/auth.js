import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError, wrap } from './util.js';

export const hashPassword = (pw) => bcrypt.hash(pw, 11);
export const checkPassword = (pw, hash) => (hash ? bcrypt.compare(pw, hash) : Promise.resolve(false));

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    bio: u.bio || '',
    avatarUrl: u.avatar_url || null,
  };
}

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.ACCESS_TOKEN_TTL,
    issuer: 'clipzy-api',
  });
}

export async function issueTokens(user) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86400_000);
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    user.id,
    sha256(refreshToken),
    expires,
  ]);
  return { token: signAccessToken(user), refreshToken };
}

// Rotates: the presented refresh token is revoked and a new pair is returned.
export async function rotateRefreshToken(refreshToken) {
  const { rows } = await query(
    `UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING user_id`,
    [sha256(refreshToken)],
  );
  if (!rows.length) throw new HttpError(401, 'Invalid refresh token', 'invalid_refresh');
  const u = await query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [rows[0].user_id]);
  if (!u.rows.length) throw new HttpError(401, 'Account not found', 'invalid_refresh');
  return { user: u.rows[0], ...(await issueTokens(u.rows[0])) };
}

export const revokeRefreshToken = (refreshToken) =>
  query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    sha256(refreshToken),
  ]);

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function decode(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET, { issuer: 'clipzy-api' });
  } catch {
    return null;
  }
}

export const requireAuth = wrap(async (req, _res, next) => {
  const token = readToken(req);
  const payload = token && decode(token);
  if (!payload) throw new HttpError(401, 'Authentication required', 'unauthorized');
  req.user = { id: payload.sub, role: payload.role };
  next();
});

export const optionalAuth = (req, _res, next) => {
  const token = readToken(req);
  const payload = token && decode(token);
  req.user = payload ? { id: payload.sub, role: payload.role } : null;
  next();
};

export function requireAdmin(req, _res, next) {
  const key = req.headers['x-admin-key'];
  const expected = config.ADMIN_API_KEY;
  const ok =
    expected &&
    typeof key === 'string' &&
    key.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return next(new HttpError(403, 'Admin access required', 'forbidden'));
  next();
}
