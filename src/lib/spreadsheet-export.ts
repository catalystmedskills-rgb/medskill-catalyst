/** Prevent spreadsheet software interpreting untrusted text as a formula. */
export function safeSpreadsheetCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
}
