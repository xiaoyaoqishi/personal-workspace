import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Segmented, Space } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getAnalyticsCategoryBreakdown,
  getAnalyticsCategoryDetail,
  getAnalyticsDailyHeatmap,
  getAnalyticsMonthlyTrend,
  getAnalyticsPlatformBreakdown,
  getAnalyticsSummary,
  getAnalyticsTopMerchants,
  getAnalyticsUnrecognizedBreakdown,
} from '../api/ledger'
import PageHeader from '../components/PageHeader'
import KpiCards from '../components/analytics/KpiCards'
import TrendChart from '../components/analytics/TrendChart'
import CategoryPieChart from '../components/analytics/CategoryPieChart'
import PlatformBarChart from '../components/analytics/PlatformBarChart'
import MerchantTopChart from '../components/analytics/MerchantTopChart'
import CalendarHeatmap from '../components/analytics/CalendarHeatmap'
import UnrecognizedSection from '../components/analytics/UnrecognizedSection'
import CategoryDrillDrawer from '../components/analytics/CategoryDrillDrawer'
import SkeletonCard from '../components/SkeletonCard'
import { useThemeContext } from '../App'

const { RangePicker } = DatePicker

// ---- Preset helpers ----
const PRESETS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'last_month' },
  { label: '近30天', value: '30d' },
  { label: '近90天', value: '90d' },
  { label: '今年', value: 'year' },
  { label: '自定义', value: 'custom' },
]

function presetToRange(preset) {
  const now = dayjs()
  switch (preset) {
    case 'today':
      return [now.startOf('day'), now.endOf('day')]
    case 'week':
      return [now.startOf('week'), now.endOf('week')]
    case 'month':
      return [now.startOf('month'), now.endOf('day')]
    case 'last_month':
      return [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')]
    case '30d':
      return [now.subtract(29, 'day'), now]
    case '90d':
      return [now.subtract(89, 'day'), now]
    case 'year':
      return [now.startOf('year'), now.endOf('day')]
    default:
      return [now.startOf('month'), now.endOf('day')]
  }
}

function exportCsv(data, filename) {
  if (!data || data.length === 0) return
  const keys = Object.keys(data[0])
  const rows = data.map((row) => keys.map((k) => row[k] ?? '').join(','))
  const blob = new Blob([[keys.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AnalyticsPage() {
  const { isDark } = useThemeContext()
  const [loading, setLoading] = useState(false)
  const [preset, setPreset] = useState('month')
  const [customRange, setCustomRange] = useState(null)
  const [granularity, setGranularity] = useState('month')

  const [summary, setSummary] = useState(null)
  const [category, setCategory] = useState({ items: [], total: 0 })
  const [platform, setPlatform] = useState({ items: [], total: 0 })
  const [topMerchants, setTopMerchants] = useState([])
  const [trend, setTrend] = useState({ items: [], categories: [] })
  const [heatmap, setHeatmap] = useState({ items: [], max_expense: 0 })
  const [unrecognized, setUnrecognized] = useState(null)

  // Drill state
  const [drillCategory, setDrillCategory] = useState(null)
  const [drillDetail, setDrillDetail] = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customRange) return customRange
    return presetToRange(preset)
  }, [preset, customRange])

  const queryParams = useMemo(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return {}
    return {
      date_from: dateRange[0].format('YYYY-MM-DD'),
      date_to: dateRange[1].format('YYYY-MM-DD'),
    }
  }, [dateRange])

  const load = useCallback(async () => {
    if (!queryParams.date_from) return
    setLoading(true)
    try {
      const [sumRes, catRes, platRes, merRes, trendRes, heatRes, unrec] = await Promise.all([
        getAnalyticsSummary(queryParams),
        getAnalyticsCategoryBreakdown(queryParams),
        getAnalyticsPlatformBreakdown(queryParams),
        getAnalyticsTopMerchants({ ...queryParams, limit: 10 }),
        getAnalyticsMonthlyTrend({ ...queryParams, granularity }),
        getAnalyticsDailyHeatmap(queryParams),
        getAnalyticsUnrecognizedBreakdown(queryParams),
      ])
      setSummary(sumRes || {})
      setCategory({ items: catRes?.items || [], total: catRes?.total || 0 })
      setPlatform({ items: platRes?.items || [], total: platRes?.total || 0 })
      setTopMerchants(merRes?.items || [])
      setTrend({ items: trendRes?.items || [], categories: trendRes?.categories || [] })
      setHeatmap({ items: heatRes?.items || [], max_expense: heatRes?.max_expense || 0 })
      setUnrecognized(unrec || {})
    } finally {
      setLoading(false)
    }
  }, [queryParams, granularity])

  useEffect(() => {
    load()
  }, [load])

  const handleDrill = useCallback(
    async (categoryName) => {
      setDrillCategory(categoryName)
      setDrillLoading(true)
      try {
        const res = await getAnalyticsCategoryDetail({ ...queryParams, category_name: categoryName })
        setDrillDetail(res || {})
      } finally {
        setDrillLoading(false)
      }
    },
    [queryParams]
  )

  const handleCloseDrill = () => {
    setDrillCategory(null)
    setDrillDetail(null)
  }

  if (loading && !summary) {
    return (
      <div className="page-section">
        <SkeletonCard rows={8} />
      </div>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <PageHeader
        title="基础分析"
        subtitle="基于已入账交易的稳定口径统计"
        extra={
          <Space wrap>
            <Segmented
              size="small"
              options={PRESETS}
              value={preset}
              onChange={(v) => {
                setPreset(v)
                if (v !== 'custom') setCustomRange(null)
              }}
            />
            {preset === 'custom' && (
              <RangePicker
                size="small"
                value={customRange}
                onChange={(v) => setCustomRange(v)}
              />
            )}
            <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      />

      {/* KPI Cards */}
      <KpiCards summary={summary} loading={loading} />

      {/* Trend */}
      <Card
        className="page-card"
        title="收支趋势"
        loading={loading}
        extra={
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() =>
              exportCsv(
                trend.items.map((i) => ({ 周期: i.period, 支出: i.total_expense, 收入: i.total_income })),
                'trend.csv'
              )
            }
          >
            导出
          </Button>
        }
      >
        <TrendChart
          items={trend.items}
          granularity={granularity}
          onGranularityChange={setGranularity}
          isDark={isDark}
        />
      </Card>

      {/* Category + Platform */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card
          className="page-card"
          title="分类占比（支出）"
          loading={loading}
          extra={
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => exportCsv(category.items, 'category_breakdown.csv')}
            >
              导出
            </Button>
          }
        >
          <CategoryPieChart
            items={category.items}
            total={category.total}
            onDrill={handleDrill}
            isDark={isDark}
          />
        </Card>

        <Card
          className="page-card"
          title="平台占比（支出）"
          loading={loading}
          extra={
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => exportCsv(platform.items, 'platform_breakdown.csv')}
            >
              导出
            </Button>
          }
        >
          <PlatformBarChart items={platform.items} isDark={isDark} />
        </Card>
      </div>

      {/* Merchant Top */}
      <Card className="page-card" title="高频商户 Top 10" loading={loading}>
        <MerchantTopChart items={topMerchants} isDark={isDark} />
      </Card>

      {/* Calendar Heatmap */}
      <Card className="page-card" title="日消费热图" loading={loading}>
        <CalendarHeatmap
          items={heatmap.items}
          maxExpense={heatmap.max_expense}
          dateFrom={queryParams.date_from}
          dateTo={queryParams.date_to}
          isDark={isDark}
        />
      </Card>

      {/* Unrecognized */}
      <Card className="page-card" title="未识别分析" loading={loading}>
        <UnrecognizedSection data={unrecognized} />
      </Card>

      {/* Drill Drawer */}
      <CategoryDrillDrawer
        open={!!drillCategory}
        categoryName={drillCategory}
        detail={drillLoading ? null : drillDetail}
        onClose={handleCloseDrill}
      />
    </Space>
  )
}
