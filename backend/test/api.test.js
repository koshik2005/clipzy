// End-to-end test against a real Postgres.
//   TEST_DATABASE_URL=postgres://user@localhost:5432/clipzy_test npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://pgtest@localhost:5433/clipzy_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'local';
process.env.ADMIN_API_KEY = 'admin-key-for-tests';
process.chdir(os.tmpdir() + path.sep); // keep ./uploads out of the repo

const { createApp } = await import('../src/app.js');
const { migrate } = await import('../src/migrate.js');
const { pool } = await import('../src/db.js');

let server;
let base;
const suffix = Math.random().toString(36).slice(2, 8);

async function api(method, url, { token, body, raw, headers } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

test.before(async () => {
  await migrate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await pool.end();
});

const ctx = {};
// The API reports URLs using PUBLIC_BASE_URL; the test server listens on a random port.
const local = (url) => url.replace(/^https?:\/\/[^/]+/, base);

test('register, duplicate, login, me', async () => {
  const a = await api('POST', '/auth/register', {
    body: { email: `alice_${suffix}@example.com`, username: `alice_${suffix}`, password: 'password123' },
  });
  assert.equal(a.status, 201);
  assert.ok(a.body.token && a.body.refreshToken);
  ctx.a = a.body;

  const b = await api('POST', '/auth/register', {
    body: { email: `bob_${suffix}@example.com`, username: `bob_${suffix}`, password: 'password123' },
  });
  ctx.b = b.body;

  const dup = await api('POST', '/auth/register', {
    body: { email: `ALICE_${suffix}@example.com`, username: `x_${suffix}`, password: 'password123' },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'email_taken');

  const bad = await api('POST', '/auth/login', { body: { email: `alice_${suffix}@example.com`, password: 'wrong-password' } });
  assert.equal(bad.status, 401);

  const ok = await api('POST', '/auth/login', { body: { email: `alice_${suffix}@example.com`, password: 'password123' } });
  assert.equal(ok.status, 200);

  const me = await api('GET', '/me', { token: ctx.a.token });
  assert.equal(me.body.username, `alice_${suffix}`);
  assert.equal((await api('GET', '/me')).status, 401);
});

test('refresh token rotates and old one is revoked', async () => {
  const r1 = await api('POST', '/auth/refresh', { body: { refreshToken: ctx.a.refreshToken } });
  assert.equal(r1.status, 200);
  const replay = await api('POST', '/auth/refresh', { body: { refreshToken: ctx.a.refreshToken } });
  assert.equal(replay.status, 401);
  ctx.a.token = r1.body.token;
});

test('upload + publish video, feed, like, comment', async () => {
  const sign = await api('POST', '/uploads/sign', {
    token: ctx.a.token,
    body: { kind: 'video', contentType: 'video/mp4', sizeBytes: 1000 },
  });
  assert.equal(sign.status, 200);

  const badType = await api('POST', '/uploads/sign', {
    token: ctx.a.token,
    body: { kind: 'video', contentType: 'application/pdf', sizeBytes: 1000 },
  });
  assert.equal(badType.status, 400);

  // publishing before the file exists must fail
  const early = await api('POST', '/videos', { token: ctx.a.token, body: { videoKey: sign.body.key, caption: 'hi' } });
  assert.equal(early.status, 400);

  const put = await fetch(local(sign.body.uploadUrl), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ctx.a.token}`, 'Content-Type': 'video/mp4' },
    body: Buffer.alloc(1000, 1),
  });
  assert.equal(put.status, 200);

  // another user cannot publish a key they don't own
  const steal = await api('POST', '/videos', { token: ctx.b.token, body: { videoKey: sign.body.key } });
  assert.equal(steal.status, 403);

  const created = await api('POST', '/videos', {
    token: ctx.a.token,
    body: { videoKey: sign.body.key, caption: `my first #clip ${suffix}`, durationMs: 5000 },
  });
  assert.equal(created.status, 201);
  ctx.video = created.body;
  assert.match(created.body.videoUrl, /\/media\/u\//);

  const media = await fetch(local(created.body.videoUrl));
  assert.equal(media.status, 200);

  const feed = await api('GET', '/feed?limit=5', { token: ctx.b.token });
  assert.ok(feed.body.items.some((v) => v.id === ctx.video.id));

  const like = await api('POST', `/videos/${ctx.video.id}/like`, { token: ctx.b.token });
  assert.deepEqual(like.body, { liked: true, likes: 1 });
  const like2 = await api('POST', `/videos/${ctx.video.id}/like`, { token: ctx.b.token });
  assert.equal(like2.body.likes, 1, 'liking twice must not double count');
  const seen = await api('GET', `/videos/${ctx.video.id}`, { token: ctx.b.token });
  assert.equal(seen.body.liked, true);
  const unlike = await api('DELETE', `/videos/${ctx.video.id}/like`, { token: ctx.b.token });
  assert.equal(unlike.body.likes, 0);

  const c = await api('POST', `/videos/${ctx.video.id}/comments`, { token: ctx.b.token, body: { body: 'nice!' } });
  assert.equal(c.status, 201);
  ctx.comment = c.body;
  const list = await api('GET', `/videos/${ctx.video.id}/comments`);
  assert.equal(list.body.items.length, 1);
  assert.equal((await api('GET', `/videos/${ctx.video.id}`)).body.comments, 1);
  assert.equal((await api('POST', `/videos/${ctx.video.id}/comments`, { token: ctx.b.token, body: { body: '   ' } })).status, 400);
});

test('feed pagination is stable', async () => {
  for (let i = 0; i < 3; i++) {
    const s = await api('POST', '/uploads/sign', { token: ctx.a.token, body: { kind: 'video', contentType: 'video/mp4', sizeBytes: 10 } });
    await fetch(local(s.body.uploadUrl), { method: 'PUT', headers: { Authorization: `Bearer ${ctx.a.token}` }, body: Buffer.alloc(10) });
    await api('POST', '/videos', { token: ctx.a.token, body: { videoKey: s.body.key, caption: `p${i}` } });
  }
  const seen = new Set();
  let cursor = '';
  let pages = 0;
  do {
    const r = await api('GET', `/users/alice_${suffix}/videos?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    for (const v of r.body.items) {
      assert.ok(!seen.has(v.id), 'no duplicates across pages');
      seen.add(v.id);
    }
    cursor = r.body.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  assert.equal(seen.size, 4);
  assert.ok(pages >= 2);
});

test('follow, following feed, profile stats, search', async () => {
  assert.equal((await api('POST', `/users/alice_${suffix}/follow`, { token: ctx.b.token })).status, 200);
  assert.equal((await api('POST', `/users/bob_${suffix}/follow`, { token: ctx.b.token })).status, 400);
  const following = await api('GET', '/feed?tab=following', { token: ctx.b.token });
  assert.ok(following.body.items.length >= 1);
  assert.equal((await api('GET', '/feed?tab=following')).status, 401);

  const prof = await api('GET', `/users/alice_${suffix}`, { token: ctx.b.token });
  assert.equal(prof.body.stats.followers, 1);
  assert.equal(prof.body.isFollowing, true);

  const s = await api('GET', `/search?q=${suffix}`);
  assert.ok(s.body.users.length >= 2);
  assert.ok(s.body.videos.length >= 1);
  assert.deepEqual((await api('GET', '/search?q=%25')).body.users.length, 0);
});

test('profile edit', async () => {
  const r = await api('PATCH', '/me', { token: ctx.a.token, body: { displayName: 'Alice A', bio: 'hello' } });
  assert.equal(r.body.displayName, 'Alice A');
  assert.equal((await api('PATCH', '/me', { token: ctx.a.token, body: { avatarKey: 'u/someone-else/avatar/x.jpg' } })).status, 403);
});

test('report, admin moderation, block', async () => {
  const rep = await api('POST', '/reports', {
    token: ctx.b.token,
    body: { targetType: 'video', targetId: ctx.video.id, reason: 'spam' },
  });
  assert.equal(rep.status, 201);
  assert.equal((await api('GET', '/admin/reports')).status, 403);
  const q = await api('GET', '/admin/reports', { headers: { 'x-admin-key': 'admin-key-for-tests' } });
  const mine = q.body.items.find((r) => r.target_id === ctx.video.id);
  assert.ok(mine);
  const res = await api('POST', `/admin/reports/${mine.id}/resolve`, {
    body: { action: 'hide_content' },
    headers: { 'x-admin-key': 'admin-key-for-tests' },
  });
  assert.equal(res.status, 200);
  assert.equal((await api('GET', `/videos/${ctx.video.id}`)).status, 404, 'hidden video is not served');

  assert.equal((await api('POST', `/users/alice_${suffix}/block`, { token: ctx.b.token })).status, 200);
  const feed = await api('GET', '/feed?limit=30', { token: ctx.b.token });
  assert.ok(!feed.body.items.some((v) => v.author.username === `alice_${suffix}`), 'blocked users disappear from feed');
  assert.equal((await api('POST', `/users/alice_${suffix}/follow`, { token: ctx.b.token })).status, 403);
  await api('DELETE', `/users/alice_${suffix}/block`, { token: ctx.b.token });
});

test('delete comment and delete account', async () => {
  const del = await api('DELETE', `/comments/${ctx.comment.id}`, { token: ctx.b.token });
  assert.equal(del.status, 200);

  const gone = await api('DELETE', '/me', { token: ctx.a.token });
  assert.equal(gone.status, 200);
  const login = await api('POST', '/auth/login', { body: { email: `alice_${suffix}@example.com`, password: 'password123' } });
  assert.equal(login.status, 401);
  const reuse = await api('POST', '/auth/register', {
    body: { email: `alice_${suffix}@example.com`, username: `alice_${suffix}`, password: 'password123' },
  });
  assert.equal(reuse.status, 201, 'email and username are freed after deletion');
});

test('google sign-in disabled without config, health, 404 json', async () => {
  assert.equal((await api('POST', '/auth/google', { body: { idToken: 'x'.repeat(30) } })).status, 501);
  assert.equal((await api('GET', '/health')).body.ok, true);
  const nf = await api('GET', '/nope');
  assert.equal(nf.status, 404);
  assert.equal((await api('GET', '/privacy')).status, 200);
});
