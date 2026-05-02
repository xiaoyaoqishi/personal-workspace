import { toFiniteNumber } from './assetConstants'

const ACTIVE_ASSET_STATUSES = new Set(['in_use'])

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const amount = toFiniteNumber(value)
    if (amount !== null) {
      return amount
    }
  }
  return null
}

function sortEntries(entries, selector, direction = 'desc', limit = 10) {
  const normalized = entries
    .map((entry) => ({
      entry,
      score: selector(entry),
    }))
    .filter((item) => item.score !== null && item.score !== undefined && Number.isFinite(item.score))

  normalized.sort((left, right) => {
    const delta = direction === 'asc' ? left.score - right.score : right.score - left.score
    if (delta !== 0) return delta
    return String(left.entry.name || '').localeCompare(String(right.entry.name || ''), 'zh-CN')
  })

  return normalized.slice(0, limit).map((item) => item.entry)
}

export function buildAssetMetricsSnapshot(asset) {
  const metrics = asset?.metrics || {}
  const purchasePrice = pickFirstNumber(asset?.purchase_price, 0) ?? 0
  const extraCost = pickFirstNumber(asset?.extra_cost, 0) ?? 0
  const salePrice = pickFirstNumber(asset?.sale_price)
  const holdingDays = pickFirstNumber(metrics.holding_days, asset?.holding_days)
  const useDays = pickFirstNumber(metrics.use_days, asset?.use_days)

  const totalCost = pickFirstNumber(metrics.total_cost, purchasePrice + extraCost)
  const realizedConsumptionCost =
    pickFirstNumber(metrics.realized_consumption_cost) ??
    (salePrice !== null && totalCost !== null ? roundNumber(totalCost - salePrice) : null)
  const cashDailyCost =
    pickFirstNumber(metrics.cash_daily_cost) ??
    (totalCost !== null && useDays && useDays > 0 ? roundNumber(totalCost / useDays) : null)
  const realizedDailyCost =
    pickFirstNumber(metrics.realized_daily_cost) ??
    (realizedConsumptionCost !== null && useDays && useDays > 0 ? roundNumber(realizedConsumptionCost / useDays) : null)
  const profitLoss =
    pickFirstNumber(metrics.profit_loss) ??
    (salePrice !== null && totalCost !== null ? roundNumber(salePrice - totalCost) : null)
  const idleDays = pickFirstNumber(
    asset?.idle_days,
    holdingDays !== null && useDays !== null ? Math.max(holdingDays - useDays, 0) : null,
    holdingDays,
  )

  return {
    ...metrics,
    holding_days: holdingDays,
    use_days: useDays,
    total_cost: totalCost,
    realized_consumption_cost: realizedConsumptionCost,
    cash_daily_cost: cashDailyCost,
    realized_daily_cost: realizedDailyCost,
    profit_loss: profitLoss,
    idle_days: idleDays,
  }
}

function buildAssetEntry(asset) {
  const metrics = buildAssetMetricsSnapshot(asset)
  const assetType = asset?.asset_type || ''
  const purchasePrice = pickFirstNumber(asset?.purchase_price, 0) ?? 0
  const extraCost = pickFirstNumber(asset?.extra_cost, 0) ?? 0
  const salePrice = pickFirstNumber(asset?.sale_price)

  return {
    id: asset?.id,
    name: asset?.name || '未命名资产',
    status: asset?.status || 'draft',
    category: asset?.category || '未分类',
    assetType,
    asset_type: assetType,
    purchasePrice,
    purchase_price: purchasePrice,
    extraCost,
    extra_cost: extraCost,
    salePrice,
    sale_price: salePrice,
    totalCost: metrics.total_cost,
    total_cost: metrics.total_cost,
    cashDailyCost: metrics.cash_daily_cost,
    cash_daily_cost: metrics.cash_daily_cost,
    realizedConsumptionCost: metrics.realized_consumption_cost,
    realized_consumption_cost: metrics.realized_consumption_cost,
    realizedDailyCost: metrics.realized_daily_cost,
    realized_daily_cost: metrics.realized_daily_cost,
    profitLoss: metrics.profit_loss,
    profit_loss: metrics.profit_loss,
    holdingDays: metrics.holding_days,
    holding_days: metrics.holding_days,
    useDays: metrics.use_days,
    use_days: metrics.use_days,
    idleDays: metrics.idle_days,
    idle_days: metrics.idle_days,
    purchaseDate: asset?.purchase_date || null,
    updatedAt: asset?.updated_at || null,
    includeInNetWorth: Boolean(asset?.include_in_net_worth),
    metrics,
    asset,
  }
}

function buildGroupedBreakdown(entries, key) {
  const groups = new Map()

  entries.forEach((entry) => {
    const groupKey = entry[key] || (key === 'category' ? '未分类' : '未知状态')
    const current = groups.get(groupKey) || {
      key: groupKey,
      count: 0,
      purchaseCost: 0,
      extraCost: 0,
      totalCost: 0,
    }

    current.count += 1
    current.purchaseCost += entry.purchasePrice ?? 0
    current.extraCost += entry.extraCost ?? 0
    current.totalCost += entry.totalCost ?? 0
    groups.set(groupKey, current)
  })

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      purchaseCost: roundNumber(item.purchaseCost) ?? 0,
      extraCost: roundNumber(item.extraCost) ?? 0,
      totalCost: roundNumber(item.totalCost) ?? 0,
    }))
    .sort((left, right) => {
      if (right.totalCost !== left.totalCost) return right.totalCost - left.totalCost
      if (right.count !== left.count) return right.count - left.count
      return String(left.key).localeCompare(String(right.key), 'zh-CN')
    })
}

export function computeAssetAnalytics(assets = []) {
  const entries = (Array.isArray(assets) ? assets : [])
    .map((asset) => buildAssetEntry(asset))
    .filter((entry) => entry.id !== null && entry.id !== undefined)

  const portfolioTotals = {
    totalPurchaseCost: roundNumber(entries.reduce((sum, entry) => sum + (entry.purchasePrice ?? 0), 0)) ?? 0,
    totalExtraCost: roundNumber(entries.reduce((sum, entry) => sum + (entry.extraCost ?? 0), 0)) ?? 0,
    totalCost: roundNumber(entries.reduce((sum, entry) => sum + (entry.totalCost ?? 0), 0)) ?? 0,
    totalRealizedProfitLoss: roundNumber(entries.reduce((sum, entry) => sum + (entry.profitLoss ?? 0), 0)) ?? 0,
    activeCount: entries.filter((entry) => ACTIVE_ASSET_STATUSES.has(entry.status)).length,
    idleCount: entries.filter((entry) => entry.status === 'idle').length,
    soldCount: entries.filter((entry) => entry.status === 'sold').length,
  }

  return {
    items: entries,
    byStatus: buildGroupedBreakdown(entries, 'status'),
    byCategory: buildGroupedBreakdown(entries, 'category'),
    topDailyCostAssets: sortEntries(entries, (entry) => entry.cashDailyCost, 'desc', 10),
    topIdleAssets: sortEntries(entries.filter((entry) => entry.status === 'idle'), (entry) => entry.idleDays, 'desc', 10),
    topExtraCostAssets: sortEntries(entries, (entry) => entry.extraCost, 'desc', 10),
    soldProfitLossAssets: entries
      .filter((entry) => entry.status === 'sold' && entry.profitLoss !== null)
      .sort((left, right) => Math.abs(right.profitLoss) - Math.abs(left.profitLoss))
      .slice(0, 10),
    portfolioTotals,
  }
}
