import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db:5432/clipzy',
  JWT_SECRET: 'test-only-secret-value-long-enough-for-config',
};

function loadConfig(overrides) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config.js')"], {
    cwd: backendDir,
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv, ...overrides },
  });
}

test('production rejects local storage, a weak admin key, and HTTP URLs', () => {
  const result = loadConfig({
    PUBLIC_BASE_URL: 'http://api.example.com',
    STORAGE_DRIVER: 'local',
    ADMIN_API_KEY: 'short',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /STORAGE_DRIVER must be s3/);
  assert.match(result.stderr, /ADMIN_API_KEY must be at least 32 characters/);
  assert.match(result.stderr, /PUBLIC_BASE_URL must use HTTPS/);
});

test('production accepts HTTPS, S3, and an admin key', () => {
  const result = loadConfig({
    PUBLIC_BASE_URL: 'https://api.example.com',
    STORAGE_DRIVER: 's3',
    ADMIN_API_KEY: 'a-long-enough-admin-key-with-32-plus-characters',
    S3_BUCKET: 'clipzy',
    S3_ACCESS_KEY_ID: 'access',
    S3_SECRET_ACCESS_KEY: 'secret',
    MEDIA_BASE_URL: 'https://cdn.example.com',
  });

  assert.equal(result.status, 0, result.stderr);
});