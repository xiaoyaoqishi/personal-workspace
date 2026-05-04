import { Drawer, Spin, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { dryRunRule } from '../../api/ledger'

const { Text } = Typography

function formatOccurredAt(v) {
  if (!v) return '-'
  return dayjs(v).format('YYYY-MM-DD HH:mm')
}

function formatAmount(v, dir) {
  if (v == null) return '-'
  const sign = dir === 'income' ? '+' : dir === 'expense' ? '-' : ''
  return `${sign}¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const COLUMNS = [
  { title: '时间', dataIndex: 'occurred_at', width: 140, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatOccurredAt(v)}</span> },
  { title: '原始文本', dataIndex: 'raw_text', ellipsis: true },
  { title: '原始商户', dataIndex: 'merchant_raw', width: 160, ellipsis: true },
  {
    title: '金额',
    key: 'amount',
    width: 120,
    render: (_, row) => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(row.amount, row.direction)}</span>
    ),
  },
  {
    title: '方向',
    dataIndex: 'direction',
    width: 70,
    render: (v) => v === 'income' ? <Tag color="green">收入</Tag> : v === 'expense' ? <Tag color="red">支出</Tag> : <Tag>{v || '-'}</Tag>,
  },
  { title: '已有分类', dataIndex: 'category_id', width: 90, render: (v) => v ? `#${v}` : '-' },
]

export default function RuleDryRunDrawer({ open, ruleParams, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open || !ruleParams?.pattern) return
    setLoading(true)
    setResult(null)
    dryRunRule({ ...ruleParams, limit: 50 })
      .then((res) => setResult(res))
      .catch(() => setResult({ matched_rows: [], total_matched_count: 0 }))
      .finally(() => setLoading(false))
  }, [open, ruleParams])

  return (
    <Drawer
      title="规则试跑"
      open={open}
      onClose={onClose}
      width={800}
      destroyOnHide
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin tip="正在匹配..." />
        </div>
      ) : result ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Text>
              共命中 <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{result.total_matched_count}</strong> 条，展示前 50 条样本
            </Text>
          </div>
          <Table
            rowKey="id"
            size="small"
            dataSource={result.matched_rows || []}
            columns={COLUMNS}
            pagination={false}
            scroll={{ x: 700 }}
          />
        </>
      ) : (
        <Text type="secondary">填写规则参数后将自动运行试跑</Text>
      )}
    </Drawer>
  )
}
