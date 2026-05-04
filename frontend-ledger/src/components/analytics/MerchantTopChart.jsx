import { DownloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import EmptyBlock from '../EmptyBlock'
import { LK_CATEGORY_COLORS } from '../../styles/theme'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

function exportCsv(items) {
  const header = '商户名称,交易次数,总金额,平均金额'
  const rows = items.map(
    (i) => `${i.merchant_name},${i.count},${i.total_amount},${i.avg_amount}`
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'top_merchants.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const AXIS_COLOR_DARK  = '#94a3b8'
const AXIS_COLOR_LIGHT = '#64748b'

export default function MerchantTopChart({ items, isDark = false }) {
  if (!items || items.length === 0) {
    return <EmptyBlock description="暂无商户数据" />
  }

  const data = items.map((item, i) => ({
    name: item.merchant_name,
    金额: item.total_amount,
    color: LK_CATEGORY_COLORS[i % LK_CATEGORY_COLORS.length],
  }))

  const axisColor = isDark ? AXIS_COLOR_DARK : AXIS_COLOR_LIGHT
  const tooltipBg = isDark ? '#1e293b' : '#fff'
  const tooltipBorder = isDark ? '#2d3f58' : '#e6ebf3'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCsv(items)}>
          导出
        </Button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `¥${v}`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: axisColor }} width={90} />
          <Tooltip
            formatter={(value) => [fmtMoney(value), '金额']}
            labelFormatter={(label) => `商户：${label}`}
            contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }}
          />
          <Bar dataKey="金额" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
