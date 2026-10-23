export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function validate(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg, 'validation_error');
  }
  return r.data;
}

// Keyset pagination cursor: base64url("<iso timestamp>|<id>")
export function encodeCursor(row) {
  return Buffer.from(`${new Date(row.created_at).toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!ts || !id || Number.isNaN(Date.parse(ts))) throw new Error('bad');
    return { ts, id };
  } catch {
    throw new HttpError(400, 'Invalid cursor', 'bad_cursor');
  }
}
