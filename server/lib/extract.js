import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyYtDlpError, ffmpegError, spawnError } from './errors.js';

const INFO_TIMEOUT_MS = 90_000;

/** Progress line: "[download]   4.2% of ~ 3.52MiB at 1.20MiB/s ETA 00:02" */
const DOWNLOAD_LINE =
  /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*[KMGT]?i?B)?(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/i;

function cookieArgs() {
  const file = process.env.YTDLP_COOKIES;
  return file ? ['--cookies', file] : [];
}

function unknown(value) {
  return !value || /unknown/i.test(value) ? null : value;
}

/** Read the single audio file yt-dlp just wrote into an otherwise empty dir. */
async function findDownloaded(dir) {
  const entries = await fs.readdir(dir);
  const source = entries.find((name) => name.startsWith('source.'));
  if (!source) throw new Error('yt-dlp reported success but wrote no file');
  return path.join(dir, source);
}

export function fetchInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--skip-download',
      ...cookieArgs(),
      url,
    ];

    let child;
    try {
      child = spawn('yt-dlp', args, { windowsHide: true });
    } catch (err) {
      return reject(spawnError(err, 'yt-dlp'));
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      reject({
        code: 'timeout',
        title: 'yt-dlp timed out',
        detail: 'No response after 90 seconds.',
        hint: 'Check your connection and try again.',
        raw: null,
      });
    }, INFO_TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(spawnError(err, 'yt-dlp'));
    });
    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) return reject(classifyYtDlpError(stderr, code));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject({
          code: 'bad_json',
          title: 'Could not read video metadata',
          detail: 'yt-dlp returned output that was not valid JSON.',
          hint: null,
          raw: stdout.slice(0, 200),
        });
      }
    });
  });
}

/** Audio-only formats, best bitrate first. */
export function audioFormats(info) {
  return (info.formats || [])
    .filter((f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
    .map((f) => ({
      id: f.format_id,
      ext: f.ext,
      abr: f.abr ? Math.round(f.abr) : null,
      acodec: String(f.acodec).split('.')[0],
      filesize: f.filesize ?? f.filesize_approx ?? null,
    }))
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));
}

/** Reduce yt-dlp's very large JSON to what the UI actually renders. */
export function summarise(info) {
  return {
    id: info.id,
    title: info.title,
    uploader: info.uploader || info.channel || null,
    duration: info.duration ?? null,
    thumbnail: info.thumbnail ?? null,
    viewCount: info.view_count ?? null,
    uploadDate: info.upload_date ?? null,
    isLive: Boolean(info.is_live),
    formats: audioFormats(info),
  };
}

export function downloadAudio(url, destDir, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-f',
      'bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--newline',
      '--no-part',
      '-o',
      path.join(destDir, 'source.%(ext)s'),
      ...cookieArgs(),
      url,
    ];

    let child;
    try {
      child = spawn('yt-dlp', args, { windowsHide: true });
    } catch (err) {
      return reject(spawnError(err, 'yt-dlp'));
    }

    let stderr = '';
    let buffer = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const m = DOWNLOAD_LINE.exec(line);
        if (!m) continue;
        onProgress({
          percent: Math.min(100, Number(m[1]) || 0),
          total: unknown(m[2]),
          speed: unknown(m[3]),
          eta: unknown(m[4]),
        });
      }
    });

    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => reject(spawnError(err, 'yt-dlp')));
    child.on('close', (code) => {
      if (code !== 0) return reject(classifyYtDlpError(stderr, code));
      findDownloaded(destDir).then(resolve, (err) =>
        reject({
          code: 'no_output',
          title: 'Download produced no file',
          detail: String(err.message || err),
          hint: null,
          raw: null,
        })
      );
    });
  });
}

function codecArgs(format, bitrate, inputPath) {
  switch (format) {
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-b:a', `${bitrate}k`];
    case 'm4a':
      // Already AAC in an MP4 container, so remux rather than re-encode.
      return path.extname(inputPath).toLowerCase() === '.m4a'
        ? ['-c:a', 'copy']
        : ['-c:a', 'aac', '-b:a', `${bitrate}k`];
    case 'wav':
      return ['-c:a', 'pcm_s16le'];
    case 'flac':
      return ['-c:a', 'flac'];
    default:
      throw new Error(`unsupported format: ${format}`);
  }
}

export function encodeAudio({ input, output, format, bitrate, duration, meta }, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostats',
      '-progress',
      'pipe:1',
      '-i',
      input,
      '-vn',
      '-map_metadata',
      '-1',
      ...codecArgs(format, bitrate, input),
    ];

    if (meta?.title) args.push('-metadata', `title=${meta.title}`);
    if (meta?.artist) args.push('-metadata', `artist=${meta.artist}`);
    args.push(output);

    let child;
    try {
      child = spawn('ffmpeg', args, { windowsHide: true });
    } catch (err) {
      return reject(spawnError(err, 'ffmpeg'));
    }

    let stderr = '';
    let buffer = '';

    // -progress emits key=value lines; out_time_us against the known duration
    // is the only reliable percentage ffmpeg will give us.
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' && duration > 0) {
          const seconds = Number(value) / 1_000_000;
          if (Number.isFinite(seconds)) {
            onProgress({ percent: Math.max(0, Math.min(100, (seconds / duration) * 100)) });
          }
        }
      }
    });

    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => reject(spawnError(err, 'ffmpeg')));
    child.on('close', (code) => {
      if (code !== 0) return reject(ffmpegError(stderr, code));
      resolve(output);
    });
  });
}
