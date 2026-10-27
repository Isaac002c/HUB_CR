export function toProtocolDateIso(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return null;

  // node-postgres serializes DATE values as ISO timestamps in JSON. Keep the
  // database's calendar date when an untouched protocol is edited and saved.
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (iso) return iso[1];

  const separated = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (separated) {
    return `${separated[3]}-${separated[2].padStart(2, '0')}-${separated[1].padStart(2, '0')}`;
  }

  const compact = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) return `${compact[3]}-${compact[2]}-${compact[1]}`;

  return null;
}

export function toProtocolDateDisplay(value) {
  if (value == null || value === '') return '';
  const iso = toProtocolDateIso(value);
  if (iso) {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }
  return String(value).slice(0, 10);
}
