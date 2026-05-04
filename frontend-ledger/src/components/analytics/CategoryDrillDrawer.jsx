import { Drawer } from 'antd'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table } from 'antd'
import EmptyBlock from '../EmptyBlock'
import { LK_CATEGORY_COLORS } from '../../styles/theme'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

export default function CategoryDrillDrawer({ open, categoryName, detail, onClose }) {
  const subcategories = detail?.subcategories || []
  const transactions = detail?.transactions || []

  const barData = subcategories.map((s, i) => ({
    name: s.name,
    金额: s.amount,
    color: LK_CATEGORY_COLORS[i % LK_CATEGORY_COLORS.length],
  }))

  const txCols = [
    {
      title: '日期',
      dataIndex: 'occurred_at',
      width: 120,
      render: (v) => v?.slice(0, 10) || '',
    },
    { title: '商户', dataIndex: 'merchant', ellipsis: true },
    { title: '摘要', dataIndex: 'description', ellipsis: true },
    { title: '金额', dataIndex: 'amount', width: 110, render: (v) => fmtMoney(v) },
  ]

  return (
    <Drawer
      title={`分类下钻：${categoryName || ''}`}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnClose
    >
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>子分类金额分布</div>
        {barData.length === 0 ? (
          <EmptyBlock description="无子分类数据" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
              <Tooltip formatter={(value) => [fmtMoney(value), '金额']} />
              <Bar dataKey="金额" radius={[0, 4, 4, 0]}>
                {barData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
          最近 {transactions.length} 笔流水
          {detail?.total_amount != null && (
            <span style={{ fontWeight: 400, color: 'var(--lk-color-text-secondary)', marginLeft: 8 }}>
              合计 {fmtMoney(detail.total_amount)}
            </span>
          )}
        </div>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={transactions}
          columns={txCols}
          scroll={{ y: 360 }}
        />
      </div>
    </Drawer>
  )
}
