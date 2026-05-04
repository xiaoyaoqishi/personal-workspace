import { Card, Progress, Statistic } from 'antd'
import { LK_DANGER, LK_SUCCESS, LK_WARNING } from '../../styles/theme'

function fmt(v, precision = 2) {
  return Number(v || 0).toFixed(precision)
}

export default function KpiCards({ summary, loading }) {
  const netBalance = summary?.net_balance ?? 0
  const netColor = netBalance >= 0 ? LK_SUCCESS : LK_DANGER
  const recognitionRate = Number(summary?.recognition_rate || 0) * 100

  const cards = [
    {
      title: '总支出',
      value: fmt(summary?.total_expense),
      prefix: '¥',
      color: LK_DANGER,
    },
    {
      title: '总收入',
      value: fmt(summary?.total_income),
      prefix: '¥',
      color: LK_SUCCESS,
    },
    {
      title: '净结余',
      value: fmt(Math.abs(netBalance)),
      prefix: netBalance >= 0 ? '+¥' : '-¥',
      color: netColor,
    },
    {
      title: '平均单笔',
      value: fmt(summary?.avg_per_transaction),
      prefix: '¥',
      color: 'var(--lk-color-text)',
    },
    {
      title: '识别率',
      value: null,
      extra: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Progress
            type="circle"
            percent={Number(recognitionRate.toFixed(1))}
            size={56}
            strokeColor="var(--lk-color-primary)"
            format={(p) => <span style={{ fontSize: 12 }}>{p}%</span>}
          />
          <span style={{ fontSize: 13, color: 'var(--lk-color-text-secondary)' }}>
            {recognitionRate.toFixed(1)}%
          </span>
        </div>
      ),
    },
    {
      title: '未识别金额',
      value: fmt(summary?.unrecognized_amount),
      prefix: '¥',
      color: LK_WARNING,
    },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
      }}
    >
      {cards.map((c) => (
        <Card
          key={c.title}
          className="page-card"
          loading={loading}
          size="small"
          style={{ minHeight: 96 }}
        >
          {c.extra ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--lk-color-text-secondary)', marginBottom: 4 }}>
                {c.title}
              </div>
              {c.extra}
            </>
          ) : (
            <Statistic
              title={c.title}
              value={c.value}
              prefix={c.prefix}
              valueStyle={{ color: c.color, fontSize: 20, fontWeight: 600 }}
            />
          )}
        </Card>
      ))}
    </div>
  )
}
