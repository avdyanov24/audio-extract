import { timingSafeEqual } from 'node:crypto';

/**
 * Everything in this module is inert by default. With no AUTH_TOKEN set and the
 * limits left at their defaults, a local instance behaves exactly as it did
 * before these guards existed. They only bite when the server is exposed.
 */

const AUTH_COOKIE = 'ae_auth';

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const limits = () => ({
  maxConcurrent: num('MAX_CONCURRENT_JOBS', 2),
  maxDurationMinutes: num('MAX_DURATION_MINUTES', 120),
  maxDiskMb: num('MAX_DISK_MB', 2048),
  rateWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
  rateMax: num('RATE_LIMIT_MAX', 20),
});

export const authRequired = () => Boolean(process.env.AUTH_TOKEN);

/** Constant-time compare that tolerates length mismatch without leaking it. */
function tokenMatches(candidate) {
  const expected = process.env.AUTH_TOKEN ?? '';
  if (!expected || typeof candidate !== 'string' || !candidate) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a comparison so the failure cost does not depend on length.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function presentedToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // EventSource cannot set headers, so the SSE route depends on the cookie.
  return readCookie(req.headers.cookie, AUTH_COOKIE);
}

export function requireAuth(req, res, next) {
  if (!authRequired()) return next();
  if (tokenMatches(presentedToken(req))) return next();

  return res.status(401).json({
    error: {
      code: 'unauthorized',
      title: 'Access token required',
      detail: 'This instance is protected. Enter the access token to continue.',
      hint: null,
    },
  });
}

/** Exchange a token for an httpOnly cookie the SSE stream can also use. */
export function handleAuth(req, res) {
  if (!authRequired()) {
    return res.json({ ok: true, authRequired: false });
  }

  if (!tokenMatches(req.body?.token)) {
    return res.status(401).json({
      error: {
        code: 'bad_token',
        title: 'Incorrect access token',
        detail: null,
        hint: null,
      },
    });
  }

  res.setHeader(
    'Set-Cookie',
    [
      `${AUTH_COOKIE}=${encodeURIComponent(process.env.AUTH_TOKEN)}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=604800',
      process.env.COOKIE_SECURE === 'false' ? null : 'Secure',
    ]
      .filter(Boolean)
      .join('; ')
  );

  return res.json({ ok: true, authRequired: true });
}

/**
 * Fixed-window counter keyed by client address. Deliberately in-memory: this
 * runs as a single process, and a dependency-free limiter is easier to reason
 * about than a shared store the deployment does not otherwise need.
 */
const hits = new Map();

export function rateLimit(req, res, next) {
  const { rateWindowMs, rateMax } = limits();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + rateWindowMs });
    return next();
  }

  entry.count += 1;
  if (entry.count > rateMax) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: {
        code: 'rate_limited',
        title: 'Too many requests',
        detail: `Limit is ${rateMax} requests per ${Math.round(rateWindowMs / 1000)} seconds.`,
        hint: `Try again in ${retryAfter} seconds.`,
      },
    });
  }

  return next();
}

/** Drop stale rate-limit entries so the map cannot grow without bound. */
export function sweepRateLimit() {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key);
  }
}

export function checkDuration(seconds) {
  const { maxDurationMinutes } = limits();
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  if (seconds > maxDurationMinutes * 60) {
    return {
      code: 'too_long',
      title: 'Video is too long',
      detail: `This instance accepts sources up to ${maxDurationMinutes} min. This one is ${Math.round(seconds / 60)} min.`,
      hint: null,
    };
  }
  return null;
}

export function checkCapacity({ running, retainedBytes }) {
  const { maxConcurrent, maxDiskMb } = limits();

  if (running >= maxConcurrent) {
    return {
      code: 'busy',
      title: 'Too many extractions in progress',
      detail: `This instance runs at most ${maxConcurrent} at a time.`,
      hint: 'Wait for one to finish and try again.',
    };
  }

  if (retainedBytes >= maxDiskMb * 1024 * 1024) {
    return {
      code: 'disk_full',
      title: 'Storage budget reached',
      detail: `Finished files are holding the full ${maxDiskMb} MB budget.`,
      hint: 'Files are deleted automatically; try again shortly.',
    };
  }

  return null;
}
