import { Empty } from 'antd';
import InkSection from '../../../components/InkSection';
import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  ReferenceLine,
} from 'recharts';

export default function EquityCurvePanel({ data }) {
  if (!data || data.length === 0) return null;

  const minPnl = Math.min(...data.map((d) => d.cumulative_pnl));
  const maxPnl = Math.max(...data.map((d) => d.cumulative_pnl));
  const domain = [Math.floor(minPnl * 1.1), Math.ceil(maxPnl * 1.1)];

  return (
    <InkSection title="权益曲线">
      {data.length === 0 ? (
        <Empty description="暂无权益数据" />
      ) : (
        <div className="analytics-chart-box">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1677ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1677ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={domain} />
              <Tooltip
                formatter={(value, name) => [
                  Number(value).toFixed(2),
                  name === 'cumulative_pnl' ? '累计盈亏' : '当日盈亏',
                ]}
              />
              <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="cumulative_pnl"
                name="cumulative_pnl"
                stroke="#1677ff"
                strokeWidth={2}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </InkSection>
  );
}
