import { Empty } from 'antd';
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

export default function PnlDistributionPanel({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <InkSection title="盈亏分布">
      {data.length === 0 ? (
        <Empty description="暂无数据" />
      ) : (
        <div className="analytics-chart-box">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range_label" interval="preserveStartEnd" angle={-20} textAnchor="end" height={50} />
              <YAxis />
              <Tooltip
                formatter={(value) => [value, '笔数']}
                labelFormatter={(label) => `区间: ${label}`}
              />
              <Bar dataKey="count" name="笔数">
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={(entry.range_start ?? 0) >= 0 ? '#cf1322' : '#3f8600'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </InkSection>
  );
}
