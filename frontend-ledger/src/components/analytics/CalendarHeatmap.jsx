import { useState } from 'react'
import dayjs from 'dayjs'

const CELL_SIZE = 18
const CELL_GAP = 4
const STEP = CELL_SIZE + CELL_GAP
const LEFT_LABEL_X = 7
const GRID_OFFSET_X = 40
const GRID_OFFSET_Y = 26
const FONT_SIZE_LABEL = 12
const FONT_SIZE_LEGEND = 12
const LEGEND_GAP = 5
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

// Light palette
const LIGHT_COLORS = ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca']
// Dark palette (slightly brighter)
const DARK_COLORS  = ['#1e1b4b', '#2e2779', '#3730a3', '#4f46e5', '#6366f1', '#818cf8']

function getColor(expense, maxExpense, isDark) {
  const palette = isDark ? DARK_COLORS : LIGHT_COLORS
  if (!expense || maxExpense === 0) return palette[0]
  const ratio = Math.min(expense / maxExpense, 1)
  if (ratio < 0.2) return palette[1]
  if (ratio < 0.4) return palette[2]
  if (ratio < 0.6) return palette[3]
  if (ratio < 0.8) return palette[4]
  return palette[5]
}

function buildGrid(items, dateFrom, dateTo) {
  const dataMap = {}
  for (const item of items || []) {
    dataMap[item.date] = item
  }

  const start = dayjs(dateFrom)
  const end = dayjs(dateTo)
  const startMonday = start.startOf('week').add(1, 'day')
  const endSunday = end.endOf('week').add(1, 'day')

  const weeks = []
  let cur = startMonday
  while (cur.isBefore(endSunday) || cur.isSame(endSunday, 'day')) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.format('YYYY-MM-DD')
      week.push({
        date: dateStr,
        inRange: !cur.isBefore(start) && !cur.isAfter(end),
        ...dataMap[dateStr],
      })
      cur = cur.add(1, 'day')
    }
    weeks.push(week)
  }
  return weeks
}

export default function CalendarHeatmap({ items, maxExpense, dateFrom, dateTo, isDark = false }) {
  const [tooltip, setTooltip] = useState(null)

  if (!dateFrom || !dateTo) return null

  const weeks = buildGrid(items, dateFrom, dateTo)
  const svgWidth = weeks.length * STEP + GRID_OFFSET_X + 14
  const svgHeight = 7 * STEP + GRID_OFFSET_Y + CELL_SIZE + 24
  const outOfRangeColor = isDark ? '#1e293b' : '#f8fafc'
  const tooltipBg = isDark ? '#334155' : 'rgba(15,23,42,0.88)'

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
        {WEEK_LABELS.map((label, i) => (
          <text
            key={label}
            x={LEFT_LABEL_X}
            y={i * STEP + STEP / 2 + GRID_OFFSET_Y + 4}
            fontSize={FONT_SIZE_LABEL}
            fill="var(--lk-color-text-muted)"
            dominantBaseline="middle"
          >
            {label}
          </text>
        ))}

        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            const x = wi * STEP + GRID_OFFSET_X
            const y = di * STEP + GRID_OFFSET_Y
            const color = cell.inRange
              ? getColor(cell.expense || 0, maxExpense || 0, isDark)
              : outOfRangeColor
            return (
              <rect
                key={`${wi}-${di}`}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={color}
                style={{ cursor: cell.inRange && cell.expense ? 'pointer' : 'default' }}
                onMouseEnter={(e) => {
                  if (cell.inRange) {
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      date: cell.date,
                      expense: cell.expense || 0,
                      count: cell.count || 0,
                    })
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })
        )}

        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio, i) => (
          <rect
            key={ratio}
            x={GRID_OFFSET_X + i * (CELL_SIZE + LEGEND_GAP)}
            y={svgHeight - CELL_SIZE - 4}
            width={CELL_SIZE}
            height={CELL_SIZE}
            rx={2}
            fill={getColor(ratio * (maxExpense || 1), maxExpense || 1, isDark)}
          />
        ))}
        <text
          x={GRID_OFFSET_X}
          y={svgHeight - CELL_SIZE - 8}
          fontSize={FONT_SIZE_LEGEND}
          fill="var(--lk-color-text-muted)"
        >
          少
        </text>
        <text
          x={GRID_OFFSET_X + 6 * (CELL_SIZE + LEGEND_GAP)}
          y={svgHeight - CELL_SIZE - 8}
          fontSize={FONT_SIZE_LEGEND}
          fill="var(--lk-color-text-muted)"
        >
          多
        </text>
      </svg>

      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            background: tooltipBg,
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
          }}
        >
          <div>{tooltip.date}</div>
          <div>支出：¥{Number(tooltip.expense).toFixed(2)}</div>
          <div>笔数：{tooltip.count}</div>
        </div>
      )}
    </div>
  )
}
