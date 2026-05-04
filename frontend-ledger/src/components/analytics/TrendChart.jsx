import { Empty, Segmented } from 'antd'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import EmptyBlock from '../EmptyBlock'
import { LK_DANGER, LK_SUCCESS } from '../../styles/theme'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

const GRANULARITY_OPTIONS = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
]

const AXIS_COLOR_DARK  = '#94a3b8'
const AXIS_COLOR_LIGHT = '#64748b'

export default function TrendChart({ items, granularity, onGranularityChange, loading, isDark = false }) {
  const data = (items || []).map((item) => ({
    period: item.period,
    支出: item.total_expense,
    收入: item.total_income,
  }))

  const axisColor   = isDark ? AXIS_COLOR_DARK : AXIS_COLOR_LIGHT
  const tooltipBg   = isDark ? '#1e293b' : '#fff'
  const tooltipBorder = isDark ? '#2d3f58' : '#e6ebf3'
  const gridColor   = 'var(--lk-color-border)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Segmented
          size="small"
          options={GRANULARITY_OPTIONS}
          value={granularity}
          onChange={onGranularityChange}
        />
      </div>
      {data.length === 0 ? (
        <EmptyBlock description="暂无趋势数据" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: axisColor }} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `¥${v}`} />
            <Tooltip
              formatter={(value, name) => [fmtMoney(value), name]}
              labelFormatter={(label) => `周期：${label}`}
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey="支出"
              fill={`${LK_DANGER}22`}
              stroke={LK_DANGER}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="收入"
              stroke={LK_SUCCESS}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
