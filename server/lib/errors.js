import { installHint } from './deps.js';

/**
 * yt-dlp reports every failure as a non-zero exit and a line of stderr. The UI
 * promises the real reason rather than "extraction failed", so we match the
 * known messages and fall back to the raw tail only when nothing fits.
 *
 * Order matters: several messages begin with "Sign in to confirm", so the more
 * specific age check has to be tested before the bot check.
 */
const RULES = [
  {
    code: 'age_restricted',
    match: [/confirm your age/i, /age.?restricted/i, /inappropriate for some users/i],
    title: 'Age-restricted video',
    detail: 'YouTube will not serve this video without a signed-in account to verify age.',
    hint: 'Export cookies from a logged-in browser session and point YTDLP_COOKIES at the file.',
  },
  {
    code: 'bot_check',
    match: [/confirm you.{0,3}re not a bot/i, /sign in to confirm/i],
    title: 'YouTube asked this machine to verify it is not a bot',
    detail: 'This normally happens on datacenter IPs, or after many requests in a short window.',
    hint: 'Wait a few minutes, or supply cookies via YTDLP_COOKIES.',
  },
  {
    code: 'private',
    match: [/private video/i, /this video is private/i],
    title: 'Private video',
    detail: 'The uploader has restricted this video to invited accounts.',
    hint: null,
  },
  {
    code: 'members_only',
    match: [/members.?only/i, /available to this channel.{0,3}s members/i, /join this channel/i],
    title: 'Members-only video',
    detail: 'This video is behind a channel membership.',
    hint: null,
  },
  {
    code: 'region_blocked',
    // yt-dlp phrases this several ways, e.g. "The uploader has not made this
    // video available in your country" — match on the stable tail, not the lead.
    match: [
      /available in your country/i,
      /blocked it in your country/i,
      /geo.?restrict/i,
      /available from your location/i,
      /not available in your location/i,
    ],
    title: 'Blocked in this region',
    detail: 'The uploader or rightsholder has restricted this video where your connection exits.',
    hint: null,
  },
  {
    code: 'unavailable',
    match: [
      /video unavailable/i,
      /has been removed/i,
      /account associated with this video has been terminated/i,
      /removed by the uploader/i,
      /this video is no longer available/i,
    ],
    title: 'Video unavailable',
    detail: 'It has been removed, made private, or never existed.',
    hint: null,
  },
  {
    code: 'live',
    match: [/live event will begin/i, /premieres in/i, /is live and .*cannot be downloaded/i],
    title: 'Live or scheduled stream',
    detail: 'Audio can only be extracted after the stream has ended and been processed.',
    hint: null,
  },
  {
    code: 'ytdlp_outdated',
    match: [
      /unable to extract/i,
      /nsig extraction failed/i,
      /signature extraction/i,
      /unable to parse/i,
      /player response/i,
      /please report this issue/i,
    ],
    title: 'yt-dlp is out of date',
    detail: 'YouTube changed something yt-dlp does not understand yet. This breaks every video until it is updated.',
    hint: null, // filled in at build time with the platform-correct command
  },
  {
    code: 'rate_limited',
    match: [/http error 429/i, /too many requests/i],
    title: 'Rate limited by YouTube',
    detail: 'Too many requests from this connection.',
    hint: 'Wait a few minutes before trying again.',
  },
  {
    code: 'network',
    match: [
      /unable to download webpage/i,
      /getaddrinfo/i,
      /econnreset/i,
      /etimedout/i,
      /timed out/i,
      /network is unreachable/i,
    ],
    title: 'Network error',
    detail: 'Could not reach YouTube.',
    hint: 'Check your connection and try again.',
  },
  {
    code: 'unsupported',
    match: [/unsupported url/i, /is not a valid url/i],
    title: 'Unsupported URL',
    detail: 'yt-dlp does not recognise this as a YouTube video.',
    hint: null,
  },
];

/** Last few meaningful stderr lines, for the cases we could not classify. */
function stderrTail(stderr, lines = 2) {
  return String(stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('WARNING:'))
    .slice(-lines)
    .join(' ')
    .replace(/^ERROR:\s*/i, '')
    .slice(0, 400);
}

export function classifyYtDlpError(stderr, exitCode) {
  const text = String(stderr || '');

  for (const rule of RULES) {
    if (rule.match.some((re) => re.test(text))) {
      const hint =
        rule.code === 'ytdlp_outdated'
          ? `Update with: ${installHint('yt-dlp') === 'brew install yt-dlp' ? 'brew upgrade yt-dlp' : 'yt-dlp -U'}`
          : rule.hint;

      return {
        code: rule.code,
        title: rule.title,
        detail: rule.detail,
        hint,
        raw: stderrTail(text),
      };
    }
  }

  return {
    code: 'unknown',
    title: 'Extraction failed',
    detail: stderrTail(text) || `yt-dlp exited with code ${exitCode}.`,
    hint: null,
    raw: stderrTail(text, 4),
  };
}

export function ffmpegError(stderr, exitCode) {
  return {
    code: 'encode_failed',
    title: 'Encoding failed',
    detail: stderrTail(stderr) || `ffmpeg exited with code ${exitCode}.`,
    hint: null,
    raw: stderrTail(stderr, 4),
  };
}

export function spawnError(err, bin) {
  if (err && err.code === 'ENOENT') {
    return {
      code: 'missing_binary',
      title: `${bin} is not installed`,
      detail: `${bin} was on PATH when the server started but cannot be found now.`,
      hint: `Install: ${installHint(bin)}`,
      raw: null,
    };
  }
  return {
    code: 'spawn_failed',
    title: `Could not run ${bin}`,
    detail: String(err?.message || err),
    hint: null,
    raw: null,
  };
}
