import { Col, Empty, Row, Statistic } from 'antd';
import InkSection from '../../../components/InkSection';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
} from 'recharts';

export default function StreaksPanel({ data }) {
  if (!data) return null;

  const { max_win_streak, max_loss_streak, max_win_streak_pnl, max_loss_streak_pnl, streaks } = data;

  const chartData = (streaks || [])
    .filter((s) => s.type !== 'flat')
    .map((s, i) => ({
      idx: i + 1,
      count: s.type === 'win' ? s.count : -s.count,
      pnl: s.pnl,
      type: s.type,
    }));

  return (
    <InkSection title="连胜连亏分析">
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div className="ink-kpi-item">
            <Statistic title="最大连胜" value={max_win_streak} suffix="笔" valueStyle={{ color: '#cf1322' }} />
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="ink-kpi-item">
            <Statistic title="连胜盈利" value={max_win_streak_pnl} precision={2} valueStyle={{ color: '#cf1322' }} />
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="ink-kpi-item">
            <Statistic title="最大连亏" value={max_loss_streak} suffix="笔" valueStyle={{ color: '#3f8600' }} />
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="ink-kpi-item">
            <Statistic title="连亏亏损" value={max_loss_streak_pnl} precision={2} valueStyle={{ color: '#3f8600' }} />
          </div>
        </Col>
      </Row>
      {chartData.length === 0 ? (
        <Empty description="暂无连续交易数据" />
      ) : (
        <div className="analytics-chart-box">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="idx" label={{ value: '段序号', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: '连续笔数', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'count') return [`${Math.abs(value)} 笔`, value > 0 ? '连胜' : '连亏'];
                  return [Number(value).toFixed(2), '盈亏'];
                }}
              />
              <Bar dataKey="count" name="count">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.type === 'win' ? '#cf1322' : '#3f8600'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </InkSection>
  );
}
