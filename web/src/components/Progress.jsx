const STAGE_LABEL = {
  queued: 'Queued',
  download: 'Download',
  encode: 'Encode',
  done: 'Done',
};

export default function Progress({ progress }) {
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return (
    <div className="progress">
      <div
        className="bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="readout">
        <span>{STAGE_LABEL[progress?.stage] ?? 'Working'}</span>
        <span className="figures">
          {progress?.speed && <span>{progress.speed}</span>}
          {progress?.eta && <span>ETA {progress.eta}</span>}
          <span className="pct">{percent}%</span>
        </span>
      </div>
    </div>
  );
}
