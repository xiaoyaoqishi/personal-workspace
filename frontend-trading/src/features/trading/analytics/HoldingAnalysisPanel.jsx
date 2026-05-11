import { Col, Empty, Row } from 'antd';
import InkSection from '../../../components/InkSection';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';

export default function HoldingAnalysisPanel({ data }) {
  if (!data || data.length === 0) return null;

  const hasData = data.some((d) => d.count > 0);
  if (!hasData) return null;

  const formatPercent = (val) => `${Number(val || 0).toFixed(0)}%`;

  return (
    <InkSection title="持仓时长分析">
      {!hasData ? (
        <Empty description="暂无数据" />
      ) : (
        <Row gutter={12}>
          <Col xs={24} lg={12}>
            <div className="analytics-chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={formatPercent} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === '胜率') return [`${Number(value).toFixed(1)}%`, name];
                      return [Number(value).toFixed(2), name];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name="交易数" fill="#722ed1" />
                  <Bar yAxisId="left" dataKey="total_pnl" name="总盈亏" fill="#1677ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <div className="analytics-chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip formatter={(value) => [Number(value).toFixed(2), '单笔均盈亏']} />
                  <Legend />
                  <Bar dataKey="avg_pnl" name="单笔均盈亏" fill="#13c2c2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>
      )}
    </InkSection>
  );
}
