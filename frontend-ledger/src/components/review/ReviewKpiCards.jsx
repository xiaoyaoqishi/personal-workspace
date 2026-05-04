import { Card } from 'antd'

/**
 * ReviewKpiCards — 复核台 3 列 KPI 卡
 * Props:
 *   pending      {number}
 *   committable  {number}
 *   duplicate    {number}
 *   unrecognized {number}
 *   activeFilter {string}  当前激活的 Tab key
 *   onFilter     {Function(key)} 点击切换
 */
const KPI_ITEMS = [
  { key: 'pending', label: '待确认', colorVar: '--lk-color-info' },
  { key: 'unrecognized', label: '待识别', colorVar: '--lk-color-warning' },
  { key: 'committable', label: '可入账', colorVar: '--lk-color-success' },
  { key: 'duplicate', label: '重复标记', colorVar: '--lk-color-text-muted' },
]

export default function ReviewKpiCards({ pending = 0, committable = 0, duplicate = 0, unrecognized = 0, activeFilter, onFilter }) {
  const values = { pending, committable, duplicate, unrecognized }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {KPI_ITEMS.map(({ key, label, colorVar }) => {
        const isActive = activeFilter === key
        return (
          <Card
            key={key}
            size="small"
            onClick={() => onFilter(isActive ? 'all' : key)}
            style={{
              cursor: 'pointer',
              borderRadius: 'var(--lk-radius-md)',
              border: isActive ? `2px solid var(${colorVar})` : '1px solid var(--lk-color-border)',
              boxShadow: isActive ? 'var(--lk-shadow-card)' : 'none',
              transition: 'all 0.15s',
            }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: `var(${colorVar})` }}>
              {values[key]}
            </div>
            <div style={{ fontSize: 13, color: 'var(--lk-color-text-secondary)', marginTop: 2 }}>{label}</div>
          </Card>
        )
      })}
    </div>
  )
}
