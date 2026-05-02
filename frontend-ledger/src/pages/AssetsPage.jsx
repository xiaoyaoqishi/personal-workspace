import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  List,
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
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  RiseOutlined,
  UnorderedListOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { createAsset, deleteAsset, getAsset, getAssetSummary, listAssets, updateAsset } from '../api/assets'
import AssetDetailDrawer from '../components/assets/AssetDetailDrawer'
import AssetEventsPanel from '../components/assets/AssetEventsPanel'
import AssetForm, { buildAssetFormValues, getDefaultAssetFormValues } from '../components/assets/AssetForm'
import { buildAssetMetricsSnapshot, computeAssetAnalytics } from '../components/assets/assetAnalytics'
import PageHeader from '../components/PageHeader'
import {
  ASSET_CHART_COLORS,
  ASSET_STATUS_CHART_COLORS,
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

function SummaryMetricCard({ title, value, hint, icon, loading = false }) {
  return (
    <Card className="asset-library-kpi-card" loading={loading} bordered={false}>
      <Flex justify="space-between" align="flex-start" gap={12}>
        <Space direction="vertical" size={4}>
          <Typography.Text className="asset-library-kpi-label">{title}</Typography.Text>
          <Typography.Title level={3} className="asset-library-kpi-value">
            {value}
          </Typography.Title>
          {hint ? <Typography.Text type="secondary">{hint}</Typography.Text> : null}
        </Space>
        <div className="asset-library-kpi-icon">{icon}</div>
      </Flex>
    </Card>
  )
}

function PanelEmpty({ description }) {
  return (
    <div className="asset-library-chart-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  )
}

function AssetStatusTag({ value }) {
  return <Tag color={getAssetStatusColor(value)}>{getAssetStatusLabel(value)}</Tag>
}

function AssetQuickList({ title, items, emptyText, metricRenderer, onOpen }) {
  return (
    <Card title={title} bordered={false} className="asset-library-panel-card">
      {items.length ? (
        <List
          dataSource={items}
          renderItem={(item) => (
            <List.Item className="asset-library-rank-item">
              <div className="asset-library-rank-main">
                <Button type="link" className="asset-library-rank-link" onClick={() => onOpen(item.id)}>
                  {item.name}
                </Button>
                <div className="asset-library-rank-meta">
                  <AssetStatusTag value={item.status} />
                  {item.category ? <span>{item.category}</span> : null}
                  <span>{getAssetTypeLabel(item.asset_type)}</span>
                </div>
              </div>
              <div className="asset-library-rank-value">{metricRenderer(item)}</div>
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      )}
    </Card>
  )
}

function LifecycleSummaryCard({ asset, onViewDetail, onEdit }) {
  if (!asset) {
    return (
      <Card bordered={false} className="asset-library-panel-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择资产后查看生命周期信息" />
      </Card>
    )
  }

  const metrics = buildAssetMetricsSnapshot(asset)

  return (
    <Card
      bordered={false}
      className="asset-library-panel-card"
      extra={
        <Space size={[8, 8]} wrap>
          <Button icon={<EyeOutlined />} onClick={() => onViewDetail(asset.id)}>
            查看详情
          </Button>
          <Button icon={<EditOutlined />} onClick={() => onEdit(asset.id)}>
            编辑资产
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            <Typography.Title level={4} className="asset-library-section-title asset-library-asset-title-ellipsis">
              <span title={asset.name}>{asset.name}</span>
            </Typography.Title>
            <Space wrap size={[8, 8]}>
              <AssetStatusTag value={asset.status} />
              <Tag>{getAssetTypeLabel(asset.asset_type)}</Tag>
              {asset.category ? <Tag>{asset.category}</Tag> : null}
            </Space>
          </div>
          <div className="asset-library-asset-value">
            <Typography.Text type="secondary">累计投入成本</Typography.Text>
            <Typography.Title level={3}>{formatMoney(metrics.total_cost)}</Typography.Title>
          </div>
        </Flex>

        <div className="asset-library-lifecycle-stat-grid">
          <Card bordered={false}>
            <Typography.Text type="secondary">买入成本</Typography.Text>
            <Typography.Title level={4}>{formatMoney(asset.purchase_price)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">附加成本</Typography.Text>
            <Typography.Title level={4}>{formatMoney(asset.extra_cost)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">现金日均成本</Typography.Text>
            <Typography.Title level={4}>{formatMoney(metrics.cash_daily_cost)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">已实现盈亏</Typography.Text>
            <Typography.Title level={4}>{formatMoney(metrics.profit_loss)}</Typography.Title>
          </Card>
        </div>

        <div className="asset-library-overview-grid">
          <Card bordered={false}>
            <Typography.Text type="secondary">购买日期</Typography.Text>
            <Typography.Title level={5}>{formatDate(asset.purchase_date)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">开始使用</Typography.Text>
            <Typography.Title level={5}>{formatDate(asset.start_use_date)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">持有天数</Typography.Text>
            <Typography.Title level={5}>{formatNumber(metrics.holding_days)}</Typography.Title>
          </Card>
          <Card bordered={false}>
            <Typography.Text type="secondary">使用天数</Typography.Text>
            <Typography.Title level={5}>{formatNumber(metrics.use_days)}</Typography.Title>
          </Card>
        </div>
      </Space>
    </Card>
  )
}

export default function AssetsPage() {
  const [filters, setFilters] = useState({ keyword: '', status: '', asset_type: '', category: '' })
  const [assets, setAssets] = useState([])
  const [allAssets, setAllAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
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
      width: 160,
      render: (value) => displayEmpty(value),
    },
    {
      title: '购买渠道',
      dataIndex: 'purchase_channel',
      width: 180,
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
      width: 220,
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

  const overviewItems = [
    {
      title: '累计投入成本',
      value: formatMoney(summary?.total_cost ?? dashboardAnalytics.portfolioTotals.totalCost),
      icon: <WalletOutlined />,
    },
    {
      title: '累计买入成本',
      value: formatMoney(summary?.total_purchase_cost ?? dashboardAnalytics.portfolioTotals.totalPurchaseCost),
      icon: <DatabaseOutlined />,
    },
    {
      title: '累计附加成本',
      value: formatMoney(summary?.total_extra_cost ?? dashboardAnalytics.portfolioTotals.totalExtraCost),
      icon: <PlusOutlined />,
    },
    {
      title: '使用中资产',
      value: formatNumber(summary?.active_assets ?? dashboardAnalytics.portfolioTotals.activeCount),
      icon: <UnorderedListOutlined />,
    },
    {
      title: '闲置资产',
      value: formatNumber(summary?.idle_assets ?? dashboardAnalytics.portfolioTotals.idleCount),
      icon: <FieldTimeOutlined />,
    },
    {
      title: '已卖出资产',
      value: formatNumber(summary?.sold_assets ?? dashboardAnalytics.portfolioTotals.soldCount),
      icon: <RiseOutlined />,
    },
    {
      title: '已卖出盈亏',
      value: formatMoney(summary?.total_realized_profit_loss ?? dashboardAnalytics.portfolioTotals.totalRealizedProfitLoss),
      icon: <RiseOutlined />,
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="asset-library-kpi-grid asset-library-kpi-grid-overview">
        {overviewItems.map((item) => (
          <SummaryMetricCard key={item.title} loading={loadingSummary} {...item} />
        ))}
      </div>

      <div className="asset-library-overview-grid">
        <AssetQuickList
          title="日均成本较高资产"
          items={summary?.top_daily_cost_assets?.length ? summary.top_daily_cost_assets : dashboardAnalytics.topDailyCostAssets.slice(0, 5)}
          emptyText="暂无可计算日均成本的资产"
          onOpen={openAssetDetail}
          metricRenderer={(item) => {
            const metrics = buildAssetMetricsSnapshot(item)
            return (
              <>
                <strong>{formatMoney(metrics.cash_daily_cost)}</strong>
                <Typography.Text type="secondary">投入 {formatMoney(metrics.total_cost)}</Typography.Text>
              </>
            )
          }}
        />

        <AssetQuickList
          title="附加成本最高资产"
          items={summary?.top_extra_cost_assets?.length ? summary.top_extra_cost_assets : dashboardAnalytics.topExtraCostAssets.slice(0, 5)}
          emptyText="暂无附加成本较高的资产"
          onOpen={openAssetDetail}
          metricRenderer={(item) => (
            <>
              <strong>{formatMoney(item.extra_cost)}</strong>
              <Typography.Text type="secondary">买入 {formatMoney(item.purchase_price)}</Typography.Text>
            </>
          )}
        />
      </div>
    </Space>
  )

  const analysisTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="asset-library-overview-grid">
        <Card title="分类投入成本分析" bordered={false} className="asset-library-panel-card">
          <div className="asset-library-chart-wrap">
            {categoryBreakdown.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Bar dataKey="purchaseCost" name="买入成本" fill={ASSET_CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                  <Bar dataKey="extraCost" name="附加成本" fill={ASSET_CHART_COLORS[2]} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <PanelEmpty description="暂无分类成本数据" />
            )}
          </div>
        </Card>

        <Card title="状态分布" bordered={false} className="asset-library-panel-card">
          <div className="asset-library-chart-wrap">
            {statusBreakdown.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="count" nameKey="status" innerRadius={72} outerRadius={108} paddingAngle={2}>
                    {statusBreakdown.map((item) => (
                      <Cell key={item.status} fill={ASSET_STATUS_CHART_COLORS[item.status] || ASSET_CHART_COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatNumber(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <PanelEmpty description="暂无状态分布数据" />
            )}
          </div>
          {statusBreakdown.length ? (
            <div className="asset-library-legend-list">
              {statusBreakdown.map((item) => (
                <div key={item.status} className="asset-library-legend-item">
                  <span
                    className="asset-library-legend-dot"
                    style={{ backgroundColor: ASSET_STATUS_CHART_COLORS[item.status] || ASSET_CHART_COLORS[0] }}
                  />
                  <span>{getAssetStatusLabel(item.status)}</span>
                  <strong>{formatNumber(item.count)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="asset-library-overview-grid">
        <AssetQuickList
          title="日均成本排行"
          items={dashboardAnalytics.topDailyCostAssets}
          emptyText="暂无可计算日均成本的资产"
          onOpen={openAssetDetail}
          metricRenderer={(item) => {
            const metrics = buildAssetMetricsSnapshot(item)
            return (
              <>
                <strong>{formatMoney(metrics.cash_daily_cost)}</strong>
                <Typography.Text type="secondary">使用 {formatNumber(metrics.use_days)} 天</Typography.Text>
              </>
            )
          }}
        />

        <AssetQuickList
          title="闲置资产"
          items={summary?.top_idle_assets?.length ? summary.top_idle_assets : dashboardAnalytics.topIdleAssets.slice(0, 5)}
          emptyText="暂无闲置资产"
          onOpen={openAssetDetail}
          metricRenderer={(item) => {
            const metrics = buildAssetMetricsSnapshot(item)
            return (
              <>
                <strong>{formatNumber(metrics.idle_days)}</strong>
                <Typography.Text type="secondary">投入 {formatMoney(metrics.total_cost)}</Typography.Text>
              </>
            )
          }}
        />
      </div>

      <div className="asset-library-overview-grid">
        <AssetQuickList
          title="附加成本最高资产"
          items={dashboardAnalytics.topExtraCostAssets}
          emptyText="暂无高附加成本资产"
          onOpen={openAssetDetail}
          metricRenderer={(item) => (
            <>
              <strong>{formatMoney(item.extra_cost)}</strong>
              <Typography.Text type="secondary">
                买入 {formatMoney(item.purchase_price)}
                {item.metrics?.total_cost ? ` · 占比 ${formatNumber((item.extra_cost / item.metrics.total_cost) * 100, 1)}%` : ''}
              </Typography.Text>
            </>
          )}
        />

        <AssetQuickList
          title="已卖出盈亏复盘"
          items={dashboardAnalytics.soldProfitLossAssets}
          emptyText="暂无已卖出复盘数据"
          onOpen={openAssetDetail}
          metricRenderer={(item) => (
            <>
              <strong>{formatMoney(item.profit_loss)}</strong>
              <Typography.Text type="secondary">卖出 {formatMoney(item.sale_price)}</Typography.Text>
            </>
          )}
        />
      </div>
    </Space>
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
            scroll={{ x: 1320 }}
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false} className="asset-library-panel-card">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">选择一项资产后，可继续记录使用、闲置、附加成本和卖出事件。</Typography.Text>
          <Select
            showSearch
            value={selectedAssetId || undefined}
            options={allAssets.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setSelectedAssetId(value)
              setLifecycleFormOpen(false)
            }}
            placeholder="选择资产"
            optionFilterProp="label"
          />
        </Space>
      </Card>

      <LifecycleSummaryCard asset={lifecycleAsset} onViewDetail={openAssetDetail} onEdit={openEditDrawer} />

      <AssetEventsPanel
        assetId={selectedAssetId}
        onAssetMutated={handleAssetMutated}
        title="生命周期事件"
        showTimeline
        defaultFormOpen={lifecycleFormOpen}
      />
    </Space>
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
