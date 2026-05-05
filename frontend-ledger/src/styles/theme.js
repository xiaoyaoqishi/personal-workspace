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

export const darkThemeToken = {
  colorBgContainer: '#1e293b',
  colorBgElevated: '#1e293b',
  colorBgLayout: '#0f172a',
  colorText: '#f1f5f9',
  colorTextSecondary: '#94a3b8',
  colorBorder: '#2d3f58',
  colorBorderSecondary: '#2d3f58',
};

export const inkThemeToken = {
  colorPrimary: '#1a4a6e',
  borderRadius: 4,
  colorSuccess: '#3d6b4a',
  colorError: '#b8432a',
  colorWarning: '#9e7510',
  colorInfo: '#1a4a6e',
  colorBgContainer: '#faf7f0',
  colorBgElevated: '#faf7f0',
  colorBgLayout: '#f4efe6',
  colorText: '#1a1408',
  colorTextSecondary: '#4a3f2f',
  colorBorder: '#d4c9b5',
  colorBorderSecondary: '#d4c9b5',
  fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', serif",
};

export const techThemeToken = {
  colorPrimary: '#00d4ff',
  borderRadius: 6,
  colorSuccess: '#00ffaa',
  colorError: '#ff4757',
  colorWarning: '#ffa726',
  colorInfo: '#00bcd4',
  colorBgContainer: '#161b22',
  colorBgElevated: '#1c2330',
  colorBgLayout: '#0d1117',
  colorText: '#e6edf3',
  colorTextSecondary: '#a0b4c8',
  colorBorder: '#2a3a4e',
  colorBorderSecondary: '#2a3a4e',
};
