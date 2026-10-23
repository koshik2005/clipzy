import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: bool,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('30m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(30),

  // Google sign-in is optional. Comma-separated OAuth client IDs (web, iOS, Android).
  GOOGLE_CLIENT_IDS: z.string().default(''),

  // Storage: "local" (dev only) or "s3" (AWS S3, Cloudflare R2, Backblaze B2, MinIO...)
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  // Public/CDN base URL that serves objects (e.g. https://cdn.example.com)
  MEDIA_BASE_URL: z.string().optional(),

  MAX_UPLOAD_MB: z.coerce.number().default(100),
  MAX_VIDEO_SECONDS: z.coerce.number().default(180),

  CORS_ORIGINS: z.string().default('*'),
  ADMIN_API_KEY: z.string().optional(),

  // Used on the privacy/terms/support pages required by the app stores
  COMPANY_NAME: z.string().default('Your Company'),
  SUPPORT_EMAIL: z.string().default('support@example.com'),
  APP_NAME: z.string().default('Clipzy'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${msg}`);
  process.exit(1);
}

const env = parsed.data;

if (env.STORAGE_DRIVER === 's3') {
  const missing = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_BASE_URL'].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`);
    process.exit(1);
  }
}
if (env.NODE_ENV === 'production') {
  const productionIssues = [];
  if (env.STORAGE_DRIVER !== 's3') productionIssues.push('STORAGE_DRIVER must be s3');
  if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.length < 32) {
    productionIssues.push('ADMIN_API_KEY must be at least 32 characters');
  }
  if (new URL(env.PUBLIC_BASE_URL).protocol !== 'https:') productionIssues.push('PUBLIC_BASE_URL must use HTTPS');
  if (productionIssues.length) {
    console.error(`Invalid production configuration:\n${productionIssues.map((issue) => `  - ${issue}`).join('\n')}`);
    process.exit(1);
  }
}

export const config = {
  ...env,
  googleClientIds: env.GOOGLE_CLIENT_IDS.split(',').map((s) => s.trim()).filter(Boolean),
  corsOrigins: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  isProd: env.NODE_ENV === 'production',
};
