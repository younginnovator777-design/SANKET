// ============================================================
// SANKET — Client-Side Export Utilities (A13)
// Pure client-side download helpers. No backend calls.
// Produces real, non-empty downloads from in-memory data.
// ============================================================

/**
 * Triggers a browser download of a JSON file containing the given data.
 */
export function downloadJSON(data: unknown, filename: string): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

/**
 * Converts an array of objects to CSV and triggers a browser download.
 * Columns are derived from the union of all object keys.
 */
export function downloadCSV<T extends object>(rows: T[], filename: string): void {
  if (typeof window === 'undefined') return;
  if (rows.length === 0) {
    // Empty dataset — still produce a valid CSV with no rows
    triggerDownload(new Blob([''], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
    return;
  }

  // Collect all unique keys in order of first appearance
  const colSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      colSet.add(key);
    }
  }
  const columns = Array.from(colSet);

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    // Wrap in quotes if the value contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map(escape).join(',');
  const body = rows
    .map((row) => columns.map((col) => escape((row as Record<string, unknown>)[col])).join(','))
    .join('\n');
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Creates an invisible anchor element, triggers a download, and cleans up.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Cleanup after a short delay to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}
