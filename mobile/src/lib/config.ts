export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const MAX_VIDEO_SECONDS = Number(process.env.EXPO_PUBLIC_MAX_VIDEO_SECONDS ?? 180);
