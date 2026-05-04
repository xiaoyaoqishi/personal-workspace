// Ledger JS theme constants — kept in sync with tokens.css
// Used for antd ConfigProvider and chart color references.

export const LK_PRIMARY = '#4f46e5';
export const LK_SUCCESS = '#10b981';
export const LK_DANGER  = '#ef4444';
export const LK_WARNING = '#f59e0b';
export const LK_INFO    = '#3b82f6';

export const LK_CATEGORY_COLORS = [
  'hsl(230,55%,60%)',
  'hsl(266,55%,60%)',
  'hsl(302,45%,55%)',
  'hsl(338,65%,58%)',
  'hsl(14,70%,55%)',
  'hsl(38,75%,52%)',
  'hsl(72,55%,48%)',
  'hsl(152,55%,45%)',
  'hsl(184,60%,45%)',
  'hsl(210,65%,55%)',
];

export const antdThemeToken = {
  colorPrimary: LK_PRIMARY,
  borderRadius: 12,
  colorSuccess: LK_SUCCESS,
  colorError:   LK_DANGER,
  colorWarning: LK_WARNING,
  colorInfo:    LK_INFO,
};
