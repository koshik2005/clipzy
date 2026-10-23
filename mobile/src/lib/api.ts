import { API_URL } from './config';

export type Author = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  following?: boolean;
};

export type Video = {
  id: string;
  videoUrl: string;
  thumbUrl: string | null;
  caption: string;
  durationMs: number;
  likes: number;
  comments: number;
  views: number;
  createdAt: string;
  liked: boolean;
  author: Author & { following: boolean };
};

export type Comment = { id: string; body: string; createdAt: string; author: Author };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type User = { id: string; username: string; displayName: string; bio: string; avatarUrl: string | null; email?: string };
export type Profile = User & {
  stats: { followers: number; following: number; likes: number; videos: number };
  isFollowing: boolean;
  isBlocked: boolean;
  isMe: boolean;
};
export type Session = { user: User; token: string; refreshToken: string };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ---- Token plumbing (set by AuthProvider) ----------------------------------
type Tokens = { token: string; refreshToken: string };
let tokens: Tokens | null = null;
let onTokens: (t: Tokens | null) => void = () => {};

export function configureAuth(initial: Tokens | null, onChange: (t: Tokens | null) => void) {
  tokens = initial;
  onTokens = onChange;
}
export function setTokens(t: Tokens | null) {
  tokens = t;
}

let refreshing: Promise<boolean> | null = null;
function refreshTokens(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens!.refreshToken }),
      });
      if (!res.ok) throw new Error('refresh failed');
      const data = (await res.json()) as Session;
      tokens = { token: data.token, refreshToken: data.refreshToken };
      onTokens(tokens);
      return true;
    } catch {
      tokens = null;
      onTokens(null); // signs the user out
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(tokens ? { Authorization: `Bearer ${tokens.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.', 'network');
  }
  if (res.status === 401 && tokens && retry && !path.startsWith('/auth/')) {
    if (await refreshTokens()) return request<T>(method, path, body, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  return data as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return p ? `?${p}` : '';
};

export const api = {
  // auth
  register: (b: { email: string; username: string; password: string }) => request<Session>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => request<Session>('POST', '/auth/login', b),
  google: (idToken: string) => request<Session>('POST', '/auth/google', { idToken }),
  logout: (refreshToken: string) => request<{ ok: boolean }>('POST', '/auth/logout', { refreshToken }),

  // me
  me: () => request<User>('GET', '/me'),
  updateMe: (b: { displayName?: string; bio?: string; avatarKey?: string }) => request<User>('PATCH', '/me', b),
  deleteMe: () => request<{ ok: boolean }>('DELETE', '/me'),

  // videos
  feed: (tab: 'foryou' | 'following', cursor?: string | null) => request<Page<Video>>('GET', `/feed${qs({ tab, cursor, limit: 8 })}`),
  video: (id: string) => request<Video>('GET', `/videos/${id}`),
  createVideo: (b: { videoKey: string; thumbKey?: string; caption: string; durationMs: number }) => request<Video>('POST', '/videos', b),
  deleteVideo: (id: string) => request<{ ok: boolean }>('DELETE', `/videos/${id}`),
  like: (id: string) => request<{ liked: boolean; likes: number }>('POST', `/videos/${id}/like`),
  unlike: (id: string) => request<{ liked: boolean; likes: number }>('DELETE', `/videos/${id}/like`),
  view: (id: string) => request<{ ok: boolean }>('POST', `/videos/${id}/view`).catch(() => undefined),

  // comments
  comments: (id: string, cursor?: string | null) => request<Page<Comment>>('GET', `/videos/${id}/comments${qs({ cursor })}`),
  addComment: (id: string, body: string) => request<Comment>('POST', `/videos/${id}/comments`, { body }),
  deleteComment: (id: string) => request<{ ok: boolean }>('DELETE', `/comments/${id}`),

  // users
  profile: (username: string) => request<Profile>('GET', `/users/${encodeURIComponent(username)}`),
  userVideos: (username: string, cursor?: string | null) =>
    request<Page<Video>>('GET', `/users/${encodeURIComponent(username)}/videos${qs({ cursor })}`),
  follow: (username: string) => request<{ following: boolean }>('POST', `/users/${encodeURIComponent(username)}/follow`),
  unfollow: (username: string) => request<{ following: boolean }>('DELETE', `/users/${encodeURIComponent(username)}/follow`),
  block: (username: string) => request<{ blocked: boolean }>('POST', `/users/${encodeURIComponent(username)}/block`),
  unblock: (username: string) => request<{ blocked: boolean }>('DELETE', `/users/${encodeURIComponent(username)}/block`),
  search: (q: string) => request<{ users: User[]; videos: Video[] }>('GET', `/search${qs({ q })}`),

  // moderation
  report: (b: { targetType: 'video' | 'comment' | 'user'; targetId: string; reason: string; details?: string }) =>
    request<{ ok: boolean }>('POST', '/reports', b),

  // uploads
  signUpload: (b: { kind: 'video' | 'thumb' | 'avatar'; contentType: string; sizeBytes: number }) =>
    request<{ key: string; uploadUrl: string; headers: Record<string, string>; authRequired: boolean }>('POST', '/uploads/sign', b),
};

/**
 * Uploads a local file (file:// uri) straight to object storage using a signed URL.
 * Returns the storage key to pass to createVideo / updateMe.
 */
export async function uploadFile(
  kind: 'video' | 'thumb' | 'avatar',
  uri: string,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const target = await api.signUpload({ kind, contentType, sizeBytes: blob.size });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    if (target.authRequired && tokens) xhr.setRequestHeader('Authorization', `Bearer ${tokens.token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'Upload failed')));
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.'));
    xhr.send(blob);
  });
  return target.key;
}
