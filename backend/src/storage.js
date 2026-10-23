import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { HttpError } from './util.js';

export const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

const TYPES = {
  video: { 'video/mp4': 'mp4', 'video/quicktime': 'mov' },
  thumb: { 'image/jpeg': 'jpg', 'image/png': 'png' },
  avatar: { 'image/jpeg': 'jpg', 'image/png': 'png' },
};
const LIMITS = { video: config.maxUploadBytes, thumb: 5 * 1024 * 1024, avatar: 5 * 1024 * 1024 };

let s3;
function client() {
  s3 ??= new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

export function mediaUrl(key) {
  if (!key) return null;
  const base = config.MEDIA_BASE_URL || `${config.PUBLIC_BASE_URL}/media`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

// Keys are namespaced by owner so one user can never reference another user's object.
export const keyBelongsTo = (key, userId) =>
  typeof key === 'string' && key.startsWith(`u/${userId}/`) && !key.includes('..');

export async function createUploadTarget({ kind, contentType, sizeBytes, userId }) {
  const ext = TYPES[kind]?.[contentType];
  if (!ext) throw new HttpError(400, `Unsupported content type for ${kind}: ${contentType}`, 'bad_content_type');
  if (sizeBytes > LIMITS[kind]) {
    throw new HttpError(413, `File too large (max ${Math.round(LIMITS[kind] / 1048576)} MB)`, 'too_large');
  }
  const key = `u/${userId}/${kind}/${crypto.randomUUID()}.${ext}`;
  if (config.STORAGE_DRIVER === 'local') {
    return { key, uploadUrl: `${config.PUBLIC_BASE_URL}/uploads/local/${key}`, headers: { 'Content-Type': contentType }, authRequired: true };
  }
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 900 },
  );
  return { key, uploadUrl, headers: { 'Content-Type': contentType }, authRequired: false };
}

export async function objectSize(key) {
  if (config.STORAGE_DRIVER === 'local') {
    try {
      return (await fs.stat(path.join(LOCAL_DIR, key))).size;
    } catch {
      return null;
    }
  }
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(key) {
  if (!key) return;
  try {
    if (config.STORAGE_DRIVER === 'local') await fs.rm(path.join(LOCAL_DIR, key), { force: true });
    else await client().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  } catch (err) {
    console.error('deleteObject failed', key, err.message);
  }
}
