const UPSTREAM_DOWN = new Set([500, 502, 503, 504]);

const GENERIC = {
  code: 'network',
  title: 'Could not reach the server',
  detail: 'The API process may not be running.',
  hint: 'Start both processes with: npm run dev',
};

async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw GENERIC;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (data?.error) throw data.error;

    // The dev proxy turns a dead API process into a 500 with an HTML body, so
    // fetch resolves and the generic branch above never fires. A non-JSON 5xx
    // means the API is not answering, which is worth saying plainly.
    if (data === null && UPSTREAM_DOWN.has(res.status)) throw GENERIC;

    throw {
      code: 'http_error',
      title: `Request failed (${res.status})`,
      detail: null,
      hint: null,
    };
  }

  return data;
}

/** Exchanges the shared token for the cookie the SSE stream also reads. */
export const authenticate = (token) => post('/api/auth', { token });

export const fetchInfo = (url) => post('/api/info', { url });

export const startExtract = (payload) => post('/api/extract', payload);

/**
 * Subscribe to a job's progress stream. Returns an unsubscribe function.
 * The server closes the stream itself on a terminal event, so the onerror
 * handler has to ignore that expected close.
 */
export function watchJob(jobId, { onState, onDone, onError }) {
  const source = new EventSource(`/api/progress/${jobId}`);
  let settled = false;

  const close = () => {
    settled = true;
    source.close();
  };

  source.addEventListener('state', (event) => {
    if (!settled) onState(JSON.parse(event.data));
  });

  source.addEventListener('done', (event) => {
    if (settled) return;
    const payload = JSON.parse(event.data);
    close();
    onDone(payload);
  });

  source.addEventListener('failed', (event) => {
    if (settled) return;
    const payload = JSON.parse(event.data);
    close();
    onError(payload);
  });

  source.onerror = () => {
    if (settled) return;
    close();
    onError({
      code: 'stream_lost',
      title: 'Lost connection to the server',
      detail: 'The progress stream closed before the job finished.',
      hint: null,
    });
  };

  return close;
}
