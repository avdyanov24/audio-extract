import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';

const DEFAULT_TTL_MINUTES = 10;

export const ttlMinutes = () => Number(process.env.FILE_TTL_MINUTES) || DEFAULT_TTL_MINUTES;

const jobs = new Map();

export function createJob(input) {
  const job = {
    id: randomUUID(),
    ...input,
    state: 'queued', // queued | running | done | error
    stage: 'queued', // queued | download | encode | done | error
    percent: 0,
    speed: null,
    eta: null,
    total: null,
    file: null,
    error: null,
    createdAt: Date.now(),
    expiresAt: null,
    dir: null,
    emitter: new EventEmitter(),
  };
  // Several SSE clients may watch one job; the default cap of 10 is arbitrary.
  job.emitter.setMaxListeners(0);
  jobs.set(job.id, job);
  return job;
}

export const getJob = (id) => jobs.get(id);

/** Everything except the emitter and absolute paths, safe to send to the client. */
export function snapshot(job) {
  return {
    id: job.id,
    state: job.state,
    stage: job.stage,
    percent: Math.round(job.percent),
    speed: job.speed,
    eta: job.eta,
    total: job.total,
    format: job.format,
    bitrate: job.bitrate,
    file: job.file ? { name: job.file.name, size: job.file.size } : null,
    error: job.error,
    expiresAt: job.expiresAt,
  };
}

export function update(job, patch) {
  Object.assign(job, patch);
  job.emitter.emit('update', snapshot(job));
}

export function subscribe(job, listener) {
  job.emitter.on('update', listener);
  return () => job.emitter.off('update', listener);
}

/**
 * Finished files are deleted after the TTL so a long-running server does not
 * accumulate audio in the temp directory.
 */
export function finish(job, file) {
  const ttl = ttlMinutes() * 60_000;
  update(job, {
    state: 'done',
    stage: 'done',
    percent: 100,
    speed: null,
    eta: null,
    file,
    expiresAt: Date.now() + ttl,
  });

  const timer = setTimeout(() => {
    void discard(job.id);
  }, ttl);
  timer.unref?.();
}

export function fail(job, error) {
  update(job, {
    state: 'error',
    stage: 'error',
    speed: null,
    eta: null,
    error: {
      code: error?.code ?? 'unknown',
      title: error?.title ?? 'Extraction failed',
      detail: error?.detail ?? String(error?.message ?? error),
      hint: error?.hint ?? null,
    },
  });
}

export async function discard(id) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  if (job.dir) await fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

export const isExpired = (job) => Boolean(job.expiresAt && Date.now() > job.expiresAt);
