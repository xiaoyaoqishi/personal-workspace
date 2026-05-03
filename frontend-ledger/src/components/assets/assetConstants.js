import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const CHINA_TIMEZONE = 'Asia/Shanghai'

export const ASSET_STATUS_LABELS = {
  draft: '草稿',
  in_use: '使用中',
  idle: '闲置',
  on_sale: '出售中',
  sold: '已卖出',
  retired: '已退役',
  disposed: '已处置',
  lost: '已遗失',
}

export const ASSET_STATUS_COLORS = {
  draft: 'default',
  in_use: 'processing',
  idle: 'gold',
  on_sale: 'purple',
  sold: 'success',
  retired: 'geekblue',
  disposed: 'volcano',
  lost: 'red',
}

export const ASSET_STATUS_CHART_COLORS = {
  draft: '#94a3b8',
  in_use: '#1f7ae0',
  idle: '#f59e0b',
  on_sale: '#7c3aed',
  sold: '#16a34a',
  retired: '#475569',
  disposed: '#ea580c',
  lost: '#dc2626',
}

export const ASSET_CHART_COLORS = ['#1f7ae0', '#0f9d58', '#f59e0b', '#7c3aed', '#06b6d4', '#ef4444', '#334155', '#f97316']

export const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({ value, label }))

export const ASSET_TYPE_LABELS = {
  electronics: '电子设备',
  appliance: '家电',
  furniture: '家具',
  vehicle: '交通工具',
  accessory: '配件',
  subscription: '长期服务',
  collectible: '收藏品',
}

export const ASSET_TYPE_OPTIONS = Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export const EMPTY_VALUE = '--'

export const ASSET_EVENT_TYPE_LABELS = {
  purchase: '购入',
  start_use: '开始使用',
  repair: '维修',
  maintenance: '保养',
  accessory: '增加配件',
  usage: '使用打卡',
  idle: '转为闲置',
  resume: '重新启用',
  on_sale: '开始挂售',
  sell: '卖出',
  retire: '退役',
  dispose: '报废',
  lost: '丢失',
  note: '备注',
}

export const ASSET_EVENT_TYPE_COLORS = {
  purchase: 'blue',
  start_use: 'processing',
  repair: 'orange',
  maintenance: 'gold',
  accessory: 'purple',
  usage: 'green',
  idle: 'default',
  resume: 'lime',
  on_sale: 'magenta',
  sell: 'success',
  retire: 'geekblue',
  dispose: 'volcano',
  lost: 'red',
  note: 'default',
}

export const ASSET_EVENT_TYPE_OPTIONS = Object.entries(ASSET_EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export const ASSET_EVENT_HINTS = {
  sell: '卖出事件会将资产状态更新为已卖出，并记录卖出价格与结束日期。',
  dispose: '报废事件会将资产状态更新为已报废，并记录结束日期。',
  lost: '丢失事件会将资产状态更新为已遗失，并记录结束日期。',
  repair: '维修事件会将金额累计到附加成本。',
  maintenance: '保养事件会将金额累计到附加成本。',
  accessory: '配件事件会将金额累计到附加成本。',
  start_use: '开始使用事件会将状态更新为使用中，并回写开始使用日期。',
  usage: '使用打卡会将使用次数加 1。',
  idle: '转为闲置事件会切换资产状态为闲置。',
  resume: '重新启用事件会切换资产状态回使用中。',
}

export function getAssetStatusLabel(value) {
  return ASSET_STATUS_LABELS[value] || value || '未知状态'
}

export function getAssetStatusColor(value) {
  return ASSET_STATUS_COLORS[value] || 'default'
}

export function getAssetTypeLabel(value) {
  return ASSET_TYPE_LABELS[value] || value || '未分类类型'
}

export function getAssetEventTypeLabel(value) {
  return ASSET_EVENT_TYPE_LABELS[value] || value || '未知事件'
}

export function getAssetEventTypeColor(value) {
  return ASSET_EVENT_TYPE_COLORS[value] || 'default'
}

export function getAssetEventHint(value) {
  return ASSET_EVENT_HINTS[value] || ''
}

export function displayEmpty(value, fallback = EMPTY_VALUE) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string' && !value.trim()) return fallback
  return value
}

export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

export function formatMoney(value) {
  const amount = toFiniteNumber(value)
  if (amount === null) return EMPTY_VALUE
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value) {
  const amount = toFiniteNumber(value)
  if (amount === null) return EMPTY_VALUE
  return `${(amount * 100).toFixed(1)}%`
}

export function formatDate(value) {
  if (!value) return EMPTY_VALUE
  const date = toShanghaiDayjs(value)
  if (!date.isValid()) {
    return String(value)
  }
  return date.format('YYYY-MM-DD')
}

export function formatDateTime(value) {
  if (!value) return EMPTY_VALUE
  const date = toShanghaiDayjs(value)
  if (!date.isValid()) {
    return String(value)
  }
  return date.format('YYYY-MM-DD HH:mm')
}

function hasExplicitTimezone(value) {
  if (typeof value !== 'string') return false
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim())
}

export function toShanghaiDayjs(value) {
  if (value === null || value === undefined || value === '') {
    return dayjs('')
  }
  if (hasExplicitTimezone(value)) {
    return dayjs(value).tz(CHINA_TIMEZONE)
  }
  return dayjs.tz(value, CHINA_TIMEZONE)
}

export function shanghaiNow() {
  return dayjs().tz(CHINA_TIMEZONE)
}

export function formatNumber(value, digits = 0) {
  const amount = toFiniteNumber(value)
  if (amount === null) return EMPTY_VALUE
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

export function getChartColor(index, fallback = '#1f7ae0') {
  if (!Number.isInteger(index) || index < 0) return fallback
  return ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length]
}

export function getAssetMetric(metrics, key, fallback = null) {
  if (!metrics || typeof metrics !== 'object') return fallback
  const value = toFiniteNumber(metrics[key])
  return value === null ? fallback : value
}
