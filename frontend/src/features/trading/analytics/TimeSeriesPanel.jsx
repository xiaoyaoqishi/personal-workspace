import { useMemo, useState } from 'react';
import { Card, Col, Empty, Row, Segmented } from 'antd';
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  BarChart,
  Bar,
} from 'recharts';

export default function TimeSeriesPanel({ series }) {
  const [granularity, setGranularity] = useState('daily');
  const currentData = useMemo(() => series?.[granularity] || [], [series, granularity]);
  const formatPercent = (val) => `${Number(val || 0).toFixed(0)}%`;
  const tooltipFormatter = (value, name) => {
    if (name === '胜率') return [`${Number(value || 0).toFixed(2)}%`, name];
    return [Number(value || 0).toFixed(2), name];
  };

  return (
    <Card
      title="时间维度（盈亏、胜率与频次）"
      extra={
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[
            { label: '日', value: 'daily' },
            { label: '周', value: 'weekly' },
            { label: '月', value: 'monthly' },
          ]}
        />
      }
    >
      {currentData.length === 0 ? (
        <Empty description="暂无时间序列数据" />
      ) : (
        <Row gutter={12}>
          <Col xs={24} lg={15}>
            <div className="analytics-chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={currentData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={formatPercent} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="total_pnl" name="净盈亏" stroke="#1677ff" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="win_rate" name="胜率" stroke="#52c41a" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col xs={24} lg={9}>
            <div className="analytics-chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={currentData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip formatter={(value) => Number(value || 0).toFixed(0)} />
                  <Legend />
                  <Bar dataKey="trade_count" name="交易数" fill="#722ed1" />
                  <Bar dataKey="win_count" name="盈利笔数" fill="#52c41a" />
                  <Bar dataKey="loss_count" name="亏损笔数" fill="#faad14" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>
      )}
    </Card>
  );
}
