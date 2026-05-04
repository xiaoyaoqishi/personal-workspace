import { Card, Col, Row, Statistic } from 'antd'

export default function RuleStatsCards({ rules }) {
  const total = rules.length
  const enabled = rules.filter((r) => r.enabled).length
  const enabledRate = total ? Math.round((enabled / total) * 100) : 0
  const avgHitRate = total
    ? Math.round(rules.reduce((acc, r) => acc + (r.hit_count || 0), 0) / total)
    : 0

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col xs={12} sm={6}>
        <Card size="small" bordered={false} style={{ background: 'var(--lk-color-surface-2)' }}>
          <Statistic title="启用率" value={enabledRate} suffix="%" valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" bordered={false} style={{ background: 'var(--lk-color-surface-2)' }}>
          <Statistic title="总规则数" value={total} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" bordered={false} style={{ background: 'var(--lk-color-surface-2)' }}>
          <Statistic title="已启用" value={enabled} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small" bordered={false} style={{ background: 'var(--lk-color-surface-2)' }}>
          <Statistic title="平均命中次数" value={avgHitRate} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
        </Card>
      </Col>
    </Row>
  )
}
