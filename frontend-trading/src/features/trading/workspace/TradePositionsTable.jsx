import { Table, Tag } from 'antd';
import { formatInstrumentDisplay } from '../display';

export default function TradePositionsTable({ rows, loading }) {
  const columns = [
    { title: '品种', dataIndex: 'symbol_label', width: 220 },
    {
      title: '方向',
      dataIndex: 'side',
      width: 90,
      render: (v) => <Tag color={v === '做多' ? 'red' : 'green'}>{v}</Tag>,
    },
    { title: '净手数', dataIndex: 'net_quantity', width: 100 },
    { title: '持仓均价', dataIndex: 'avg_open_price', width: 120 },
    { title: '开仓起始日', dataIndex: 'open_since', width: 120 },
    { title: '最近成交日', dataIndex: 'last_trade_date', width: 120 },
  ];

  const dataSource = rows.map((p, idx) => ({
    key: `${p.symbol}-${p.side}-${idx}`,
    ...p,
    symbol_label: formatInstrumentDisplay(p.symbol, p.contract),
  }));

  return (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      pagination={false}
      size="middle"
      locale={{ emptyText: '当前无持仓' }}
    />
  );
}
