import { Col, Empty, Row } from 'antd';
import InkSection from '../../../components/InkSection';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';

function MiniBar({ data, xField = 'key', title, color = '#1677ff' }) {
  if (!data || data.length === 0) return <Empty description="暂无数据" />;
  return (
    <InkSection size="small" title={title}>
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
    </InkSection>
  );
}

export default function BehaviorPanels({ behavior }) {
  return (
    <InkSection title="交易决策维度">
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <MiniBar data={behavior?.strategy_type || []} title="策略类型分布" color="#1677ff" />
        </Col>
      </Row>
    </InkSection>
  );
}
