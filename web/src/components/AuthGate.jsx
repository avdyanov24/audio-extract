import { useState } from 'react';

import { authenticate } from '../api.js';
import ErrorPanel from './ErrorPanel.jsx';

export default function AuthGate({ onUnlock }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);

    try {
      await authenticate(trimmed);
      onUnlock();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form className="field" noValidate onSubmit={submit}>
        <input
          type="password"
          spellCheck={false}
          autoComplete="current-password"
          autoFocus
          aria-label="Access token"
          placeholder="access token"
          value={token}
          disabled={busy}
          onChange={(event) => setToken(event.target.value)}
        />
        <span className="status">{busy ? 'Checking' : 'Return'}</span>
      </form>

      {error && <ErrorPanel error={error} />}
    </div>
  );
}
