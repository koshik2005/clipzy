import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, validate, wrap } from '../util.js';
import {
  checkPassword,
  hashPassword,
  issueTokens,
  publicUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../auth.js';

const router = Router();

const username = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_.]+$/, 'letters, numbers, "_" and "." only');

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username,
  password: z.string().min(8).max(128),
});

async function session(user) {
  return { user: publicUser(user), ...(await issueTokens(user)) };
}

router.post(
  '/register',
  wrap(async (req, res) => {
    const { email, username: name, password } = validate(registerSchema, req.body);
    const hash = await hashPassword(password);
    try {
      const { rows } = await query(
        `INSERT INTO users (email, username, password_hash, display_name) VALUES ($1, $2, $3, $2) RETURNING *`,
        [email, name, hash],
      );
      res.status(201).json(await session(rows[0]));
    } catch (err) {
      if (err.code === '23505') {
        const field = /email/.test(err.constraint || '') ? 'email' : 'username';
        throw new HttpError(409, `That ${field} is already taken`, `${field}_taken`);
      }
      throw err;
    }
  }),
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = validate(z.object({ email: z.string().trim(), password: z.string() }), req.body);
    const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [email]);
    const user = rows[0];
    // Same error for unknown email and wrong password.
    if (!user || !(await checkPassword(password, user.password_hash))) {
      throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
    }
    res.json(await session(user));
  }),
);

let googleClient;
router.post(
  '/google',
  wrap(async (req, res) => {
    if (!config.googleClientIds.length) throw new HttpError(501, 'Google sign-in is not configured', 'google_disabled');
    const { idToken } = validate(z.object({ idToken: z.string().min(20) }), req.body);
    googleClient ??= new OAuth2Client();
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: config.googleClientIds });
      payload = ticket.getPayload();
    } catch {
      throw new HttpError(401, 'Invalid Google token', 'bad_google_token');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new HttpError(401, 'Google account email is not verified', 'bad_google_token');
    }

    let { rows } = await query('SELECT * FROM users WHERE google_sub = $1 AND deleted_at IS NULL', [payload.sub]);
    if (!rows.length) {
      // Link to an existing account with the same verified email, otherwise create one.
      rows = (
        await query(
          'UPDATE users SET google_sub = $1 WHERE lower(email) = lower($2) AND deleted_at IS NULL AND google_sub IS NULL RETURNING *',
          [payload.sub, payload.email],
        )
      ).rows;
    }
    if (!rows.length) {
      const base = (payload.email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 18) || 'user';
      for (let i = 0; i < 5 && !rows.length; i++) {
        const candidate = i === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          rows = (
            await query(
              `INSERT INTO users (email, username, google_sub, display_name, avatar_url)
               VALUES ($1, $2, $3, $4, $5) RETURNING *`,
              [payload.email, candidate, payload.sub, payload.name || candidate, payload.picture || null],
            )
          ).rows;
        } catch (err) {
          if (err.code !== '23505') throw err;
          if (/email/.test(err.constraint || '')) throw new HttpError(409, 'Email already registered', 'email_taken');
        }
      }
      if (!rows.length) throw new HttpError(500, 'Could not create account', 'signup_failed');
    }
    res.json(await session(rows[0]));
  }),
);

router.post(
  '/refresh',
  wrap(async (req, res) => {
    const { refreshToken } = validate(z.object({ refreshToken: z.string().min(20) }), req.body);
    const { user, token, refreshToken: next } = await rotateRefreshToken(refreshToken);
    res.json({ user: publicUser(user), token, refreshToken: next });
  }),
);

router.post(
  '/logout',
  wrap(async (req, res) => {
    const { refreshToken } = validate(z.object({ refreshToken: z.string().optional() }), req.body ?? {});
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ ok: true });
  }),
);

export default router;
