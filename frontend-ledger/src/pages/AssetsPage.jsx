import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip as AntTooltip,
  Typography,
  message,
} from 'antd'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import { buildAssetMetricsSnapshot, computeAssetAnalytics } from '../components/assets/assetAnalytics'
import AssetDetailDrawer from '../components/assets/AssetDetailDrawer'
import AssetEventsPanel from '../components/assets/AssetEventsPanel'
import AssetForm, {
  buildAssetFormValues,
  getDefaultAssetFormValues,
} from '../components/assets/AssetForm'
import AssetValuationsPanel from '../components/assets/AssetValuationsPanel'
import {
  ASSET_CHART_COLORS,
  ASSET_STATUS_CHART_COLORS,
  ASSET_STATUS_OPTIONS,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  getAssetStatusColor,
  getAssetStatusLabel,
  getAssetTypeLabel,
  getChartColor,
} from '../components/assets/assetConstants'
import './asset-library.css'

function mergeAssetSummaryWithDetail(summaryAsset, detailAsset) {
  if (!summaryAsset) return detailAsset || null
  if (!detailAsset) return summaryAsset
  return {
    ...detailAsset,
    ...summaryAsset,
    metrics: summaryAsset.metrics || detailAsset.metrics,
    purchase_price: detailAsset.purchase_price,
    extra_cost: detailAsset.extra_cost,
    sale_price: detailAsset.sale_price,
    target_daily_cost: detailAsset.target_daily_cost,
    expected_use_days: detailAsset.expected_use_days,
    purchase_channel: detailAsset.purchase_channel,
    serial_number: detailAsset.serial_number,
    start_use_date: detailAsset.start_use_date,
    warranty_until: detailAsset.warranty_until,
    note: detailAsset.note,
    images: Array.isArray(detailAsset.images) && detailAsset.images.length ? detailAsset.images : summaryAsset.images,
    tags: Array.isArray(detailAsset.tags) && detailAsset.tags.length ? detailAsset.tags : summaryAsset.tags,
  }
}

const sharedSummaryRequests = new Map()
const sharedAssetListRequests = new Map()
const sharedAssetCatalogRequests = new Map()

function withSharedRequest(cache, key, loader) {
  if (cache.has(key)) {
    return cache.get(key)
  }
  const request = Promise.resolve()
    .then(loader)
    .finally(() => {
      cache.delete(key)
    })
  cache.set(key, request)
  return request
}

function buildAssetListParams(nextFilters = {}) {
  return {
    keyword: nextFilters.keyword || undefined,
    status: nextFilters.status || undefined,
    asset_type: nextFilters.asset_type || undefined,
    category: nextFilters.category || undefined,
    limit: 24,
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

function getSharedSummaryRequest() {
  return withSharedRequest(sharedSummaryRequests, 'default', () => getAssetSummary())
}

function getSharedAssetListRequest(nextFilters = {}) {
  const params = buildAssetListParams(nextFilters)
  return withSharedRequest(sharedAssetListRequests, JSON.stringify(params), () => listAssets(params))
}

function getSharedAssetCatalogRequest() {
  return withSharedRequest(sharedAssetCatalogRequests, 'default', () => fetchAllAssetCatalogPages())
}

function SummaryMetricCard({ title, value, icon, hint, loading = false }) {
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

function ChartEmpty({ description, actionLabel, onAction }) {
  return (
    <div className="asset-library-chart-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
        {actionLabel && onAction ? (
          <Button type="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </Empty>
    </div>
  )
}

function AssetStatusTag({ value }) {
  return <Tag color={getAssetStatusColor(value)}>{getAssetStatusLabel(value)}</Tag>
}

function AssetNameText({ value, strong = false, secondary = false, className = '' }) {
  const content = value || '未命名资产'
  return (
    <AntTooltip title={content}>
      <Typography.Text strong={strong} type={secondary ? 'secondary' : undefined} className={`asset-library-name-text${className ? ` ${className}` : ''}`}>
        {content}
      </Typography.Text>
    </AntTooltip>
  )
}

function BreakdownLegend({ items, labelRenderer, secondaryKey = 'currentValue', secondaryLabel = '当前估值', countLabel = '数量' }) {
  return (
    <div className="asset-library-legend-list">
      {items.map((item, index) => (
        <div key={item.key} className="asset-library-legend-item">
          <span
            className="asset-library-legend-dot"
            style={{ backgroundColor: ASSET_STATUS_CHART_COLORS[item.key] || getChartColor(index) }}
          />
          <div className="asset-library-legend-copy">
            <span>{labelRenderer(item)}</span>
            <Typography.Text type="secondary">
              {countLabel} {formatNumber(item.count)}
            </Typography.Text>
          </div>
          <strong>{secondaryLabel === '当前估值' ? formatMoney(item[secondaryKey]) : item[secondaryKey]}</strong>
        </div>
      ))}
    </div>
  )
}

function AssetActionButtons({ assetId, deleting, onView, onEdit, onDelete }) {
  return (
    <Space wrap size={[8, 8]}>
      <Button size="small" icon={<EyeOutlined />} onClick={() => onView(assetId)}>
        查看详情
      </Button>
      <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(assetId)}>
        编辑
      </Button>
      <Popconfirm
        title="软删除资产"
        description="此操作会将资产标记为已删除，默认列表将不再显示。确认继续吗？"
        okText="确认软删除"
        cancelText="取消"
        onConfirm={() => onDelete(assetId)}
      >
        <Button size="small" danger icon={<DeleteOutlined />} loading={deleting}>
          删除
        </Button>
      </Popconfirm>
    </Space>
  )
}

function AssetListCard({ asset, deleting = false, onView, onEdit, onDelete }) {
  const metrics = buildAssetMetricsSnapshot(asset)

  return (
    <Card className="asset-library-asset-card" bordered={false}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Flex justify="space-between" align="flex-start" gap={12}>
          <Space direction="vertical" size={4}>
            <Typography.Title level={5} className="asset-library-asset-title asset-library-asset-title-ellipsis">
              <span title={asset?.name || '未命名资产'}>{asset?.name || '未命名资产'}</span>
            </Typography.Title>
            <Space wrap size={[8, 8]}>
              <AssetStatusTag value={asset?.status} />
              <Tag>{getAssetTypeLabel(asset?.asset_type)}</Tag>
              {asset?.category ? <Tag>{asset.category}</Tag> : null}
            </Space>
          </Space>
          <div className="asset-library-asset-value">
            <Typography.Text type="secondary">当前估值</Typography.Text>
            <Typography.Title level={4}>{formatMoney(asset?.current_value)}</Typography.Title>
          </div>
        </Flex>

        <div className="asset-library-asset-metrics">
          <div>
            <span>总投入成本</span>
            <strong>{formatMoney(metrics?.total_cost)}</strong>
          </div>
          <div>
            <span>净消费成本</span>
            <strong>{formatMoney(metrics?.net_consumption_cost)}</strong>
          </div>
          <div>
            <span>净日均成本</span>
            <strong>{formatMoney(metrics?.net_daily_cost)}</strong>
          </div>
          <div>
            <span>使用天数</span>
            <strong>{formatNumber(metrics?.use_days)}</strong>
          </div>
        </div>

        <Flex justify="space-between" wrap gap={8}>
          <Space wrap size={[6, 6]}>
            {(Array.isArray(asset?.tags) ? asset.tags : []).map((tag) => (
              <Tag key={tag} className="asset-library-tag-chip">
                {tag}
              </Tag>
            ))}
            {!asset?.tags?.length ? <Typography.Text type="secondary">暂无标签</Typography.Text> : null}
          </Space>
          <Typography.Text type="secondary">买入日期：{formatDate(asset?.purchase_date)}</Typography.Text>
        </Flex>

        <div className="asset-library-asset-actions">
          <AssetActionButtons
            assetId={asset.id}
            deleting={deleting}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </Space>
    </Card>
  )
}

function LifecycleAssetSummaryCard({ asset, onViewDetail, onEdit }) {
  if (!asset) return null
  const metrics = buildAssetMetricsSnapshot(asset)

  return (
    <Card
      className="asset-library-panel-card asset-library-lifecycle-summary-card"
      bordered={false}
      extra={
        <Space wrap size={[8, 8]}>
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
            <Typography.Text type="secondary">当前估值</Typography.Text>
            <Typography.Title level={3}>{formatMoney(asset.current_value)}</Typography.Title>
          </div>
        </Flex>

        <div className="asset-library-lifecycle-stat-grid">
          <Card bordered={false}>
            <Statistic title="总投入成本" value={formatMoney(metrics.total_cost)} />
          </Card>
          <Card bordered={false}>
            <Statistic title="净消费成本" value={formatMoney(metrics.net_consumption_cost)} />
          </Card>
          <Card bordered={false}>
            <Statistic title="净日均成本" value={formatMoney(metrics.net_daily_cost)} />
          </Card>
          <Card bordered={false}>
            <Statistic title="残值率" value={formatPercent(metrics.residual_rate)} />
          </Card>
        </div>

        <Descriptions size="small" bordered column={2} className="asset-library-detail-descriptions">
          <Descriptions.Item label="买入日期">{formatDate(asset.purchase_date)}</Descriptions.Item>
          <Descriptions.Item label="开始使用">{formatDate(asset.start_use_date)}</Descriptions.Item>
          <Descriptions.Item label="已使用次数">{formatNumber(asset.usage_count)}</Descriptions.Item>
          <Descriptions.Item label="使用天数">{formatNumber(metrics.use_days)}</Descriptions.Item>
          <Descriptions.Item label="额外成本">{formatMoney(asset.extra_cost)}</Descriptions.Item>
          <Descriptions.Item label="卖出价格">{formatMoney(asset.sale_price)}</Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  )
}

function InsightListCard({
  title,
  description,
  loading = false,
  items = [],
  emptyText,
  renderMeta,
  renderValue,
  renderTone,
  onAssetClick,
  footer,
}) {
  return (
    <Card
      className="asset-library-panel-card asset-library-insight-card"
      title={title}
      extra={description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
      bordered={false}
      loading={loading}
    >
      {items.length ? (
        <List
          dataSource={items}
          renderItem={(item, index) => (
            <List.Item className="asset-library-rank-item">
              <div className="asset-library-rank-main">
                <Button type="link" className="asset-library-rank-link" onClick={() => onAssetClick(item.id)}>
                  <span title={item.name}>{index + 1}. {item.name}</span>
                </Button>
                <div className="asset-library-rank-meta">{renderMeta(item)}</div>
              </div>
              <div className="asset-library-rank-value">
                <strong>{renderValue(item)}</strong>
                {renderTone ? renderTone(item) : null}
              </div>
            </List.Item>
          )}
        />
      ) : (
        <ChartEmpty description={emptyText} />
      )}
      {footer ? <div className="asset-library-card-footer">{footer}</div> : null}
    </Card>
  )
}

function SoldReviewList({ items, onAssetClick }) {
  if (!items.length) {
    return <ChartEmpty description="当前筛选下暂无已卖出资产盈亏记录" />
  }

  return (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item className="asset-library-sold-item">
          <div className="asset-library-sold-main">
            <Button type="link" className="asset-library-rank-link" onClick={() => onAssetClick(item.id)}>
              <span title={item.name}>{item.name}</span>
            </Button>
            <Space wrap size={[8, 8]}>
              <AssetStatusTag value={item.status} />
              <Tag>{getAssetTypeLabel(item.assetType)}</Tag>
              <Typography.Text type="secondary">残值率 {formatPercent(item.residualRate)}</Typography.Text>
            </Space>
          </div>
          <div className="asset-library-sold-side">
            <Typography.Text type="secondary">已实现盈亏</Typography.Text>
            <Typography.Text strong className={item.profitLoss > 0 ? 'asset-library-text-positive' : item.profitLoss < 0 ? 'asset-library-text-negative' : 'asset-library-text-muted'}>
              {formatMoney(item.profitLoss)}
            </Typography.Text>
            <Typography.Text type="secondary">真实消费 {formatMoney(item.realizedConsumptionCost)}</Typography.Text>
          </div>
        </List.Item>
      )}
    />
  )
}

function findKnownAsset(assetId, assetItems, assetCatalog, dashboardAssets = []) {
  return (
    dashboardAssets.find((item) => item.id === assetId) ||
    assetItems.find((item) => item.id === assetId) ||
    assetCatalog.find((item) => item.id === assetId) ||
    null
  )
}

export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [listError, setListError] = useState('')
  const [assetItems, setAssetItems] = useState([])
  const [assetCatalog, setAssetCatalog] = useState([])
  const [assetTotal, setAssetTotal] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [detailCacheVersion, setDetailCacheVersion] = useState(0)
  const [deletingId, setDeletingId] = useState(null)
  const [lifecycleAssetId, setLifecycleAssetId] = useState(null)
  const [lifecycleAsset, setLifecycleAsset] = useState(null)
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const [analysisFilters, setAnalysisFilters] = useState({
    status: undefined,
    category: undefined,
  })
  const [detailDrawer, setDetailDrawer] = useState({
    open: false,
    id: null,
    asset: null,
    loading: false,
    error: '',
  })
  const [editDrawer, setEditDrawer] = useState({
    open: false,
    id: null,
    asset: null,
    loading: false,
    submitting: false,
    error: '',
    reopenDetail: false,
  })
  const [filters, setFilters] = useState({
    keyword: '',
    status: undefined,
    asset_type: '',
    category: '',
  })
  const [draftFilters, setDraftFilters] = useState({
    keyword: '',
    status: undefined,
    asset_type: '',
    category: '',
  })

  const catalogRequestRef = useRef(0)
  const assetDetailCacheRef = useRef(new Map())
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  useEffect(() => {
    createForm.setFieldsValue(getDefaultAssetFormValues())
  }, [createForm])

  const loadSummary = async (options = {}) => {
    const { shared = false } = options
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const payload = shared ? await getSharedSummaryRequest() : await getAssetSummary()
      setSummary(payload || {})
    } catch (error) {
      setSummaryError(error?.userMessage || '资产总览加载失败')
    } finally {
      setSummaryLoading(false)
    }
  }

  const loadAssets = async (nextFilters = filters, options = {}) => {
    const { shared = false } = options
    setListLoading(true)
    setListError('')
    try {
      const payload = shared ? await getSharedAssetListRequest(nextFilters) : await listAssets(buildAssetListParams(nextFilters))
      setAssetItems(Array.isArray(payload?.items) ? payload.items : [])
      setAssetTotal(Number(payload?.total || 0))
    } catch (error) {
      setListError(error?.userMessage || '资产列表加载失败')
    } finally {
      setListLoading(false)
    }
  }

  const loadAssetCatalog = async (options = {}) => {
    const { shared = false } = options
    const requestId = catalogRequestRef.current + 1
    catalogRequestRef.current = requestId
    setCatalogLoading(true)
    try {
      const items = shared ? await getSharedAssetCatalogRequest() : await fetchAllAssetCatalogPages()
      if (catalogRequestRef.current !== requestId) return
      setAssetCatalog(items)
    } catch (error) {
      return error
    } finally {
      if (catalogRequestRef.current === requestId) {
        setCatalogLoading(false)
      }
    }
  }

  const refreshSummaryAndList = async (nextFilters = filters) => {
    await Promise.all([loadSummary(), loadAssets(nextFilters), loadAssetCatalog()])
  }

  const getCachedAssetDetail = (assetId) => assetDetailCacheRef.current.get(assetId) || null

  const cacheAssetDetail = (asset) => {
    if (!asset?.id) return asset
    assetDetailCacheRef.current.set(asset.id, asset)
    setDetailCacheVersion((prev) => prev + 1)
    return asset
  }

  const fetchAssetDetail = async (assetId, options = {}) => {
    const { force = false } = options
    if (!force) {
      const cached = getCachedAssetDetail(assetId)
      if (cached) return cached
    }
    const payload = await getAsset(assetId)
    return cacheAssetDetail(payload)
  }

  const loadLifecycleAsset = async (assetId, options = {}) => {
    if (!assetId) {
      setLifecycleAsset(null)
      setLifecycleError('')
      return
    }

    setLifecycleLoading(true)
    setLifecycleError('')
    try {
      const payload = await fetchAssetDetail(assetId, options)
      setLifecycleAsset(payload)
    } catch (error) {
      setLifecycleError(error?.userMessage || '生命周期资产详情加载失败')
      setLifecycleAsset(null)
    } finally {
      setLifecycleLoading(false)
    }
  }

  const openAssetDetail = async (assetId) => {
    const previewAsset = findKnownAsset(assetId, assetItems, assetCatalog, dashboardAssets)
    setDetailDrawer({
      open: true,
      id: assetId,
      asset: previewAsset,
      loading: true,
      error: '',
    })
    try {
      const payload = await fetchAssetDetail(assetId)
      setDetailDrawer({
        open: true,
        id: assetId,
        asset: payload,
        loading: false,
        error: '',
      })
    } catch (error) {
      setDetailDrawer((prev) => ({
        ...prev,
        open: true,
        id: assetId,
        loading: false,
        error: error?.userMessage || '资产详情加载失败',
      }))
    }
  }

  const openAssetEdit = async (assetId, options = {}) => {
    const previewAsset = findKnownAsset(assetId, assetItems, assetCatalog, dashboardAssets)
    editForm.resetFields()
    if (previewAsset) {
      editForm.setFieldsValue(buildAssetFormValues(previewAsset))
    }
    setEditDrawer({
      open: true,
      id: assetId,
      asset: previewAsset,
      loading: true,
      submitting: false,
      error: '',
      reopenDetail: Boolean(options.reopenDetail),
    })
    try {
      const payload = await fetchAssetDetail(assetId)
      editForm.setFieldsValue(buildAssetFormValues(payload))
      setEditDrawer((prev) => ({
        ...prev,
        open: true,
        id: assetId,
        asset: payload,
        loading: false,
        error: '',
      }))
    } catch (error) {
      setEditDrawer((prev) => ({
        ...prev,
        open: true,
        id: assetId,
        loading: false,
        error: error?.userMessage || '资产编辑数据加载失败',
      }))
    }
  }

  useEffect(() => {
    void loadSummary({ shared: true })
    void loadAssets(filters, { shared: true })
    void loadAssetCatalog({ shared: true })
  }, [])

  useEffect(() => {
    if (!assetCatalog.length) {
      setLifecycleAssetId(null)
      setLifecycleAsset(null)
      return
    }

    if (!lifecycleAssetId || !assetCatalog.some((item) => item.id === lifecycleAssetId)) {
      setLifecycleAssetId(assetCatalog[0].id)
    }
  }, [assetCatalog, lifecycleAssetId])

  useEffect(() => {
    if (lifecycleAssetId) {
      void loadLifecycleAsset(lifecycleAssetId)
    }
  }, [lifecycleAssetId])

  const handleAssetMutated = async (assetId) => {
    if (assetDetailCacheRef.current.delete(assetId)) {
      setDetailCacheVersion((prev) => prev + 1)
    }
    await refreshSummaryAndList(filters)
    if (detailDrawer.open && detailDrawer.id === assetId) {
      try {
        const payload = await fetchAssetDetail(assetId, { force: true })
        setDetailDrawer((prev) => ({ ...prev, asset: payload, error: '' }))
      } catch (error) {
        setDetailDrawer((prev) => ({ ...prev, error: error?.userMessage || '资产详情刷新失败' }))
      }
    }
    if (lifecycleAssetId === assetId) {
      await loadLifecycleAsset(assetId, { force: true })
    }
  }

  const dashboardAssets = useMemo(
    () => assetCatalog.map((item) => mergeAssetSummaryWithDetail(item, getCachedAssetDetail(item.id))),
    [assetCatalog, detailCacheVersion],
  )
  const dashboardAnalytics = useMemo(() => computeAssetAnalytics(dashboardAssets), [dashboardAssets])
  const analysisCategoryOptions = useMemo(() => {
    const categories = [...new Set(assetCatalog.map((item) => item.category || '未分类'))]
    return categories
      .sort((left, right) => String(left).localeCompare(String(right), 'zh-CN'))
      .map((value) => ({ value, label: value }))
  }, [assetCatalog])

  const filteredAnalysisAssets = useMemo(() => {
    return dashboardAssets.filter((asset) => {
      const statusMatched = !analysisFilters.status || asset.status === analysisFilters.status
      const categoryMatched = !analysisFilters.category || (asset.category || '未分类') === analysisFilters.category
      return statusMatched && categoryMatched
    })
  }, [dashboardAssets, analysisFilters.category, analysisFilters.status])

  const analysisAnalytics = useMemo(() => computeAssetAnalytics(filteredAnalysisAssets), [filteredAnalysisAssets])
  const hasAssets = assetCatalog.length > 0 || Number(summary?.total_assets || 0) > 0

  const overviewStatusData = useMemo(
    () =>
      dashboardAnalytics.byStatus.map((item, index) => ({
        ...item,
        label: getAssetStatusLabel(item.key),
        fill: ASSET_STATUS_CHART_COLORS[item.key] || getChartColor(index),
      })),
    [dashboardAnalytics.byStatus],
  )

  const overviewCategoryData = useMemo(
    () =>
      dashboardAnalytics.byCategory.slice(0, 8).map((item, index) => ({
        ...item,
        label: item.key || '未分类',
        fill: getChartColor(index),
      })),
    [dashboardAnalytics.byCategory],
  )

  const analysisStatusData = useMemo(
    () =>
      analysisAnalytics.byStatus.map((item, index) => ({
        ...item,
        label: getAssetStatusLabel(item.key),
        fill: ASSET_STATUS_CHART_COLORS[item.key] || getChartColor(index),
      })),
    [analysisAnalytics.byStatus],
  )

  const analysisCategoryData = useMemo(
    () =>
      analysisAnalytics.byCategory.slice(0, 10).map((item, index) => ({
        ...item,
        label: item.key || '未分类',
        fill: getChartColor(index),
      })),
    [analysisAnalytics.byCategory],
  )

  const actionableAssets = useMemo(() => {
    return analysisAnalytics.items
      .filter(
        (item) =>
          item.status !== 'sold' &&
          item.status !== 'disposed' &&
          item.status !== 'lost' &&
          item.residualRate !== null &&
          item.netDailyCost !== null &&
          item.residualRate <= 0.4,
      )
      .sort((left, right) => {
        const leftScore = (1 - left.residualRate) * left.netDailyCost
        const rightScore = (1 - right.residualRate) * right.netDailyCost
        return rightScore - leftScore
      })
      .slice(0, 10)
  }, [analysisAnalytics.items])

  const analysisHasFilters = Boolean(analysisFilters.status || analysisFilters.category)

  const tableColumns = [
    {
      title: '资产',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <AssetNameText value={row.name} strong />
          <Typography.Text type="secondary" className="asset-library-table-subtitle">
            {getAssetTypeLabel(row.asset_type)}
            {row.category ? ` · ${row.category}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <AssetStatusTag value={value} />,
    },
    {
      title: '成本 / 估值',
      key: 'value',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{formatMoney(row.metrics?.total_cost)}</Typography.Text>
          <Typography.Text type="secondary">估值 {formatMoney(row.current_value)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '净日均成本',
      key: 'net_daily_cost',
      width: 160,
      render: (_, row) => formatMoney(row.metrics?.net_daily_cost),
    },
    {
      title: '使用 / 买入日期',
      key: 'dates',
      width: 190,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{`买入 ${formatDate(row.purchase_date)}`}</Typography.Text>
          <Typography.Text type="secondary">{`使用 ${formatNumber(row.metrics?.use_days)} 天`}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) =>
        Array.isArray(tags) && tags.length ? (
          <Space wrap size={[4, 4]}>
            {tags.slice(0, 3).map((tag) => (
              <Tag key={tag} className="asset-library-tag-chip">
                {tag}
              </Tag>
            ))}
            {tags.length > 3 ? <Tag>+{tags.length - 3}</Tag> : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">--</Typography.Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 240,
      render: (_, row) => (
        <AssetActionButtons
          assetId={row.id}
          deleting={deletingId === row.id}
          onView={openAssetDetail}
          onEdit={openAssetEdit}
          onDelete={handleDeleteAsset}
        />
      ),
    },
  ]

  const handleSearch = () => {
    setFilters(draftFilters)
    void loadAssets(draftFilters)
  }

  const handleReset = () => {
    const next = { keyword: '', status: undefined, asset_type: '', category: '' }
    setDraftFilters(next)
    setFilters(next)
    void loadAssets(next)
  }

  const handleAnalysisReset = () => {
    setAnalysisFilters({ status: undefined, category: undefined })
  }

  async function handleCreateAsset(payload) {
    setCreateSubmitting(true)
    try {
      await createAsset(payload)
      message.success('资产创建成功')
      createForm.resetFields()
      createForm.setFieldsValue(getDefaultAssetFormValues())
      await refreshSummaryAndList(filters)
      setActiveTab('list')
    } catch (error) {
      message.error(error?.userMessage || '资产创建失败，请检查输入项后重试')
      return error
    } finally {
      setCreateSubmitting(false)
    }
  }

  async function handleUpdateAsset(payload) {
    if (!editDrawer.id) return
    setEditDrawer((prev) => ({ ...prev, submitting: true }))
    try {
      await updateAsset(editDrawer.id, payload)
      message.success('资产已更新')
      const shouldReopenDetail = editDrawer.reopenDetail
      const assetId = editDrawer.id
      if (assetDetailCacheRef.current.delete(assetId)) {
        setDetailCacheVersion((prev) => prev + 1)
      }
      setEditDrawer({
        open: false,
        id: null,
        asset: null,
        loading: false,
        submitting: false,
        error: '',
        reopenDetail: false,
      })
      await refreshSummaryAndList(filters)
      if (lifecycleAssetId === assetId) {
        await loadLifecycleAsset(assetId, { force: true })
      }
      if (shouldReopenDetail || (detailDrawer.open && detailDrawer.id === assetId)) {
        await openAssetDetail(assetId)
      }
    } catch (error) {
      message.error(error?.userMessage || '资产更新失败，请稍后重试')
      setEditDrawer((prev) => ({
        ...prev,
        submitting: false,
        error: error?.userMessage || '资产更新失败',
      }))
    }
  }

  async function handleDeleteAsset(assetId) {
    setDeletingId(assetId)
    try {
      await deleteAsset(assetId)
      message.success('资产已软删除')
      if (assetDetailCacheRef.current.delete(assetId)) {
        setDetailCacheVersion((prev) => prev + 1)
      }
      if (detailDrawer.id === assetId) {
        setDetailDrawer({ open: false, id: null, asset: null, loading: false, error: '' })
      }
      if (editDrawer.id === assetId) {
        setEditDrawer({
          open: false,
          id: null,
          asset: null,
          loading: false,
          submitting: false,
          error: '',
          reopenDetail: false,
        })
      }
      await refreshSummaryAndList(filters)
    } catch (error) {
      message.error(error?.userMessage || '资产删除失败，请稍后重试')
      return error
    } finally {
      setDeletingId(null)
    }
  }

  const overviewTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {summaryError ? <Alert type="error" showIcon message={summaryError} /> : null}

      {!hasAssets && !summaryLoading && !catalogLoading ? (
        <Card className="asset-library-panel-card" bordered={false}>
          <ChartEmpty description="资产库还是空的，先录入第一项资产后再查看仪表盘。" actionLabel="新增资产" onAction={() => setActiveTab('create')} />
        </Card>
      ) : (
        <>
          <div className="asset-library-kpi-grid asset-library-kpi-grid-expanded">
            <SummaryMetricCard
              title="当前资产净值"
              value={formatMoney(summary?.total_current_value ?? dashboardAnalytics.portfolioTotals.currentValue)}
              icon={<WalletOutlined />}
              hint="按当前估值口径汇总"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="累计买入成本"
              value={formatMoney(summary?.total_purchase_cost ?? dashboardAnalytics.portfolioTotals.totalCost)}
              icon={<DatabaseOutlined />}
              hint="买入价与额外成本之和"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="净消费成本"
              value={formatMoney(summary?.total_net_consumption_cost ?? dashboardAnalytics.portfolioTotals.netConsumptionCost)}
              icon={<RiseOutlined />}
              hint="总成本扣除当前残值"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="已卖出盈亏"
              value={formatMoney(summary?.total_realized_profit_loss ?? dashboardAnalytics.portfolioTotals.realizedProfitLoss)}
              icon={<FieldTimeOutlined />}
              hint="仅统计已卖出资产"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="使用中资产"
              value={formatNumber(summary?.active_assets ?? dashboardAnalytics.portfolioTotals.activeCount)}
              icon={<WalletOutlined />}
              hint="含草稿 / 使用中 / 出售中"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="闲置资产"
              value={formatNumber(summary?.idle_assets ?? dashboardAnalytics.portfolioTotals.idleCount)}
              icon={<DatabaseOutlined />}
              hint="优先关注沉没成本"
              loading={summaryLoading}
            />
            <SummaryMetricCard
              title="已卖出资产"
              value={formatNumber(summary?.sold_assets ?? dashboardAnalytics.portfolioTotals.soldCount)}
              icon={<RiseOutlined />}
              hint={`总资产 ${formatNumber(summary?.total_assets ?? dashboardAssets.length)}`}
              loading={summaryLoading}
            />
          </div>

          <div className="asset-library-overview-grid">
            <Card
              className="asset-library-panel-card"
              title="状态分布"
              extra={<Typography.Text type="secondary">同时看数量与估值占比</Typography.Text>}
              bordered={false}
              loading={catalogLoading}
            >
              {overviewStatusData.length ? (
                <div className="asset-library-chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={overviewStatusData} dataKey="count" nameKey="label" innerRadius={66} outerRadius={96} paddingAngle={3}>
                        {overviewStatusData.map((item) => (
                          <Cell key={item.key} fill={item.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [formatNumber(value), '资产数量']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <BreakdownLegend items={overviewStatusData} labelRenderer={(item) => item.label} />
                </div>
              ) : (
                <ChartEmpty description="暂无状态分布数据" />
              )}
            </Card>

            <Card
              className="asset-library-panel-card"
              title="分类分布"
              extra={<Typography.Text type="secondary">对比分类买入成本与当前估值</Typography.Text>}
              bordered={false}
              loading={catalogLoading}
            >
              {overviewCategoryData.length ? (
                <div className="asset-library-chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={overviewCategoryData} margin={{ top: 8, right: 12, left: -8, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" angle={-18} textAnchor="end" height={54} interval={0} />
                      <YAxis tickFormatter={(value) => `¥${value}`} width={72} />
                      <Tooltip formatter={(value) => formatMoney(value)} />
                      <Legend />
                      <Bar dataKey="totalCost" name="买入成本" radius={[8, 8, 0, 0]} fill={ASSET_CHART_COLORS[0]} />
                      <Bar dataKey="currentValue" name="当前估值" radius={[8, 8, 0, 0]} fill={ASSET_CHART_COLORS[1]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ChartEmpty description="暂无分类分布数据" />
              )}
            </Card>
          </div>

          <div className="asset-library-overview-grid asset-library-overview-grid-four">
            <InsightListCard
              title="日均成本最高资产"
              description="优先看净消费日均成本"
              loading={catalogLoading}
              items={dashboardAnalytics.topNetDailyCostAssets.slice(0, 5)}
              emptyText="暂无可排序的日均成本资产"
              onAssetClick={openAssetDetail}
              renderMeta={(item) => (
                <>
                  <AssetStatusTag value={item.status} />
                  <span>{getAssetTypeLabel(item.assetType)}</span>
                </>
              )}
              renderValue={(item) => formatMoney(item.netDailyCost)}
              renderTone={(item) => <span>净消费 {formatMoney(item.netConsumptionCost)}</span>}
            />

            <InsightListCard
              title="闲置资产"
              description="按近似闲置天数排序"
              loading={catalogLoading}
              items={dashboardAnalytics.topIdleAssets.slice(0, 5)}
              emptyText="暂无闲置资产数据"
              onAssetClick={openAssetDetail}
              renderMeta={(item) => (
                <>
                  <AssetStatusTag value={item.status} />
                  <span>持有 {formatNumber(item.holdingDays)} 天</span>
                </>
              )}
              renderValue={(item) => `${formatNumber(item.idleDays)} 天`}
              renderTone={(item) => <span>当前估值 {formatMoney(item.currentValue)}</span>}
            />

            <InsightListCard
              title="残值率最低资产"
              description="优先识别价值回收偏弱资产"
              loading={catalogLoading}
              items={dashboardAnalytics.lowResidualRateAssets.slice(0, 5)}
              emptyText="暂无可计算残值率的资产"
              onAssetClick={openAssetDetail}
              renderMeta={(item) => (
                <>
                  <AssetStatusTag value={item.status} />
                  <span>{item.category || '未分类'}</span>
                </>
              )}
              renderValue={(item) => formatPercent(item.residualRate)}
              renderTone={(item) => <span>净日均 {formatMoney(item.netDailyCost)}</span>}
            />

            <InsightListCard
              title="维护成本偏高资产"
              description="按额外成本占总成本比例排序"
              loading={catalogLoading}
              items={dashboardAnalytics.highMaintenanceCostAssets.slice(0, 5)}
              emptyText="尚未获取到足够的附加成本明细，可先查看详情后再回到榜单。"
              onAssetClick={openAssetDetail}
              renderMeta={(item) => (
                <>
                  <AssetStatusTag value={item.status} />
                  <span>{getAssetTypeLabel(item.assetType)}</span>
                </>
              )}
              renderValue={(item) => formatPercent(item.maintenanceCostRate)}
              renderTone={(item) => <span>额外成本 {formatMoney(item.extraCost)}</span>}
            />
          </div>
        </>
      )}
    </Space>
  )

  const assetListTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {listError ? <Alert type="error" showIcon message={listError} /> : null}

      <Card className="asset-library-filter-card" bordered={false}>
        <div className="asset-library-filter-grid">
          <Input
            allowClear
            placeholder="搜索名称 / 品牌 / 型号 / 序列号 / 备注"
            value={draftFilters.keyword}
            onPressEnter={handleSearch}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, keyword: event.target.value }))}
          />
          <Select
            allowClear
            placeholder="状态"
            value={draftFilters.status}
            options={ASSET_STATUS_OPTIONS}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
          />
          <Input
            allowClear
            placeholder="资产类型"
            value={draftFilters.asset_type}
            onPressEnter={handleSearch}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, asset_type: event.target.value }))}
          />
          <Input
            allowClear
            placeholder="分类"
            value={draftFilters.category}
            onPressEnter={handleSearch}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, category: event.target.value }))}
          />
        </div>
        <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-filter-footer">
          <Typography.Text type="secondary">
            当前共 {assetTotal} 项资产，支持按名称、状态、类型和分类快速筛选。
          </Typography.Text>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => setActiveTab('create')}>
              新增资产
            </Button>
            <Button onClick={handleReset}>重置</Button>
            <Button type="primary" onClick={handleSearch} loading={listLoading}>
              查询
            </Button>
          </Space>
        </Flex>
      </Card>

      {listLoading ? (
        <Card className="asset-library-panel-card" bordered={false}>
          <div className="asset-library-loading-state">
            <Spin />
          </div>
        </Card>
      ) : (
        <>
          <Card
            className="asset-library-panel-card"
            title="表格视图"
            extra={<Typography.Text type="secondary">支持高密度查看和逐行 CRUD 操作</Typography.Text>}
            bordered={false}
          >
            <Table
              rowKey="id"
              columns={tableColumns}
              dataSource={assetItems}
              pagination={false}
              scroll={{ x: 1120 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可展示的资产" /> }}
            />
          </Card>

          {assetItems.length ? (
            <div className="asset-library-card-section">
              <Flex justify="space-between" align="center" wrap gap={12}>
                <Typography.Title level={5} className="asset-library-section-title">
                  卡片视图
                </Typography.Title>
                <Typography.Text type="secondary">适合快速浏览标签、估值和关键成本指标。</Typography.Text>
              </Flex>
              <div className="asset-library-card-grid">
                {assetItems.map((asset) => (
                  <AssetListCard
                    key={asset.id}
                    asset={asset}
                    deleting={deletingId === asset.id}
                    onView={openAssetDetail}
                    onEdit={openAssetEdit}
                    onDelete={handleDeleteAsset}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Space>
  )

  const createTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="asset-library-panel-card" bordered={false}>
        <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-create-header">
          <div>
            <Typography.Title level={4} className="asset-library-section-title">
              新增资产
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="asset-library-create-copy">
              在资产库内直接完成录入，创建成功后会刷新总览、分析与资产列表，并自动回到「资产列表」页签。
            </Typography.Paragraph>
          </div>
          <Button icon={<UnorderedListOutlined />} onClick={() => setActiveTab('list')}>
            返回资产列表
          </Button>
        </Flex>
        <AssetForm form={createForm} onSubmit={handleCreateAsset} submitting={createSubmitting} submitText="创建资产" />
      </Card>
    </Space>
  )

  const lifecycleTab = assetCatalog.length ? (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {lifecycleError ? <Alert type="error" showIcon message={lifecycleError} /> : null}

      <Card className="asset-library-panel-card" bordered={false}>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <div>
            <Typography.Title level={4} className="asset-library-section-title">
              生命周期工作台
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="asset-library-create-copy">
              选择资产后可查看时间线、记录事件、补充估值，并同步刷新列表、总览、分析和详情指标。
            </Typography.Paragraph>
          </div>
          <Select
            showSearch
            value={lifecycleAssetId}
            loading={catalogLoading}
            options={assetCatalog.map((item) => ({
              value: item.id,
              label: `${item.name || '未命名资产'} · ${getAssetTypeLabel(item.asset_type)} · ${getAssetStatusLabel(item.status)}`,
            }))}
            optionFilterProp="label"
            placeholder="选择资产"
            className="asset-library-asset-selector"
            onChange={setLifecycleAssetId}
          />
        </Flex>
      </Card>

      {lifecycleLoading ? (
        <Card className="asset-library-panel-card" bordered={false}>
          <div className="asset-library-loading-state">
            <Spin />
          </div>
        </Card>
      ) : lifecycleAsset ? (
        <>
          <LifecycleAssetSummaryCard asset={lifecycleAsset} onViewDetail={openAssetDetail} onEdit={openAssetEdit} />
          <div className="asset-library-lifecycle-grid">
            <AssetEventsPanel
              assetId={lifecycleAsset.id}
              onAssetMutated={handleAssetMutated}
              title="生命周期时间线"
              showTimeline
              defaultFormOpen
            />
            <AssetValuationsPanel
              assetId={lifecycleAsset.id}
              onAssetMutated={handleAssetMutated}
              title="估值记录与录入"
              defaultFormOpen
            />
          </div>
        </>
      ) : (
        <Card className="asset-library-panel-card" bordered={false}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到可展示的生命周期资产详情" />
        </Card>
      )}
    </Space>
  ) : (
    <Card className="asset-library-panel-card" bordered={false}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有资产，先到新增资产页签完成第一条录入。">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveTab('create')}>
          去新增资产
        </Button>
      </Empty>
    </Card>
  )

  const analysisTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {!hasAssets && !catalogLoading ? (
        <Card className="asset-library-panel-card" bordered={false}>
          <ChartEmpty description="暂无资产可分析，先补充资产后再查看复盘面板。" actionLabel="新增资产" onAction={() => setActiveTab('create')} />
        </Card>
      ) : (
        <>
          <Card className="asset-library-filter-card" bordered={false}>
            <div className="asset-library-analysis-filter-grid">
              <Select
                allowClear
                placeholder="按状态筛选"
                value={analysisFilters.status}
                options={ASSET_STATUS_OPTIONS}
                onChange={(value) => setAnalysisFilters((prev) => ({ ...prev, status: value }))}
              />
              <Select
                allowClear
                placeholder="按分类筛选"
                value={analysisFilters.category}
                options={analysisCategoryOptions}
                onChange={(value) => setAnalysisFilters((prev) => ({ ...prev, category: value }))}
              />
              <Flex justify="flex-end" gap={8} wrap>
                <Button onClick={handleAnalysisReset} disabled={!analysisHasFilters}>
                  重置筛选
                </Button>
              </Flex>
            </div>
            <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-filter-footer">
              <Typography.Text type="secondary">
                分析页筛选仅影响当前页，不影响资产列表。当前纳入 {formatNumber(filteredAnalysisAssets.length)} / {formatNumber(dashboardAssets.length)} 项资产。
              </Typography.Text>
              <Typography.Text type="secondary">
                榜单点击可直接打开资产详情；维护成本相关提醒只会复用已取过的详情明细，不再为分析页批量补取全部资产详情。
              </Typography.Text>
            </Flex>
          </Card>

          {!filteredAnalysisAssets.length ? (
            <Card className="asset-library-panel-card" bordered={false}>
              <ChartEmpty description="当前筛选下没有资产，重置筛选后重试。" actionLabel="重置筛选" onAction={handleAnalysisReset} />
            </Card>
          ) : (
            <>
              <div className="asset-library-analysis-stat-grid">
                <SummaryMetricCard
                  title="总投入"
                  value={formatMoney(analysisAnalytics.portfolioTotals.totalCost)}
                  icon={<DatabaseOutlined />}
                  hint="买入成本与附加成本口径"
                  loading={catalogLoading}
                />
                <SummaryMetricCard
                  title="当前估值"
                  value={formatMoney(analysisAnalytics.portfolioTotals.currentValue)}
                  icon={<WalletOutlined />}
                  hint="按当前估值汇总"
                  loading={catalogLoading}
                />
                <SummaryMetricCard
                  title="净消费"
                  value={formatMoney(analysisAnalytics.portfolioTotals.netConsumptionCost)}
                  icon={<RiseOutlined />}
                  hint="总成本扣除当前残值"
                  loading={catalogLoading}
                />
                <SummaryMetricCard
                  title="平均残值率"
                  value={formatPercent(analysisAnalytics.portfolioTotals.averageResidualRate)}
                  icon={<FieldTimeOutlined />}
                  hint="仅对可计算残值率资产求平均"
                  loading={catalogLoading}
                />
                <SummaryMetricCard
                  title="已实现盈亏"
                  value={formatMoney(analysisAnalytics.portfolioTotals.realizedProfitLoss)}
                  icon={<WalletOutlined />}
                  hint={`已卖出 ${formatNumber(analysisAnalytics.portfolioTotals.soldCount)} 项`}
                  loading={catalogLoading}
                />
              </div>

              <div className="asset-library-overview-grid">
                <Card
                  className="asset-library-panel-card"
                  title="分类买入成本 vs 当前估值"
                  extra={<Typography.Text type="secondary">查看不同分类的投入与残值承接</Typography.Text>}
                  bordered={false}
                >
                  {analysisCategoryData.length ? (
                    <div className="asset-library-chart-wrap">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analysisCategoryData} margin={{ top: 8, right: 12, left: -8, bottom: 32 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" angle={-18} textAnchor="end" height={56} interval={0} />
                          <YAxis tickFormatter={(value) => `¥${value}`} width={72} />
                          <Tooltip formatter={(value) => formatMoney(value)} />
                          <Legend />
                          <Bar dataKey="totalCost" name="买入成本" fill={ASSET_CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                          <Bar dataKey="currentValue" name="当前估值" fill={ASSET_CHART_COLORS[1]} radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty description="暂无分类数据" />
                  )}
                </Card>

                <Card
                  className="asset-library-panel-card"
                  title="分类净消费成本 / 数量"
                  extra={<Typography.Text type="secondary">识别高投入且回收偏慢的分类</Typography.Text>}
                  bordered={false}
                >
                  {analysisCategoryData.length ? (
                    <div className="asset-library-chart-wrap">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analysisCategoryData} margin={{ top: 8, right: 12, left: -8, bottom: 32 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" angle={-18} textAnchor="end" height={56} interval={0} />
                          <YAxis yAxisId="money" tickFormatter={(value) => `¥${value}`} width={72} />
                          <YAxis yAxisId="count" orientation="right" width={48} />
                          <Tooltip formatter={(value, name) => [name === '资产数量' ? formatNumber(value) : formatMoney(value), name]} />
                          <Legend />
                          <Bar yAxisId="money" dataKey="netConsumptionCost" name="净消费成本" fill={ASSET_CHART_COLORS[2]} radius={[8, 8, 0, 0]} />
                          <Bar yAxisId="count" dataKey="count" name="资产数量" fill={ASSET_CHART_COLORS[3]} radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty description="暂无分类净消费数据" />
                  )}
                </Card>
              </div>

              <div className="asset-library-overview-grid">
                <Card
                  className="asset-library-panel-card"
                  title="状态数量分布"
                  extra={<Typography.Text type="secondary">看当前结构是否过度堆积在某个状态</Typography.Text>}
                  bordered={false}
                >
                  {analysisStatusData.length ? (
                    <div className="asset-library-chart-wrap">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={analysisStatusData} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} width={48} />
                          <Tooltip formatter={(value) => [formatNumber(value), '资产数量']} />
                          <Bar dataKey="count" name="资产数量" radius={[8, 8, 0, 0]}>
                            {analysisStatusData.map((item) => (
                              <Cell key={item.key} fill={item.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <ChartEmpty description="暂无状态分布数据" />
                  )}
                </Card>

                <Card
                  className="asset-library-panel-card"
                  title="状态估值分布"
                  extra={<Typography.Text type="secondary">把数量和价值口径拆开看</Typography.Text>}
                  bordered={false}
                >
                  {analysisStatusData.length ? (
                    <div className="asset-library-chart-wrap">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={analysisStatusData} dataKey="currentValue" nameKey="label" innerRadius={60} outerRadius={96} paddingAngle={3}>
                            {analysisStatusData.map((item) => (
                              <Cell key={item.key} fill={item.fill} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [formatMoney(value), '当前估值']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <BreakdownLegend
                        items={analysisStatusData}
                        labelRenderer={(item) => item.label}
                        secondaryKey="currentValue"
                        secondaryLabel="当前估值"
                      />
                    </div>
                  ) : (
                    <ChartEmpty description="暂无状态估值数据" />
                  )}
                </Card>
              </div>

              <div className="asset-library-overview-grid asset-library-overview-grid-three">
                <InsightListCard
                  title="净消费日均成本 Top 10"
                  description="适合识别高占用、低摊销效率资产"
                  items={analysisAnalytics.topNetDailyCostAssets}
                  emptyText="暂无可计算净日均成本的资产"
                  onAssetClick={openAssetDetail}
                  renderMeta={(item) => (
                    <>
                      <AssetStatusTag value={item.status} />
                      <span>{formatNumber(item.useDays)} 天使用</span>
                    </>
                  )}
                  renderValue={(item) => formatMoney(item.netDailyCost)}
                  renderTone={(item) => <span>净消费 {formatMoney(item.netConsumptionCost)}</span>}
                />

                <InsightListCard
                  title="维护成本占比 Top 10"
                  description="额外成本占总成本越高，越值得复盘"
                  items={analysisAnalytics.highMaintenanceCostAssets}
                  emptyText="当前筛选下暂无足够的附加成本明细，可先查看相关资产详情后再回到榜单。"
                  onAssetClick={openAssetDetail}
                  renderMeta={(item) => (
                    <>
                      <AssetStatusTag value={item.status} />
                      <span>总成本 {formatMoney(item.totalCost)}</span>
                    </>
                  )}
                  renderValue={(item) => formatPercent(item.maintenanceCostRate)}
                  renderTone={(item) => <span>额外成本 {formatMoney(item.extraCost)}</span>}
                />

                <InsightListCard
                  title="残值率最低 Top 10"
                  description="辅助识别低回收价值资产"
                  items={analysisAnalytics.lowResidualRateAssets}
                  emptyText="暂无可计算残值率的资产"
                  onAssetClick={openAssetDetail}
                  renderMeta={(item) => (
                    <>
                      <AssetStatusTag value={item.status} />
                      <span>当前估值 {formatMoney(item.currentValue)}</span>
                    </>
                  )}
                  renderValue={(item) => formatPercent(item.residualRate)}
                  renderTone={(item) => <span>净日均 {formatMoney(item.netDailyCost)}</span>}
                />
              </div>

              <div className="asset-library-overview-grid">
                <Card
                  className="asset-library-panel-card"
                  title="卖出复盘"
                  extra={<Typography.Text type="secondary">盈利与亏损只作为历史复盘，不构成建议</Typography.Text>}
                  bordered={false}
                >
                  <SoldReviewList items={analysisAnalytics.soldProfitLossAssets} onAssetClick={openAssetDetail} />
                </Card>

                <Card
                  className="asset-library-panel-card"
                  title="可处理资产"
                  extra={<Typography.Text type="secondary">只做规则提醒，不是投资建议</Typography.Text>}
                  bordered={false}
                >
                  {analysisAnalytics.topIdleAssets.length || actionableAssets.length ? (
                    <div className="asset-library-actionable-grid">
                      <div className="asset-library-actionable-block">
                        <Typography.Text strong>闲置资产</Typography.Text>
                        <List
                          dataSource={analysisAnalytics.topIdleAssets.slice(0, 5)}
                          locale={{ emptyText: '暂无闲置资产' }}
                          renderItem={(item) => (
                            <List.Item className="asset-library-actionable-item">
                              <Button type="link" className="asset-library-rank-link" onClick={() => openAssetDetail(item.id)}>
                                {item.name}
                              </Button>
                              <Typography.Text type="secondary">
                                闲置近似 {formatNumber(item.idleDays)} 天
                              </Typography.Text>
                            </List.Item>
                          )}
                        />
                      </div>
                      <div className="asset-library-actionable-block">
                        <Typography.Text strong>低残值且高日均成本</Typography.Text>
                        <List
                          dataSource={actionableAssets.slice(0, 5)}
                          locale={{ emptyText: '当前筛选下暂无明显组合提醒' }}
                          renderItem={(item) => (
                            <List.Item className="asset-library-actionable-item">
                              <Button type="link" className="asset-library-rank-link" onClick={() => openAssetDetail(item.id)}>
                                {item.name}
                              </Button>
                              <Typography.Text type="secondary">
                                残值率 {formatPercent(item.residualRate)} / 净日均 {formatMoney(item.netDailyCost)}
                              </Typography.Text>
                            </List.Item>
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <ChartEmpty description="当前筛选下暂无明确的可处理资产提醒" />
                  )}
                  <Alert
                    className="asset-library-inline-note"
                    type="info"
                    showIcon
                    message="这些提示仅用于帮助你复盘沉没成本、闲置情况和维护负担，不替代处置或购买决策。"
                  />
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </Space>
  )

  const tabItems = [
    { key: 'overview', label: '总览', children: overviewTab },
    { key: 'list', label: '资产列表', children: assetListTab },
    { key: 'create', label: '新增资产', children: createTab },
    { key: 'lifecycle', label: '生命周期', children: lifecycleTab },
    { key: 'analysis', label: '分析', children: analysisTab },
    {
      key: 'settings',
      label: '设置',
      children: (
        <Card className="asset-library-settings-card" bordered={false}>
          <div className="asset-library-settings-grid">
            <Card size="small" title="资产状态说明">
              <Space direction="vertical" size={8}>
                {ASSET_STATUS_OPTIONS.map((item) => (
                  <div key={item.value} className="asset-library-settings-row">
                    <AssetStatusTag value={item.value} />
                    <Typography.Text type="secondary">
                      {item.value === 'in_use' && '资产处于实际使用阶段，会参与使用天数与日均成本口径。'}
                      {item.value === 'idle' && '资产暂未使用，但仍保留持有与估值信息，适合关注沉没成本。'}
                      {item.value === 'on_sale' && '资产已进入出售流程，适合跟踪回收价值与退出效率。'}
                      {item.value === 'sold' && '资产已成交，可计算真实消费成本与最终盈亏。'}
                      {item.value === 'disposed' && '资产已处置，当前价值按 0 处理。'}
                      {item.value === 'lost' && '资产已遗失，当前价值按 0 处理。'}
                      {item.value === 'draft' && '资产条目已创建但资料仍待完善。'}
                      {item.value === 'retired' && '资产停止使用但不一定发生出售。'}
                    </Typography.Text>
                  </div>
                ))}
              </Space>
            </Card>
            <Card size="small" title="生命周期事件说明">
              <Space direction="vertical" size={8}>
                <Typography.Text>购买、启用、估值、维修、配件、闲置、恢复使用、出售、报废、遗失等事件将共同构成资产时间线。</Typography.Text>
                <Typography.Text type="secondary">当前已接入真实事件列表、时间线和事件录入；删除事件只删除记录本身，不回滚主表。</Typography.Text>
              </Space>
            </Card>
            <Card size="small" title="分析口径说明">
              <Space direction="vertical" size={8}>
                <Typography.Text>总成本 = 买入成本 + 额外成本。</Typography.Text>
                <Typography.Text>净消费成本 = 总成本 - 当前估值。</Typography.Text>
                <Typography.Text>维护成本占比 = 额外成本 / 总成本。</Typography.Text>
                <Typography.Text type="secondary">若列表接口缺少附加成本字段，前端会尽量补取详情兜底；无法补齐时该项不计算。</Typography.Text>
              </Space>
            </Card>
          </div>
        </Card>
      ),
    },
  ]

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card className="asset-library-hero-card" bordered={false}>
          <div className="asset-library-hero">
            <div className="asset-library-hero-copy">
              <Typography.Text className="asset-library-hero-eyebrow">Ledger Asset Library</Typography.Text>
              <Typography.Title level={2} className="asset-library-hero-title">
                资产库
              </Typography.Title>
              <Typography.Paragraph className="asset-library-hero-subtitle">
                在单一 `/assets` 页面内完成资产录入、详情查看、编辑、软删除、生命周期事件、估值记录，以及总览与分析复盘。
              </Typography.Paragraph>
              <Space wrap>
                <Tag className="asset-library-hero-tag">Phase 6 UI 细化与缺陷修复</Tag>
                <Tag className="asset-library-hero-tag">单页 Tabs 内聚合仪表盘</Tag>
                <Tag className="asset-library-hero-tag">事件 / 估值写入后联动刷新</Tag>
              </Space>
            </div>
            <div className="asset-library-hero-aside">
              <Card className="asset-library-hero-note" bordered={false}>
                <Space direction="vertical" size={8}>
                  <Typography.Text strong>本阶段范围</Typography.Text>
                  <Typography.Text type="secondary">
                    不新增子路由、不改导入与规则业务逻辑；本轮重点是 UI 细化、真实链路验收、请求减量和缺陷修复。
                  </Typography.Text>
                  <Progress percent={86} showInfo={false} strokeColor={{ from: '#1f7ae0', to: '#7c3aed' }} />
                  <Typography.Text type="secondary">Phase 6 目标：更稳的录入与复盘链路、更克制的请求、更清晰的资产界面</Typography.Text>
                </Space>
              </Card>
            </div>
          </div>
        </Card>

        <Card className="asset-library-tabs-card" bordered={false}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="asset-library-tabs" />
        </Card>
      </Space>

      <AssetDetailDrawer
        open={detailDrawer.open}
        asset={detailDrawer.asset}
        loading={detailDrawer.loading}
        error={detailDrawer.error}
        onClose={() => setDetailDrawer({ open: false, id: null, asset: null, loading: false, error: '' })}
        onEdit={(assetId) => {
          setDetailDrawer((prev) => ({ ...prev, open: false }))
          void openAssetEdit(assetId, { reopenDetail: true })
        }}
        onAssetMutated={handleAssetMutated}
      />

      <Drawer
        title={editDrawer.asset?.name ? `编辑资产 · ${editDrawer.asset.name}` : '编辑资产'}
        open={editDrawer.open}
        onClose={() => {
          setEditDrawer({
            open: false,
            id: null,
            asset: null,
            loading: false,
            submitting: false,
            error: '',
            reopenDetail: false,
          })
          editForm.resetFields()
        }}
        width="min(860px, calc(100vw - 24px))"
        destroyOnClose
        className="asset-library-drawer"
      >
        {editDrawer.error ? <Alert type="error" showIcon message={editDrawer.error} style={{ marginBottom: 16 }} /> : null}
        {editDrawer.loading ? (
          <div className="asset-library-loading-state">
            <Spin />
          </div>
        ) : editDrawer.open ? (
          <AssetForm
            form={editForm}
            mode="edit"
            onSubmit={handleUpdateAsset}
            submitting={editDrawer.submitting}
            onCancel={() => {
              setEditDrawer({
                open: false,
                id: null,
                asset: null,
                loading: false,
                submitting: false,
                error: '',
                reopenDetail: false,
              })
              editForm.resetFields()
            }}
            submitText="保存修改"
          />
        ) : null}
      </Drawer>
    </>
  )
}
