import express from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireDependencies, checkDependencies } from './lib/deps.js';
import { parseYouTubeUrl, safeFilename } from './lib/youtube.js';
import { fetchInfo, summarise, downloadAudio, encodeAudio } from './lib/extract.js';
import {
  createJob,
  getJob,
  snapshot,
  update,
  subscribe,
  finish,
  fail,
  discard,
  isExpired,
  ttlMinutes,
} from './lib/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 5178;
const HOST = process.env.HOST || '127.0.0.1';
const TEMP_ROOT = path.join(os.tmpdir(), 'audio-extract');
const DIST_DIR = path.resolve(__dirname, '../web/dist');

const FORMATS = new Set(['mp3', 'm4a', 'wav', 'flac']);
const BITRATES = new Set([128, 192, 320]);
const LOSSLESS = new Set(['wav', 'flac']);

// Download is the slow half; encode is fast. Splitting the bar 70/30 keeps it
// moving at a believable rate rather than stalling at 99%.
const DOWNLOAD_SHARE = 0.7;

const INFO_TTL_MS = 10 * 60 * 1000;
const infoCache = new Map();

const app = express();
app.use(express.json({ limit: '16kb' }));

function badRequest(res, code, title, detail) {
  return res.status(400).json({ error: { code, title, detail, hint: null } });
}

async function cachedInfo(parsed) {
  const hit = infoCache.get(parsed.id);
  if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.info;

  const info = summarise(await fetchInfo(parsed.url));
  infoCache.set(parsed.id, { at: Date.now(), info });
  return info;
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, deps: await checkDependencies(), ttlMinutes: ttlMinutes() });
});

app.post('/api/info', async (req, res) => {
  const parsed = parseYouTubeUrl(req.body?.url);
  if (!parsed) {
    return badRequest(
      res,
      'invalid_url',
      'Not a YouTube URL',
      'Paste a link to a single YouTube video, e.g. youtube.com/watch?v=... or youtu.be/...'
    );
  }

  try {
    res.json(await cachedInfo(parsed));
  } catch (err) {
    res.status(502).json({ error: err });
  }
});

app.post('/api/extract', async (req, res) => {
  const parsed = parseYouTubeUrl(req.body?.url);
  if (!parsed) {
    return badRequest(res, 'invalid_url', 'Not a YouTube URL', 'Paste a link to a single YouTube video.');
  }

  const format = String(req.body?.format ?? '').toLowerCase();
  if (!FORMATS.has(format)) {
    return badRequest(res, 'invalid_format', 'Unsupported format', `Choose one of: ${[...FORMATS].join(', ')}.`);
  }

  let bitrate = null;
  if (!LOSSLESS.has(format)) {
    bitrate = Number(req.body?.bitrate);
    if (!BITRATES.has(bitrate)) {
      return badRequest(res, 'invalid_bitrate', 'Unsupported bitrate', `Choose one of: ${[...BITRATES].join(', ')}.`);
    }
  }

  let info;
  try {
    info = await cachedInfo(parsed);
  } catch (err) {
    return res.status(502).json({ error: err });
  }

  const job = createJob({
    url: parsed.url,
    videoId: parsed.id,
    format,
    bitrate,
    title: info.title,
    uploader: info.uploader,
    duration: info.duration ?? 0,
  });

  res.status(202).json({ jobId: job.id });
  void runJob(job);
});

async function runJob(job) {
  const dir = path.join(TEMP_ROOT, job.id);
  job.dir = dir;

  try {
    await fs.mkdir(dir, { recursive: true });
    update(job, { state: 'running', stage: 'download', percent: 0 });

    const source = await downloadAudio(job.url, dir, (p) => {
      update(job, {
        stage: 'download',
        percent: p.percent * DOWNLOAD_SHARE,
        speed: p.speed,
        eta: p.eta,
        total: p.total,
      });
    });

    update(job, {
      stage: 'encode',
      percent: DOWNLOAD_SHARE * 100,
      speed: null,
      eta: null,
    });

    const name = safeFilename(job.title, job.format);
    const output = path.join(dir, name);

    await encodeAudio(
      {
        input: source,
        output,
        format: job.format,
        bitrate: job.bitrate,
        duration: job.duration,
        meta: { title: job.title, artist: job.uploader },
      },
      (p) => {
        update(job, {
          stage: 'encode',
          percent: DOWNLOAD_SHARE * 100 + p.percent * (1 - DOWNLOAD_SHARE),
        });
      }
    );

    // The source file is dead weight once encoding succeeds.
    await fs.rm(source, { force: true }).catch(() => {});

    const stat = await fs.stat(output);
    finish(job, { name, path: output, size: stat.size });
  } catch (err) {
    fail(job, err);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

app.get('/api/progress/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'no_job', title: 'Unknown job', detail: null, hint: null } });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const emit = (snap) => {
    send('state', snap);
    if (snap.state === 'done') {
      send('done', { ...snap.file, url: `/api/file/${job.id}`, expiresAt: snap.expiresAt });
      close();
    } else if (snap.state === 'error') {
      send('failed', snap.error);
      close();
    }
  };

  const off = subscribe(job, emit);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  function close() {
    clearInterval(heartbeat);
    off();
    res.end();
  }

  // A client can attach after work has already started, so replay current state.
  emit(snapshot(job));

  req.on('close', () => {
    clearInterval(heartbeat);
    off();
  });
});

app.get('/api/file/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !job.file) {
    return res.status(404).json({ error: { code: 'no_file', title: 'File not found', detail: null, hint: null } });
  }
  if (isExpired(job)) {
    return res.status(410).json({
      error: {
        code: 'expired',
        title: 'File expired',
        detail: `Finished files are deleted after ${ttlMinutes()} minutes. Extract it again.`,
        hint: null,
      },
    });
  }
  res.download(job.file.path, job.file.name);
});

// Serve the production build when one exists, so `npm run build && npm start`
// runs the whole tool from a single process.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

async function main() {
  await requireDependencies();
  await fs.rm(TEMP_ROOT, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(TEMP_ROOT, { recursive: true });

  const server = app.listen(PORT, HOST, () => {
    process.stdout.write(`\n  audio-extract api  http://${HOST}:${PORT}\n`);
    process.stdout.write(`  files kept for     ${ttlMinutes()} min\n\n`);
  });

  const shutdown = async () => {
    server.close();
    await fs.rm(TEMP_ROOT, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
