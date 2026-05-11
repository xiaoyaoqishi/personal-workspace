import { Empty, Table, Tag } from 'antd';
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

export default function DisciplinePanel({ data }) {
  if (!data || data.length === 0) return null;

  const flagged = data.filter((d) => d.count > 0);

  const columns = [
    { title: '违规类型', dataIndex: 'label', key: 'label', width: 120 },
    {
      title: '次数',
      dataIndex: 'count',
      key: 'count',
      width: 80,
      render: (v) => (v > 0 ? <Tag color="red">{v}</Tag> : v),
    },
    { title: '占比', dataIndex: 'rate', key: 'rate', width: 80, render: (v) => `${v}%` },
    {
      title: '关联盈亏',
      dataIndex: 'total_pnl',
      key: 'total_pnl',
      width: 100,
      render: (v) => <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600' }}>{Number(v).toFixed(2)}</span>,
    },
  ];

  return (
    <InkSection title="纪律违规分析">
      {flagged.length === 0 ? (
        <Empty description="无违规记录" />
      ) : (
        <>
          <div className="analytics-chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={flagged} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="label" type="category" width={80} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="次数" fill="#f5222d" />
                <Bar dataKey="total_pnl" name="关联盈亏" fill="#faad14" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table
            style={{ marginTop: 12 }}
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={data}
            pagination={false}
          />
        </>
      )}
    </InkSection>
  );
}
