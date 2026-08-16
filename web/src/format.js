/** Seconds to m:ss, or h:mm:ss past an hour. */
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';

  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function bytes(n) {
  if (!Number.isFinite(n)) return '--';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function count(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

/**
 * yt-dlp gives upload_date as YYYYMMDD. Coerced once and reused: validating the
 * string form and then slicing the original meant a numeric input passed the
 * check and threw on .slice().
 */
export function uploadDate(value) {
  const text = String(value ?? '');
  if (!/^\d{8}$/.test(text)) return null;

  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
}
