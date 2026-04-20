import { Button, Space, Table, Tag } from 'antd'
import AmountText from './AmountText'
import EmptyBlock from './EmptyBlock'

export default function RecurringReminderList({
  items,
  loading,
  onGenerateDraft,
  onViewRule,
  onMarkMatch,
}) {
  if (!items?.length) {
    return <EmptyBlock description="暂无提醒" />
  }

  return (
    <Table
      rowKey={(row) => `${row.reminder_type}-${row.rule_id}-${row.due_date}`}
      size="small"
      loading={loading}
      pagination={false}
      dataSource={items}
      columns={[
        { title: '规则', dataIndex: 'rule_name', width: 180 },
        { title: '账户', dataIndex: 'account_name', width: 130, render: (value) => value || '-' },
        { title: '分类', dataIndex: 'category_name', width: 130, render: (value) => value || '-' },
        {
          title: '金额',
          key: 'amount',
          width: 170,
          render: (_, row) => {
            if (row.actual_amount !== null && row.actual_amount !== undefined) {
              return (
                <div>
                  <AmountText value={row.actual_amount} direction="expense" currency={row.currency} />
                  <div style={{ color: '#98a2b3', fontSize: 12 }}>
                    预计 {row.expected_amount ?? '-'}
                  </div>
                </div>
              )
            }
            if (row.expected_amount === null || row.expected_amount === undefined) return '-'
            return <AmountText value={row.expected_amount} direction="expense" currency={row.currency} />
          },
        },
        { title: '到期日', dataIndex: 'due_date', width: 120 },
        {
          title: '最近匹配',
          key: 'matched',
          width: 180,
          render: (_, row) => (row.last_matched_at ? `${row.last_matched_at}`.slice(0, 19).replace('T', ' ') : '-'),
        },
        {
          title: '状态',
          key: 'status',
          width: 110,
          render: (_, row) => {
            if (row.reminder_type === 'overdue') return <Tag color="red">已逾期</Tag>
            if (row.reminder_type === 'amount_anomaly') return <Tag color="orange">金额异常</Tag>
            return <Tag color="blue">即将到期</Tag>
          },
        },
        {
          title: '操作',
          key: 'op',
          width: 280,
          render: (_, row) => (
            <Space>
              <Button type="link" onClick={() => onGenerateDraft?.(row.rule_id)}>
                生成草案
              </Button>
              <Button type="link" onClick={() => onViewRule?.(row.rule_id)}>
                查看规则
              </Button>
              <Button type="link" onClick={() => onMarkMatch?.(row.rule_id)}>
                标记匹配
              </Button>
            </Space>
          ),
        },
      ]}
      scroll={{ x: 1300 }}
    />
  )
}
