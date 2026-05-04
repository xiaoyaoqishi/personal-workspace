import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import EmptyBlock from '../EmptyBlock'
import { LK_CATEGORY_COLORS } from '../../styles/theme'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

export default function CategoryPieChart({ items, total, onDrill, isDark = false }) {
  if (!items || items.length === 0) {
    return <EmptyBlock description="暂无分类数据" />
  }

  const data = items.map((item, i) => ({
    name: item.category_name,
    value: item.amount,
    ratio: item.ratio,
    color: LK_CATEGORY_COLORS[i % LK_CATEGORY_COLORS.length],
  }))

  const tooltipBg = isDark ? '#1e293b' : '#fff'
  const tooltipBorder = isDark ? '#2d3f58' : '#e6ebf3'
  const handlePieClick = (entry) => {
    if (!onDrill) return
    const categoryName = entry?.name ?? entry?.payload?.name
    if (!categoryName) return
    onDrill(categoryName)
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            nameKey="name"
            onClick={handlePieClick}
            style={{ cursor: onDrill ? 'pointer' : 'default' }}
            label={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [fmtMoney(value), name]}
            labelFormatter={() => '分类支出'}
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
            }}
          />
          <Legend
            layout="horizontal"
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {total != null && (
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 13, color: 'var(--lk-color-text-secondary)' }}>
          总支出 <strong style={{ color: 'var(--lk-color-danger)' }}>{fmtMoney(total)}</strong>
        </div>
      )}
      {onDrill && (
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: 'var(--lk-color-text-muted)' }}>
          点击扇区可查看子分类明细
        </div>
      )}
    </div>
  )
}
