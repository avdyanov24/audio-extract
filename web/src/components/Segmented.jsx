export default function Segmented({ label, options, value, onChange }) {
  return (
    <div className="stack-tight">
      <p className="label">{label}</p>
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
