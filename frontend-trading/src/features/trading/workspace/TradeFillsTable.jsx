import { Button, Popconfirm, Rate, Space, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatInstrumentDisplay } from '../display';

export default function TradeFillsTable({
  rows,
  loading,
  pagination,
  selectedRowKeys,
  onSelectionChange,
  onPageChange,
  onOpenDetail,
  onOpenEdit,
  onDelete,
}) {
  const columns = [
    {
      title: '开仓时间',
      dataIndex: 'open_time',
      width: 110,
      render: (v, r) => {
        const d = v || r.trade_date;
        return d ? dayjs(d).format('YYYY-MM-DD') : '-';
      },
      sorter: (a, b) => new Date(a.open_time || 0).getTime() - new Date(b.open_time || 0).getTime(),
    },
    {
      title: '品种',
      dataIndex: 'symbol',
      width: 100,
      render: (_, r) => {
        const display = formatInstrumentDisplay(r.symbol, r.contract);
        return (
          <Tooltip title={[r.instrument_type, r.contract].filter(Boolean).join(' · ')}>
            {display}
          </Tooltip>
        );
      },
    },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 60,
      render: (v) => <Tag color={v === '做多' ? 'red' : 'green'}>{v}</Tag>,
    },
    { title: '开仓价', dataIndex: 'open_price', width: 85 },
    { title: '平仓价', dataIndex: 'close_price', width: 85 },
    { title: '手数', dataIndex: 'quantity', width: 60 },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      width: 90,
      render: (v) =>
        v != null ? (
          <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontWeight: 'bold' }}>{v.toFixed(2)}</span>
        ) : (
          '-'
        ),
      sorter: (a, b) => (a.pnl || 0) - (b.pnl || 0),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 60,
      render: (v) => <Tag color={v === 'closed' ? 'default' : 'processing'}>{v === 'closed' ? '已平' : '持仓'}</Tag>,
    },
    {
      title: '计划',
      dataIndex: 'is_planned',
      width: 60,
      render: (v) => (v ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '复盘',
      width: 60,
      render: (_, r) => (r.has_trade_review ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '违纪',
      width: 60,
      render: (_, r) => (r.discipline_violated ? <Tag color="red">是</Tag> : null),
    },
    {
      title: '',
      width: 120,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenDetail(r.id)} />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onOpenEdit(r.id)} />
          <Popconfirm title="确定移入回收站？" onConfirm={() => onDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={rows}
      rowSelection={{
        selectedRowKeys,
        onChange: onSelectionChange,
      }}
      loading={loading}
      scroll={{ x: 1100 }}
      pagination={{
        ...pagination,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        onChange: onPageChange,
        showTotal: (t) => `共 ${t} 条`,
      }}
      size="small"
    />
  );
}
