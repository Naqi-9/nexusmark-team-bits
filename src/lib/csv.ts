/** Minimal RFC 4180 CSV writer with spreadsheet formula-injection protection. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralise formulas (=, +, -, @, tab, CR) so opening in Excel/Sheets cannot execute them.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]): string {
  const head = columns.map(c => csvCell(c.header)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}
