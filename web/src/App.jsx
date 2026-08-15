import { useEffect, useRef, useState } from 'react';

import UrlField from './components/UrlField.jsx';
import MetaCard from './components/MetaCard.jsx';
import Segmented from './components/Segmented.jsx';
import Progress from './components/Progress.jsx';
import ErrorPanel from './components/ErrorPanel.jsx';
import Result from './components/Result.jsx';

import { fetchInfo, startExtract, watchJob } from './api.js';

const FORMATS = ['mp3', 'm4a', 'wav', 'flac'];
const BITRATES = [128, 192, 320];
const LOSSLESS = new Set(['wav', 'flac']);

export default function App() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | fetching | ready | extracting | done
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState(192);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const stopRef = useRef(null);

  useEffect(() => () => stopRef.current?.(), []);

  const busy = phase === 'fetching' || phase === 'extracting';

  async function submit() {
    const trimmed = url.trim();
    if (!trimmed || busy) return;

    stopRef.current?.();
    setError(null);
    setInfo(null);
    setResult(null);
    setProgress(null);
    setPhase('fetching');

    try {
      const data = await fetchInfo(trimmed);
      setInfo(data);
      setPhase('ready');
    } catch (err) {
      setError(err);
      setPhase('idle');
    }
  }

  async function extract() {
    setError(null);
    setResult(null);
    setProgress({ stage: 'download', percent: 0, speed: null, eta: null });
    setPhase('extracting');

    try {
      const { jobId } = await startExtract({
        url: url.trim(),
        format,
        ...(LOSSLESS.has(format) ? {} : { bitrate }),
      });

      stopRef.current = watchJob(jobId, {
        onState: setProgress,
        onDone: (file) => {
          setResult(file);
          setPhase('done');
        },
        onError: (err) => {
          setError(err);
          setPhase('ready');
        },
      });
    } catch (err) {
      setError(err);
      setPhase('ready');
    }
  }

  // A finished file no longer matches the controls once they change, so drop
  // back to the pre-extract state rather than offering a stale download.
  function revise(apply) {
    return (next) => {
      apply(next);
      if (phase === 'done') {
        setPhase('ready');
        setResult(null);
      }
    };
  }

  const status =
    phase === 'fetching' ? 'Fetching' : phase === 'extracting' ? 'Working' : 'Return';

  return (
    <main className="shell stack">
      <UrlField
        value={url}
        onChange={setUrl}
        onSubmit={submit}
        status={status}
        disabled={phase === 'extracting'}
      />

      {error && <ErrorPanel error={error} />}

      {info && (
        <div className="stack reveal" key={info.id}>
          <MetaCard info={info} live={phase === 'extracting'} />

          <Segmented
            label="Format"
            options={FORMATS}
            value={format}
            onChange={revise(setFormat)}
          />

          {LOSSLESS.has(format) ? (
            <div className="stack-tight">
              <p className="label">Bitrate</p>
              <p className="lossless">Lossless</p>
            </div>
          ) : (
            <Segmented
              label="Bitrate"
              options={BITRATES}
              value={bitrate}
              onChange={revise(setBitrate)}
            />
          )}

          {phase === 'extracting' && <Progress progress={progress} />}

          {phase === 'done' && result && <Result file={result} />}

          {(phase === 'ready' || phase === 'fetching') && (
            <button type="button" className="btn btn-primary" onClick={extract}>
              Extract
            </button>
          )}
        </div>
      )}
    </main>
  );
}
