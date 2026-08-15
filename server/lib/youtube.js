const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const PATH_FORMS = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/;

// Reserved on Windows, and confusing everywhere else.
const RESERVED_CHARS = /[/\\?%*:|"<>]/g;

/**
 * Drop control characters, which are illegal in filenames on every platform we
 * target. Done by code point rather than a regex literal so the source stays
 * free of raw control bytes.
 */
function stripControlChars(value) {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) out += ch;
  }
  return out;
}

/**
 * Accepts only real YouTube video URLs and reduces them to a canonical watch
 * URL. Everything reaching yt-dlp is rebuilt from a validated 11-char id, so a
 * hostile string cannot survive as an argument.
 */
export function parseYouTubeUrl(input) {
  if (typeof input !== 'string') return null;

  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id = null;
  if (host.endsWith('youtu.be')) {
    id = url.pathname.slice(1).split('/')[0];
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    id = PATH_FORMS.exec(url.pathname)?.[1] ?? null;
  }

  if (!id || !VIDEO_ID.test(id)) return null;

  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Strip characters that are unsafe in a filename while keeping it readable. */
export function safeFilename(title, ext) {
  const base = stripControlChars(String(title || 'audio'))
    .replace(RESERVED_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/, '');

  return `${base || 'audio'}.${ext}`;
}
