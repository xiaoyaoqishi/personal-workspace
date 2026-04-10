import { Card, Col, Empty, Row } from 'antd';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';

const PLANNED_KEY_ZH = {
  planned: '计划内',
  unplanned: '计划外',
  unknown: '未标注',
};

const OVERNIGHT_KEY_ZH = {
  overnight: '隔夜',
  intraday_or_unknown: '日内/未标注',
};

function MiniBar({ data, xField = 'key', title, color = '#1677ff' }) {
  if (!data || data.length === 0) return <Empty description="暂无数据" />;
  return (
    <Card size="small" title={title}>
      <div className="analytics-chart-box">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xField} interval={0} angle={-18} textAnchor="end" height={62} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name="数量" fill={color} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function BehaviorPanels({ behavior }) {
  const plannedRows = (behavior?.planned_vs_unplanned || []).map((row) => ({
    ...row,
    key: PLANNED_KEY_ZH[row.key] || row.key,
  }));
  const overnightRows = (behavior?.overnight_split || []).map((row) => ({
    ...row,
    key: OVERNIGHT_KEY_ZH[row.key] || row.key,
  }));

  return (
    <Card title="行为与质量维度">
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <MiniBar data={behavior?.error_tags || []} xField="tag" title="错误标签频次" color="#f5222d" />
        </Col>
        <Col xs={24} xl={12}>
          <MiniBar data={plannedRows} title="计划内/计划外分布" color="#13c2c2" />
        </Col>
        <Col xs={24} xl={12}>
          <MiniBar data={behavior?.strategy_type || []} title="策略类型分布" color="#1677ff" />
        </Col>
        <Col xs={24} xl={12}>
          <MiniBar data={behavior?.market_condition || []} title="市场状态分布" color="#722ed1" />
        </Col>
        <Col xs={24} xl={12}>
          <MiniBar data={behavior?.timeframe || []} title="周期分布" color="#52c41a" />
        </Col>
        <Col xs={24} xl={12}>
          <MiniBar data={overnightRows} title="隔夜/日内分布" color="#fa8c16" />
        </Col>
      </Row>
    </Card>
  );
}
