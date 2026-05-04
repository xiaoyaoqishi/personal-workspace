import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import EmptyBlock from '../EmptyBlock'
import { LK_CATEGORY_COLORS } from '../../styles/theme'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

const AXIS_COLOR_DARK  = '#94a3b8'
const AXIS_COLOR_LIGHT = '#64748b'

export default function PlatformBarChart({ items, isDark = false }) {
  if (!items || items.length === 0) {
    return <EmptyBlock description="暂无平台数据" />
  }

  const data = items
    .filter((item) => item.amount > 0)
    .map((item, i) => ({
      name: item.platform_name,
      金额: item.amount,
      color: LK_CATEGORY_COLORS[i % LK_CATEGORY_COLORS.length],
    }))

  const axisColor = isDark ? AXIS_COLOR_DARK : AXIS_COLOR_LIGHT
  const tooltipBg = isDark ? '#1e293b' : '#fff'
  const tooltipBorder = isDark ? '#2d3f58' : '#e6ebf3'

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `¥${v}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: axisColor }} width={52} />
        <Tooltip
          formatter={(value) => [fmtMoney(value), '金额']}
          labelFormatter={(label) => `平台：${label}`}
          contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }}
        />
        <Bar dataKey="金额" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
