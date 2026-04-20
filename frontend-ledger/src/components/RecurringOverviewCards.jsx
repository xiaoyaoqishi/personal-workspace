import { Card } from 'antd'

const CARD_ITEMS = [
  { key: 'active_rule_count', title: '启用规则' },
  { key: 'upcoming_count', title: '即将到期' },
  { key: 'overdue_count', title: '已逾期' },
  { key: 'anomaly_count', title: '金额异常' },
]

export default function RecurringOverviewCards({ overview }) {
  return (
    <div className="dashboard-grid">
      {CARD_ITEMS.map((item) => (
        <Card key={item.key} className="page-card" size="small">
          <div style={{ color: '#667085', marginBottom: 6 }}>{item.title}</div>
          <div className="stat-value">{Number(overview?.[item.key] || 0)}</div>
        </Card>
      ))}
    </div>
  )
}
