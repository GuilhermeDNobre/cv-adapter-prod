const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  const escaped = value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
  // Neutralize URL schemes so person text can never introduce an external
  // reference; it still displays unchanged because &#58; renders as ':'.
  return escaped.replace(/https?:\/\//gi, (match) => `${match.slice(0, -3)}&#58;//`);
}
