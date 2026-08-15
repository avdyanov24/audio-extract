export default function ErrorPanel({ error }) {
  return (
    <div className="error reveal" role="alert">
      <p>{error.title}</p>
      {error.detail && <p className="detail">{error.detail}</p>}
      {error.hint && <p className="hint">{error.hint}</p>}
    </div>
  );
}
