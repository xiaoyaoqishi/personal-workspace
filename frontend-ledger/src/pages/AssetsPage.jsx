import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  RiseOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { createAsset, deleteAsset, getAsset, getAssetSummary, listAssets, updateAsset } from '../api/assets'
import AssetDetailDrawer from '../components/assets/AssetDetailDrawer'
import AssetEventsPanel from '../components/assets/AssetEventsPanel'
import AssetForm, { buildAssetFormValues, getDefaultAssetFormValues } from '../components/assets/AssetForm'
import { buildAssetMetricsSnapshot, computeAssetAnalytics } from '../components/assets/assetAnalytics'
import PageHeader from '../components/PageHeader'
import {
  ASSET_STATUS_OPTIONS,
  displayEmpty,
  formatDate,
  formatMoney,
  formatNumber,
  getAssetStatusColor,
  getAssetStatusLabel,
  getAssetTypeLabel,
} from '../components/assets/assetConstants'
import './asset-library.css'

const STATUS_COLORS = { in_use: '#3b82f6', idle: '#f59e0b', sold: '#22c55e', draft: '#94a3b8' }
const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

const PAGE_LIMIT = 24

function mergeAssetSummaryWithDetail(summaryAsset, detailAsset) {
  if (!summaryAsset) return detailAsset || null
  if (!detailAsset) return summaryAsset
  return {
    ...detailAsset,
    ...summaryAsset,
    metrics: detailAsset.metrics || summaryAsset.metrics,
    purchase_price: detailAsset.purchase_price,
    extra_cost: detailAsset.extra_cost,
    sale_price: detailAsset.sale_price,
    target_daily_cost: detailAsset.target_daily_cost,
    expected_use_days: detailAsset.expected_use_days,
    purchase_channel: detailAsset.purchase_channel,
    serial_number: detailAsset.serial_number,
    start_use_date: detailAsset.start_use_date,
    end_date: detailAsset.end_date,
    warranty_until: detailAsset.warranty_until,
    note: detailAsset.note,
    images: Array.isArray(detailAsset.images) && detailAsset.images.length ? detailAsset.images : summaryAsset.images,
    tags: Array.isArray(detailAsset.tags) && detailAsset.tags.length ? detailAsset.tags : summaryAsset.tags,
  }
}

function buildAssetListParams(nextFilters = {}) {
  return {
    keyword: nextFilters.keyword || undefined,
    status: nextFilters.status || undefined,
    asset_type: nextFilters.asset_type || undefined,
    category: nextFilters.category || undefined,
    limit: PAGE_LIMIT,
    offset: 0,
  }
}

async function fetchAllAssetCatalogPages() {
  const allItems = []
  let total = 0
  let offset = 0

  do {
    const payload = await listAssets({ limit: 200, offset })
    const batch = Array.isArray(payload?.items) ? payload.items : []
    total = Number(payload?.total || batch.length || 0)
    allItems.push(...batch)
    if (!batch.length) {
      break
    }
    offset += batch.length
  } while (allItems.length < total)

  return allItems
}

function AssetStatusTag({ value }) {
  return <Tag color={getAssetStatusColor(value)}>{getAssetStatusLabel(value)}</Tag>
}

export default function AssetsPage() {
  const [filters, setFilters] = useState({ keyword: '', status: '', asset_type: '', category: '' })
  const [assets, setAssets] = useState([])
  const [allAssets, setAllAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [, setLoadingCatalog] = useState(false)
  const [listError, setListError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [assetForm] = Form.useForm()
  const [formDrawerOpen, setFormDrawerOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [editingAssetId, setEditingAssetId] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailAsset, setDetailAsset] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [lifecycleFormOpen, setLifecycleFormOpen] = useState(false)

  const dashboardAnalytics = useMemo(() => computeAssetAnalytics(allAssets), [allAssets])
  // 按资产类型分组：数量 + 平均总成本
  const byTypeData = useMemo(() => {
    const map = {}
    dashboardAnalytics.items.forEach((entry) => {
      const t = entry.assetType || entry.asset_type || 'other'
      if (!map[t]) map[t] = { type: t, count: 0, totalCost: 0 }
      map[t].count++
      map[t].totalCost += entry.totalCost || entry.total_cost || 0
    })
    return Object.values(map)
      .map((x) => ({ ...x, avgCost: x.count ? Math.round(x.totalCost / x.count) : 0, label: getAssetTypeLabel(x.type) }))
      .sort((a, b) => b.totalCost - a.totalCost)
  }, [dashboardAnalytics])

  // 购入年份趋势：按年分组的数量
  const byYearData = useMemo(() => {
    const map = {}
    dashboardAnalytics.items.forEach((entry) => {
      const pd = entry.purchaseDate || entry.purchase_date
      if (!pd) return
      const year = String(pd).slice(0, 4)
      if (!year || year === 'null') return
      map[year] = (map[year] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([year, count]) => ({ year, count }))
  }, [dashboardAnalytics])

  // 使用中资产效率（in_use，日均成本排序）
  const inUseEfficiency = useMemo(() => {
    return dashboardAnalytics.items
      .filter((e) => e.status === 'in_use' && (e.cashDailyCost != null || e.cash_daily_cost != null))
      .sort((a, b) => ((b.cashDailyCost || b.cash_daily_cost || 0) - (a.cashDailyCost || a.cash_daily_cost || 0)))
      .slice(0, 10)
      .map((e) => ({
        ...e,
        name: e.name || '未命名',
        cashDailyCost: e.cashDailyCost != null ? e.cashDailyCost : e.cash_daily_cost,
        totalCost: e.totalCost != null ? e.totalCost : e.total_cost,
        useDays: e.useDays != null ? e.useDays : e.use_days,
      }))
  }, [dashboardAnalytics])

  // 附加成本占比（有附加成本的资产，取前 10）
  const extraCostRatio = useMemo(() => {
    return dashboardAnalytics.items
      .filter((e) => {
        const extra = e.extraCost != null ? e.extraCost : e.extra_cost
        const total = e.totalCost != null ? e.totalCost : e.total_cost
        return extra > 0 && total > 0
      })
      .map((e) => {
        const extra = e.extraCost != null ? e.extraCost : (e.extra_cost || 0)
        const total = e.totalCost != null ? e.totalCost : (e.total_cost || 0)
        return { ...e, extraCost: extra, totalCost: total, ratio: Math.round((extra / total) * 100), name: e.name || '未命名' }
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10)
  }, [dashboardAnalytics])

  // 已卖出 ROI
  const soldWithROI = useMemo(() => {
    return dashboardAnalytics.soldProfitLossAssets
      .filter((e) => {
        const total = e.totalCost != null ? e.totalCost : e.total_cost
        return total > 0
      })
      .map((e) => {
        const pl = e.profitLoss != null ? e.profitLoss : (e.profit_loss || 0)
        const total = e.totalCost != null ? e.totalCost : (e.total_cost || 0)
        return { ...e, roi: Math.round((pl / total) * 100), name: e.name || '未命名', profitLoss: pl }
      })
      .sort((a, b) => b.roi - a.roi)
  }, [dashboardAnalytics])

  const categoryOptions = useMemo(() => {
    const values = new Set()
    allAssets.forEach((item) => {
      if (item?.category) {
        values.add(item.category)
      }
    })
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'zh-CN')).map((value) => ({ value, label: value }))
  }, [allAssets])

  const lifecycleAsset = useMemo(
    () => allAssets.find((item) => item.id === selectedAssetId) || assets.find((item) => item.id === selectedAssetId) || null,
    [allAssets, assets, selectedAssetId],
  )

  const loadAssets = async (nextFilters = filters) => {
    setLoadingList(true)
    setListError('')
    try {
      const payload = await listAssets(buildAssetListParams(nextFilters))
      setAssets(Array.isArray(payload?.items) ? payload.items : [])
    } catch (error) {
      setListError(error?.userMessage || '资产列表加载失败')
    } finally {
      setLoadingList(false)
    }
  }

  const loadSummary = async () => {
    setLoadingSummary(true)
    setSummaryError('')
    try {
      const payload = await getAssetSummary()
      setSummary(payload || null)
    } catch (error) {
      setSummaryError(error?.userMessage || '总览数据加载失败')
    } finally {
      setLoadingSummary(false)
    }
  }

  const loadCatalog = async () => {
    setLoadingCatalog(true)
    try {
      const items = await fetchAllAssetCatalogPages()
      setAllAssets(items)
    } catch (error) {
      message.error(error?.userMessage || '资产目录加载失败')
    } finally {
      setLoadingCatalog(false)
    }
  }

  const refreshData = async (nextFilters = filters) => {
    await Promise.all([loadSummary(), loadAssets(nextFilters), loadCatalog()])
  }

  const openAssetDetail = async (assetId) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError('')
    try {
      const detailPayload = await getAsset(assetId)
      const summaryAsset = allAssets.find((item) => item.id === assetId) || assets.find((item) => item.id === assetId) || null
      setDetailAsset(mergeAssetSummaryWithDetail(summaryAsset, detailPayload))
    } catch (error) {
      setDetailError(error?.userMessage || '资产详情加载失败')
      setDetailAsset(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  useEffect(() => {
    if (selectedAssetId) {
      const exists = allAssets.some((item) => item.id === selectedAssetId)
      if (exists) return
    }
    if (allAssets.length) {
      setSelectedAssetId(allAssets[0].id)
    } else {
      setSelectedAssetId(null)
    }
  }, [allAssets, selectedAssetId])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSearch = async () => {
    await loadAssets(filters)
  }

  const handleResetFilters = async () => {
    const nextFilters = { keyword: '', status: '', asset_type: '', category: '' }
    setFilters(nextFilters)
    await loadAssets(nextFilters)
  }

  const openCreateDrawer = () => {
    setEditingAssetId(null)
    assetForm.resetFields()
    assetForm.setFieldsValue(getDefaultAssetFormValues())
    setFormDrawerOpen(true)
  }

  const openEditDrawer = async (assetId) => {
    const summaryAsset = allAssets.find((item) => item.id === assetId) || assets.find((item) => item.id === assetId) || null
    setEditingAssetId(assetId)
    assetForm.resetFields()
    assetForm.setFieldsValue(buildAssetFormValues(summaryAsset))
    setFormDrawerOpen(true)
    try {
      const detailPayload = await getAsset(assetId)
      assetForm.setFieldsValue(buildAssetFormValues(detailPayload))
    } catch (error) {
      message.error(error?.userMessage || '资产详情加载失败，已回退到列表数据')
    }
  }

  const handleDelete = async (assetId) => {
    setDeletingId(assetId)
    try {
      await deleteAsset(assetId)
      message.success('资产已软删除')
      if (detailAsset?.id === assetId) {
        setDetailOpen(false)
        setDetailAsset(null)
      }
      await refreshData(filters)
    } catch (error) {
      message.error(error?.userMessage || '资产删除失败，请稍后重试')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmitAsset = async (payload) => {
    setFormSubmitting(true)
    try {
      if (editingAssetId) {
        await updateAsset(editingAssetId, payload)
        message.success('资产信息已更新')
      } else {
        await createAsset(payload)
        message.success('资产已创建')
      }
      setFormDrawerOpen(false)
      await refreshData(filters)
      if (editingAssetId) {
        await openAssetDetail(editingAssetId)
      }
    } catch (error) {
      message.error(error?.userMessage || '资产保存失败，请稍后重试')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleAssetMutated = async (assetId) => {
    await refreshData(filters)
    if (detailOpen && detailAsset?.id === assetId) {
      await openAssetDetail(assetId)
    }
  }

  const handleOpenIdle = async () => {
    const nextFilters = { ...filters, status: 'idle' }
    setFilters(nextFilters)
    setActiveTab('assets')
    await loadAssets(nextFilters)
  }

  const handleLifecycleQuickAction = () => {
    setActiveTab('lifecycle')
    setLifecycleFormOpen(true)
    if (!selectedAssetId && allAssets.length) {
      setSelectedAssetId(allAssets[0].id)
    }
  }

  const assetColumns = [
    {
      title: '资产',
      key: 'name',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={4}>
          <Button type="link" className="asset-library-rank-link" onClick={() => openAssetDetail(row.id)}>
            {row.name}
          </Button>
          <Space wrap size={[6, 6]}>
            <AssetStatusTag value={row.status} />
            <Tag>{getAssetTypeLabel(row.asset_type)}</Tag>
            {row.category ? <Tag>{row.category}</Tag> : null}
          </Space>
        </Space>
      ),
    },
    {
      title: '品牌',
      dataIndex: 'brand',
      width: 120,
      render: (value) => displayEmpty(value),
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 140,
      render: (value) => displayEmpty(value),
    },
    {
      title: '购买时间',
      dataIndex: 'purchase_date',
      width: 130,
      render: (value) => formatDate(value),
    },
    {
      title: '购买渠道',
      dataIndex: 'purchase_channel',
      width: 120,
      render: (value) => displayEmpty(value),
    },
    {
      title: '成本',
      key: 'cost',
      width: 180,
      render: (_, row) => {
        const metrics = buildAssetMetricsSnapshot(row)
        return (
          <Space direction="vertical" size={2}>
            <span>累计投入 {formatMoney(metrics.total_cost)}</span>
            <Typography.Text type="secondary">附加成本 {formatMoney(row.extra_cost)}</Typography.Text>
          </Space>
        )
      },
    },
    {
      title: '使用情况',
      key: 'usage',
      width: 160,
      render: (_, row) => {
        const metrics = buildAssetMetricsSnapshot(row)
        return (
          <Space direction="vertical" size={2}>
            <span>使用天数 {formatNumber(metrics.use_days)}</span>
            <Typography.Text type="secondary">现金日均 {formatMoney(metrics.cash_daily_cost)}</Typography.Text>
          </Space>
        )
      },
    },
    {
      title: '卖出复盘',
      key: 'sale',
      width: 160,
      render: (_, row) => {
        const metrics = buildAssetMetricsSnapshot(row)
        return (
          <Space direction="vertical" size={2}>
            <span>卖出价格 {formatMoney(row.sale_price)}</span>
            <Typography.Text type="secondary">盈亏 {formatMoney(metrics.profit_loss)}</Typography.Text>
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, row) => (
        <Space size={8} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openAssetDetail(row.id)}>
            详情
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(row.id)}>
            编辑
          </Button>
          <Popconfirm
            title="软删除资产"
            description="此操作会将资产标记为已删除，默认列表将不再显示。确认继续吗？"
            okText="确认软删除"
            cancelText="取消"
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === row.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const categoryBreakdown = Array.isArray(summary?.category_breakdown) && summary.category_breakdown.length
    ? summary.category_breakdown.map((item) => ({
        ...item,
        key: item.category,
        totalCost: item.total_cost,
        purchaseCost: item.total_purchase_cost,
        extraCost: item.total_extra_cost,
      }))
    : dashboardAnalytics.byCategory.map((item) => ({
        key: item.key,
        category: item.key,
        totalCost: item.totalCost,
        purchaseCost: item.purchaseCost,
        extraCost: item.extraCost,
        count: item.count,
      }))

  const statusBreakdown = Array.isArray(summary?.status_breakdown) && summary.status_breakdown.length
    ? summary.status_breakdown.map((item) => ({ ...item, key: item.status }))
    : dashboardAnalytics.byStatus.map((item) => ({ key: item.key, status: item.key, count: item.count }))

  const overviewTab = (
    <div className="al-overview-root">
      <div className="al-stat-strip">
        {[
          { label: '累计投入', value: formatMoney(summary?.total_cost ?? dashboardAnalytics.portfolioTotals.totalCost) },
          { label: '买入成本', value: formatMoney(summary?.total_purchase_cost ?? dashboardAnalytics.portfolioTotals.totalPurchaseCost) },
          { label: '附加成本', value: formatMoney(summary?.total_extra_cost ?? dashboardAnalytics.portfolioTotals.totalExtraCost) },
          {
            label: '已实现盈亏',
            value: formatMoney(summary?.total_realized_profit_loss ?? dashboardAnalytics.portfolioTotals.totalRealizedProfitLoss),
            color:
              (summary?.total_realized_profit_loss ?? dashboardAnalytics.portfolioTotals.totalRealizedProfitLoss) >= 0
                ? '#22c55e'
                : '#ef4444',
          },
          { label: '使用中', value: formatNumber(summary?.active_assets ?? dashboardAnalytics.portfolioTotals.activeCount), color: '#3b82f6' },
          { label: '闲置', value: formatNumber(summary?.idle_assets ?? dashboardAnalytics.portfolioTotals.idleCount), color: '#f59e0b' },
          { label: '已卖出', value: formatNumber(summary?.sold_assets ?? dashboardAnalytics.portfolioTotals.soldCount), color: '#22c55e' },
        ].map((item, idx) => (
          <div key={item.label} className={`al-stat-item${idx >= 4 ? ' al-stat-item-count' : ''}`}>
            <span className="al-stat-label">{item.label}</span>
            <span className="al-stat-value" style={item.color ? { color: item.color } : {}}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="al-overview-main">
        <div className="al-card">
          <div className="al-card-title">状态分布</div>
          {statusBreakdown.length ? (
            <>
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="count" nameKey="status" innerRadius={64} outerRadius={100} paddingAngle={3}>
                      {statusBreakdown.map((item) => (
                        <Cell key={item.status} fill={STATUS_COLORS[item.status] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [formatNumber(v), getAssetStatusLabel(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="al-donut-center">
                  <span className="al-donut-total">{statusBreakdown.reduce((s, i) => s + (i.count || 0), 0)}</span>
                  <span className="al-donut-label">资产总数</span>
                </div>
              </div>
              <div className="al-legend-grid">
                {statusBreakdown.map((item) => {
                  const total = statusBreakdown.reduce((s, i) => s + (i.count || 0), 0)
                  return (
                    <div key={item.status} className="al-legend-row">
                      <span className="al-legend-dot" style={{ background: STATUS_COLORS[item.status] || '#94a3b8' }} />
                      <span className="al-legend-name">{getAssetStatusLabel(item.status)}</span>
                      <span className="al-legend-count">{item.count}</span>
                      <span className="al-legend-pct">{total ? Math.round((item.count / total) * 100) : 0}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无状态分布数据" />
          )}
        </div>

        <div className="al-card">
          <div className="al-card-title">
            <span>闲置预警</span>
            {dashboardAnalytics.topIdleAssets.length > 0 && (
              <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>
                {summary?.idle_assets ?? dashboardAnalytics.portfolioTotals.idleCount}
              </span>
            )}
          </div>
          {dashboardAnalytics.topIdleAssets.length ? (
            <div className="al-idle-list">
              {dashboardAnalytics.topIdleAssets.slice(0, 8).map((item) => (
                <div className="al-idle-row" key={item.id}>
                  <div className="al-idle-main">
                    <button className="al-link-btn" onClick={() => openAssetDetail(item.id)}>
                      {item.name}
                    </button>
                    <span className="al-idle-meta">
                      {item.category} · {getAssetTypeLabel(item.asset_type)}
                    </span>
                  </div>
                  <div className="al-idle-right">
                    <span className="al-idle-days" style={{ color: (item.idle_days || item.idleDays || 0) > 90 ? '#ef4444' : '#f59e0b' }}>
                      {item.idle_days || item.idleDays || 0} 天
                    </span>
                    <span className="al-idle-cost">{formatMoney(buildAssetMetricsSnapshot(item).total_cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无闲置资产" />
          )}
        </div>
      </div>

      <div className="al-overview-main">
        <div className="al-card">
          <div className="al-card-title">日均成本排行</div>
          {dashboardAnalytics.topDailyCostAssets.length
            ? (() => {
                const items = dashboardAnalytics.topDailyCostAssets.slice(0, 5)
                const maxDailyCost = Math.max(...items.map((i) => buildAssetMetricsSnapshot(i).cash_daily_cost || 0), 1)
                return (
                  <div className="al-rank-list">
                    {items.map((item) => {
                      const metrics = buildAssetMetricsSnapshot(item)
                      return (
                        <div className="al-rank-row" key={item.id}>
                          <div className="al-rank-header">
                            <button className="al-link-btn" onClick={() => openAssetDetail(item.id)}>
                              {item.name}
                            </button>
                            <span className="al-rank-value">{formatMoney(metrics.cash_daily_cost)}/天</span>
                          </div>
                          <div className="al-rank-bar-bg">
                            <div
                              className="al-rank-bar-fill"
                              style={{ width: `${Math.round((metrics.cash_daily_cost / maxDailyCost) * 100)}%`, background: '#3b82f6' }}
                            />
                          </div>
                          <span className="al-rank-sub">
                            投入 {formatMoney(metrics.total_cost)} · 使用 {metrics.use_days || 0} 天
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日均成本数据" />}
        </div>

        <div className="al-card">
          <div className="al-card-title">附加成本排行</div>
          {dashboardAnalytics.topExtraCostAssets.length
            ? (() => {
                const items = dashboardAnalytics.topExtraCostAssets.slice(0, 5)
                const maxExtraCost = Math.max(...items.map((i) => i.extra_cost || 0), 1)
                return (
                  <div className="al-rank-list">
                    {items.map((item) => {
                      const metrics = buildAssetMetricsSnapshot(item)
                      const pct = metrics.total_cost ? Math.round((item.extra_cost / metrics.total_cost) * 100) : 0
                      return (
                        <div className="al-rank-row" key={item.id}>
                          <div className="al-rank-header">
                            <button className="al-link-btn" onClick={() => openAssetDetail(item.id)}>
                              {item.name}
                            </button>
                            <span className="al-rank-value">{formatMoney(item.extra_cost)}</span>
                          </div>
                          <div className="al-rank-bar-bg">
                            <div
                              className="al-rank-bar-fill"
                              style={{ width: `${Math.round((item.extra_cost / maxExtraCost) * 100)}%`, background: '#8b5cf6' }}
                            />
                          </div>
                          <span className="al-rank-sub">总投入 {formatMoney(metrics.total_cost)} · 占比 {pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附加成本数据" />}
        </div>
      </div>
    </div>
  )

  const analysisTab = (
    <div className="al-analysis-root">

      {/* Row 1: 两列 */}
      <div className="al-overview-main">

        {/* 分类成本占比饼图 */}
        <div className="al-card">
          <div className="al-card-title">分类成本占比</div>
          {categoryBreakdown.length ? (
            <>
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryBreakdown} dataKey="totalCost" nameKey="category" innerRadius={52} outerRadius={88} paddingAngle={2}>
                      {categoryBreakdown.map((item, idx) => (
                        <Cell key={item.category} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="al-donut-center">
                  <span className="al-donut-total" style={{ fontSize: 16 }}>{categoryBreakdown.length}</span>
                  <span className="al-donut-label">分类</span>
                </div>
              </div>
              <div className="al-legend-grid">
                {(() => {
                  const total = categoryBreakdown.reduce((s, i) => s + (i.totalCost || 0), 0)
                  return categoryBreakdown.map((item, idx) => (
                    <div key={item.category} className="al-legend-row">
                      <span className="al-legend-dot" style={{ background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} />
                      <span className="al-legend-name">{item.category}</span>
                      <span className="al-legend-count">{formatMoney(item.totalCost)}</span>
                      <span className="al-legend-pct">{total ? Math.round((item.totalCost / total) * 100) : 0}%</span>
                    </div>
                  ))
                })()}
              </div>
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分类数据" />}
        </div>

        {/* 资产类型分布 */}
        <div className="al-card">
          <div className="al-card-title">资产类型分布</div>
          {byTypeData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byTypeData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="cost" orientation="right" tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(v, name) => name === '件数' ? `${v} 件` : formatMoney(v)} />
                <Bar yAxisId="count" dataKey="count" name="件数" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar yAxisId="cost" dataKey="avgCost" name="平均成本" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无类型数据" />}
        </div>
      </div>

      {/* Row 2: 购入年份趋势（全宽） */}
      <div className="al-card">
        <div className="al-card-title">购入年份趋势</div>
        {byYearData.length ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byYearData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={(v) => [`${v} 件`, '购入数量']} />
              <Bar dataKey="count" name="购入数量" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                {byYearData.map((entry, idx) => (
                  <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无购入记录" />}
      </div>

      {/* Row 3: 两列 */}
      <div className="al-overview-main">

        {/* 使用中资产效率 */}
        <div className="al-card">
          <div className="al-card-title">使用中资产 · 日均成本</div>
          {inUseEfficiency.length ? (
            <div className="al-rank-list">
              {(() => {
                const maxVal = Math.max(...inUseEfficiency.map((i) => i.cashDailyCost || 0), 1)
                return inUseEfficiency.map((item) => (
                  <div className="al-rank-row" key={item.id}>
                    <div className="al-rank-header">
                      <button className="al-link-btn" onClick={() => openAssetDetail(item.id)}>{item.name}</button>
                      <span className="al-rank-value">{formatMoney(item.cashDailyCost)}/天</span>
                    </div>
                    <div className="al-rank-bar-bg">
                      <div className="al-rank-bar-fill" style={{ width: `${Math.round(((item.cashDailyCost || 0) / maxVal) * 100)}%`, background: '#3b82f6' }} />
                    </div>
                    <span className="al-rank-sub">使用 {item.useDays || 0} 天 · 投入 {formatMoney(item.totalCost)}</span>
                  </div>
                ))
              })()}
            </div>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无使用中资产" />}
        </div>

        {/* 附加成本占比 */}
        <div className="al-card">
          <div className="al-card-title">附加成本占比</div>
          {extraCostRatio.length ? (
            <div className="al-rank-list">
              {(() => {
                const maxRatio = Math.max(...extraCostRatio.map((i) => i.ratio || 0), 1)
                return extraCostRatio.map((item) => (
                  <div className="al-rank-row" key={item.id}>
                    <div className="al-rank-header">
                      <button className="al-link-btn" onClick={() => openAssetDetail(item.id)}>{item.name}</button>
                      <span className="al-rank-value" style={{ color: item.ratio > 30 ? '#ef4444' : '#1e293b' }}>{item.ratio}%</span>
                    </div>
                    <div className="al-rank-bar-bg">
                      <div className="al-rank-bar-fill" style={{ width: `${Math.round((item.ratio / maxRatio) * 100)}%`, background: item.ratio > 30 ? '#ef4444' : '#8b5cf6' }} />
                    </div>
                    <span className="al-rank-sub">附加 {formatMoney(item.extraCost)} · 总投入 {formatMoney(item.totalCost)}</span>
                  </div>
                ))
              })()}
            </div>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附加成本数据" />}
        </div>
      </div>

      {/* Row 4: 两列 */}
      <div className="al-overview-main">

        {/* 已卖出盈亏 + ROI */}
        <div className="al-card">
          <div className="al-card-title">已卖出 · 盈亏与 ROI</div>
          {soldWithROI.length ? (
            <ResponsiveContainer width="100%" height={Math.max(220, soldWithROI.length * 40)}>
              <BarChart data={soldWithROI} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip formatter={(v, name) => [`${v}%`, 'ROI']} labelFormatter={(label) => label} />
                <Bar dataKey="roi" name="ROI" radius={[0, 4, 4, 0]}>
                  {soldWithROI.map((entry, index) => (
                    <Cell key={index} fill={(entry.roi || 0) >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已卖出复盘数据" />}
        </div>

        {/* 闲置资产 */}
        <div className="al-card">
          <div className="al-card-title">闲置资产 · 天数分析</div>
          {dashboardAnalytics.topIdleAssets.length ? (
            <ResponsiveContainer width="100%" height={Math.max(220, dashboardAnalytics.topIdleAssets.slice(0, 8).length * 40)}>
              <BarChart
                data={dashboardAnalytics.topIdleAssets.slice(0, 8).map((item) => ({ ...item, idleDaysValue: item.idleDays || item.idle_days || 0 }))}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}天`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip formatter={(v) => [`${v} 天`, '闲置天数']} />
                <Bar dataKey="idleDaysValue" name="闲置天数" radius={[0, 4, 4, 0]}>
                  {dashboardAnalytics.topIdleAssets.slice(0, 8).map((entry, index) => (
                    <Cell key={index} fill={(entry.idleDays || entry.idle_days || 0) > 90 ? '#ef4444' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无闲置资产数据" />}
        </div>
      </div>

    </div>
  )

  const assetsTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false} className="asset-library-filter-card">
        <div className="asset-library-filter-grid">
          <Input
            value={filters.keyword}
            onChange={(event) => handleFilterChange('keyword', event.target.value)}
            placeholder="搜索名称、品牌、型号、备注"
            allowClear
          />
          <Select
            value={filters.status || undefined}
            onChange={(value) => handleFilterChange('status', value || '')}
            options={ASSET_STATUS_OPTIONS}
            placeholder="状态"
            allowClear
          />
          <Select
            value={filters.asset_type || undefined}
            onChange={(value) => handleFilterChange('asset_type', value || '')}
            options={[
              { value: 'electronics', label: '电子设备' },
              { value: 'appliance', label: '家电' },
              { value: 'furniture', label: '家具' },
              { value: 'vehicle', label: '交通工具' },
              { value: 'accessory', label: '配件' },
              { value: 'subscription', label: '长期服务' },
              { value: 'collectible', label: '收藏品' },
            ]}
            placeholder="资产类型"
            allowClear
          />
          <Select
            value={filters.category || undefined}
            onChange={(value) => handleFilterChange('category', value || '')}
            options={categoryOptions}
            placeholder="分类"
            allowClear
          />
          <Space size={[8, 8]} wrap>
            <Button type="primary" onClick={handleSearch}>
              筛选
            </Button>
            <Button onClick={handleResetFilters}>重置</Button>
          </Space>
        </div>
      </Card>

      <Card bordered={false} className="asset-library-panel-card">
        {listError ? <Alert type="error" showIcon message={listError} style={{ marginBottom: 16 }} /> : null}
        {loadingList ? (
          <div className="asset-library-loading-state">
            <Spin />
          </div>
        ) : assets.length ? (
          <Table
            rowKey="id"
            dataSource={assets}
            columns={assetColumns}
            pagination={false}
            scroll={{ x: 1380 }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有资产记录。先添加一项长期资产，开始记录买入、附加成本、使用与卖出复盘。"
          />
        )}
      </Card>
    </Space>
  )

  const lifecycleTab = (
    <div className="al-lifecycle-root">

      {/* 顶部选择器 bar */}
      <div className="al-lc-header">
        <div className="al-lc-selector">
          <Select
            showSearch
            value={selectedAssetId || undefined}
            onChange={(value) => { setSelectedAssetId(value); setLifecycleFormOpen(false) }}
            placeholder="选择资产开始记录..."
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={allAssets.map((item) => ({
              value: item.id,
              label: item.name,
              status: item.status,
              category: item.category,
            }))}
            optionRender={(option) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.data.label}</span>
                <Tag color={getAssetStatusColor(option.data.status)} style={{ flexShrink: 0, fontSize: 11 }}>
                  {getAssetStatusLabel(option.data.status)}
                </Tag>
                {option.data.category ? <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>{option.data.category}</span> : null}
              </div>
            )}
          />
        </div>
        {lifecycleAsset ? (
          <div className="al-lc-actions">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openAssetDetail(lifecycleAsset.id)}>详情</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(lifecycleAsset.id)}>编辑</Button>
          </div>
        ) : null}
      </div>

      {/* 指标条（有资产时展示） */}
      {lifecycleAsset ? (() => {
        const metrics = buildAssetMetricsSnapshot(lifecycleAsset)
        return (
          <div className="al-stat-row">
            {[
              { label: '累计投入', value: formatMoney(metrics.total_cost) },
              { label: '日均成本', value: metrics.cash_daily_cost != null ? `${formatMoney(metrics.cash_daily_cost)}/天` : '--' },
              { label: '使用天数', value: metrics.use_days != null ? `${metrics.use_days} 天` : '--' },
              { label: '已实现盈亏', value: formatMoney(metrics.profit_loss), color: metrics.profit_loss != null ? (metrics.profit_loss >= 0 ? '#22c55e' : '#ef4444') : undefined },
            ].map((s) => (
              <div key={s.label} className="al-stat-row-item">
                <span className="al-stat-row-label">{s.label}</span>
                <span className="al-stat-row-value" style={s.color ? { color: s.color } : {}}>{s.value}</span>
              </div>
            ))}
          </div>
        )
      })() : null}

      {/* 事件面板 */}
      <AssetEventsPanel
        assetId={selectedAssetId}
        onAssetMutated={handleAssetMutated}
        title="事件时间线"
        showTimeline
        defaultFormOpen={lifecycleFormOpen}
      />
    </div>
  )

  return (
    <div className="asset-library-page">
      <div className="asset-library-shell">
        <div className="asset-library-hero">
          <PageHeader
            title="资产库"
            subtitle="记录资产从买入、使用到卖出的完整生命周期"
            extra={
              <Space size={[8, 8]} wrap className="asset-library-quick-actions">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
                  新增资产
                </Button>
                <Button icon={<FieldTimeOutlined />} onClick={handleLifecycleQuickAction}>
                  记录事件
                </Button>
                <Button icon={<UnorderedListOutlined />} onClick={handleOpenIdle}>
                  查看闲置
                </Button>
                <Button icon={<RiseOutlined />} onClick={() => setActiveTab('analysis')}>
                  卖出复盘
                </Button>
              </Space>
            }
          />
        </div>

        {summaryError ? <Alert type="error" showIcon message={summaryError} style={{ marginBottom: 16 }} /> : null}

        <Card bordered={false} className="asset-library-tabs-card">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key)
              if (key !== 'lifecycle') {
                setLifecycleFormOpen(false)
              }
            }}
            className="asset-library-tabs"
            items={[
              { key: 'overview', label: '总览', children: overviewTab },
              { key: 'analysis', label: '分析', children: analysisTab },
              { key: 'assets', label: '资产记录', children: assetsTab },
              { key: 'lifecycle', label: '生命周期', children: lifecycleTab },
            ]}
          />
        </Card>
      </div>

      <Drawer
        title={editingAssetId ? '编辑资产' : '新增资产'}
        open={formDrawerOpen}
        onClose={() => setFormDrawerOpen(false)}
        width="min(1080px, calc(100vw - 24px))"
        destroyOnClose
      >
        <AssetForm
          form={assetForm}
          mode={editingAssetId ? 'edit' : 'create'}
          onSubmit={handleSubmitAsset}
          submitting={formSubmitting}
          onCancel={() => setFormDrawerOpen(false)}
        />
      </Drawer>

      <AssetDetailDrawer
        open={detailOpen}
        asset={detailAsset}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetailOpen(false)
          setDetailError('')
        }}
        onEdit={(assetId) => {
          setDetailOpen(false)
          openEditDrawer(assetId)
        }}
        onAssetMutated={handleAssetMutated}
      />
    </div>
  )
}
