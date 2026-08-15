export default function UrlField({ value, onChange, onSubmit, status, disabled }) {
  return (
    <form
      className="field"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* type=text rather than url: the server returns a better message than
          the browser's native validation bubble, which is not in the design. */}
      <input
        type="text"
        inputMode="url"
        spellCheck={false}
        autoComplete="off"
        autoFocus
        aria-label="YouTube URL"
        placeholder="youtube.com/watch?v="
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="status">{status}</span>
    </form>
  );
}
