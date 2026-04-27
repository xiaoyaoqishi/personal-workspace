const HIDDEN_SOURCE_LABELS = new Set(['日结单粘贴导入']);

export function normalizeSourceLabelForDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (HIDDEN_SOURCE_LABELS.has(text)) return '';
  return text;
}
