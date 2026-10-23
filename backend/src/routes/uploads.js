import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { HttpError, validate, wrap } from '../util.js';
import { LOCAL_DIR, createUploadTarget, keyBelongsTo } from '../storage.js';

const router = Router();

router.post(
  '/sign',
  requireAuth,
  wrap(async (req, res) => {
    const body = validate(
      z.object({
        kind: z.enum(['video', 'thumb', 'avatar']),
        contentType: z.string(),
        sizeBytes: z.number().int().positive(),
      }),
      req.body,
    );
    res.json(await createUploadTarget({ ...body, userId: req.user.id }));
  }),
);

// Development-only upload sink used when STORAGE_DRIVER=local.
router.put('/local/*key', requireAuth, async (req, res, next) => {
  try {
    if (config.STORAGE_DRIVER !== 'local') throw new HttpError(404, 'Not found');
    const key = [].concat(req.params.key).join('/');
    if (!keyBelongsTo(key, req.user.id) || !/\.(mp4|mov|jpg|png)$/.test(key)) {
      throw new HttpError(403, 'Invalid upload key', 'bad_key');
    }
    const dest = path.join(LOCAL_DIR, key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const limit = key.includes('/video/') ? config.maxUploadBytes : 5 * 1024 * 1024;
    let size = 0;
    const out = fs.createWriteStream(dest);
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        out.destroy();
        fsp.rm(dest, { force: true });
      }
    });
    req.pipe(out);
    out.on('finish', () => res.json({ ok: true, size }));
    out.on('error', next);
    req.on('error', () => out.destroy());
  } catch (err) {
    next(err);
  }
});

export default router;
