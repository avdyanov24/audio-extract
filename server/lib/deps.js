import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// yt-dlp releases are dated (2025.06.09). Anything older than this many days is
// very likely to fail on signature extraction, so we say so before it breaks.
const STALE_AFTER_DAYS = 60;

const INSTALL = {
  darwin: {
    'yt-dlp': 'brew install yt-dlp',
    ffmpeg: 'brew install ffmpeg',
  },
  linux: {
    'yt-dlp': 'sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp',
    ffmpeg: 'sudo apt install ffmpeg    # or: sudo dnf install ffmpeg',
  },
  win32: {
    'yt-dlp': 'winget install yt-dlp',
    ffmpeg: 'winget install Gyan.FFmpeg',
  },
};

async function probe(bin, args) {
  try {
    const { stdout } = await run(bin, args, { timeout: 15000 });
    return { ok: true, version: stdout.trim().split('\n')[0] };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'broken', detail: String(err.stderr || err.message).trim() };
  }
}

function ytDlpAgeDays(version) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(version || '');
  if (!m) return null;
  const released = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - released) / 86400000);
}

export async function checkDependencies() {
  const [ytdlp, ffmpeg] = await Promise.all([
    probe('yt-dlp', ['--version']),
    probe('ffmpeg', ['-version']),
  ]);

  const ffmpegVersion = ffmpeg.ok
    ? (/ffmpeg version (\S+)/.exec(ffmpeg.version)?.[1] ?? ffmpeg.version)
    : null;

  return {
    ytdlp: { ...ytdlp, ageDays: ytdlp.ok ? ytDlpAgeDays(ytdlp.version) : null },
    ffmpeg: { ...ffmpeg, version: ffmpegVersion },
  };
}

/**
 * Verify both binaries before the server accepts any traffic. Missing tools are
 * a setup problem, not a runtime error, so we print the fix and exit instead of
 * letting every request fail with the same stack trace.
 */
export async function requireDependencies() {
  const status = await checkDependencies();
  const platform = INSTALL[process.platform] ? process.platform : 'linux';
  const missing = [];

  if (!status.ytdlp.ok) missing.push(['yt-dlp', status.ytdlp]);
  if (!status.ffmpeg.ok) missing.push(['ffmpeg', status.ffmpeg]);

  if (missing.length) {
    process.stderr.write('\n  audio-extract cannot start.\n\n');
    for (const [name, info] of missing) {
      if (info.reason === 'missing') {
        process.stderr.write(`  ${name} is not installed or not on PATH.\n`);
      } else {
        process.stderr.write(`  ${name} is installed but failed to run.\n`);
        if (info.detail) process.stderr.write(`    ${info.detail.split('\n')[0]}\n`);
      }
      process.stderr.write(`    Install:  ${INSTALL[platform][name]}\n\n`);
    }
    process.stderr.write('  Then start again with: npm run dev\n\n');
    process.exit(1);
  }

  if (status.ytdlp.ageDays != null && status.ytdlp.ageDays > STALE_AFTER_DAYS) {
    process.stderr.write(
      `\n  Warning: yt-dlp ${status.ytdlp.version} is ${status.ytdlp.ageDays} days old.\n` +
      `  YouTube changes break old versions. Update with: ${INSTALL[platform]['yt-dlp'] === 'brew install yt-dlp' ? 'brew upgrade yt-dlp' : 'yt-dlp -U'}\n\n`
    );
  }

  return status;
}

export function installHint(name) {
  const platform = INSTALL[process.platform] ? process.platform : 'linux';
  return INSTALL[platform][name];
}
