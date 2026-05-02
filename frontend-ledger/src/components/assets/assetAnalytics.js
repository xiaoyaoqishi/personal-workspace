import { toFiniteNumber } from './assetConstants'

const ACTIVE_ASSET_STATUSES = new Set(['draft', 'in_use', 'on_sale'])

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
  const purchasePrice = pickFirstNumber(asset?.purchase_price)
  const extraCost = pickFirstNumber(asset?.extra_cost)
  const salePrice = pickFirstNumber(asset?.sale_price)
  const currentValue = pickFirstNumber(asset?.current_value, asset?.value_after, 0)

  const totalCost =
    pickFirstNumber(metrics.total_cost) ??
    (purchasePrice !== null || extraCost !== null ? roundNumber((purchasePrice ?? 0) + (extraCost ?? 0)) : null)

  const netConsumptionCost =
    pickFirstNumber(metrics.net_consumption_cost) ??
    (totalCost !== null && currentValue !== null ? roundNumber(totalCost - currentValue) : null)

  const realizedConsumptionCost =
    pickFirstNumber(metrics.realized_consumption_cost) ??
    (salePrice !== null && totalCost !== null ? roundNumber(totalCost - salePrice) : null)

  const holdingDays = pickFirstNumber(metrics.holding_days, asset?.holding_days)
  const useDays = pickFirstNumber(metrics.use_days, asset?.use_days)

  const cashDailyCost =
    pickFirstNumber(metrics.cash_daily_cost) ??
    (totalCost !== null && useDays && useDays > 0 ? roundNumber(totalCost / useDays) : null)

  const netDailyCost =
    pickFirstNumber(metrics.net_daily_cost) ??
    (netConsumptionCost !== null && useDays && useDays > 0 ? roundNumber(netConsumptionCost / useDays) : null)

  const realizedDailyCost =
    pickFirstNumber(metrics.realized_daily_cost) ??
    (realizedConsumptionCost !== null && useDays && useDays > 0 ? roundNumber(realizedConsumptionCost / useDays) : null)

  const residualRate =
    pickFirstNumber(metrics.residual_rate) ??
    (totalCost !== null && totalCost > 0 && currentValue !== null ? roundNumber(currentValue / totalCost, 4) : null)

  const profitLoss =
    pickFirstNumber(metrics.profit_loss) ??
    (salePrice !== null && totalCost !== null ? roundNumber(salePrice - totalCost) : null)

  const maintenanceCostRate =
    extraCost !== null && totalCost !== null && totalCost > 0 ? roundNumber(extraCost / totalCost, 4) : null

  const idleDays = pickFirstNumber(
    metrics.idle_days,
    asset?.idle_days,
    holdingDays !== null && useDays !== null ? Math.max(holdingDays - useDays, 0) : null,
    holdingDays,
  )

  return {
    ...metrics,
    holding_days: holdingDays,
    use_days: useDays,
    total_cost: totalCost,
    net_consumption_cost: netConsumptionCost,
    realized_consumption_cost: realizedConsumptionCost,
    cash_daily_cost: cashDailyCost,
    net_daily_cost: netDailyCost,
    realized_daily_cost: realizedDailyCost,
    residual_rate: residualRate,
    profit_loss: profitLoss,
    maintenance_cost_rate: maintenanceCostRate,
    idle_days: idleDays,
    current_value: currentValue,
  }
}

function buildAssetEntry(asset) {
  const metrics = buildAssetMetricsSnapshot(asset)
  return {
    id: asset?.id,
    name: asset?.name || '未命名资产',
    status: asset?.status || 'draft',
    category: asset?.category || '未分类',
    assetType: asset?.asset_type || '',
    currentValue: pickFirstNumber(metrics.current_value, asset?.current_value, 0) ?? 0,
    totalCost: metrics.total_cost,
    netConsumptionCost: metrics.net_consumption_cost,
    residualRate: metrics.residual_rate,
    cashDailyCost: metrics.cash_daily_cost,
    netDailyCost: metrics.net_daily_cost,
    realizedConsumptionCost: metrics.realized_consumption_cost,
    realizedDailyCost: metrics.realized_daily_cost,
    profitLoss: metrics.profit_loss,
    holdingDays: metrics.holding_days,
    useDays: metrics.use_days,
    idleDays: metrics.idle_days,
    maintenanceCostRate: metrics.maintenance_cost_rate,
    extraCost: pickFirstNumber(asset?.extra_cost),
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
      totalCost: 0,
      currentValue: 0,
      netConsumptionCost: 0,
    }

    current.count += 1
    current.totalCost += entry.totalCost ?? 0
    current.currentValue += entry.currentValue ?? 0
    current.netConsumptionCost += entry.netConsumptionCost ?? 0
    groups.set(groupKey, current)
  })

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      totalCost: roundNumber(item.totalCost) ?? 0,
      currentValue: roundNumber(item.currentValue) ?? 0,
      netConsumptionCost: roundNumber(item.netConsumptionCost) ?? 0,
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

  const residualRates = entries.map((entry) => entry.residualRate).filter((value) => value !== null)
  const portfolioTotals = {
    totalCost: roundNumber(entries.reduce((sum, entry) => sum + (entry.totalCost ?? 0), 0)) ?? 0,
    currentValue: roundNumber(entries.reduce((sum, entry) => sum + (entry.currentValue ?? 0), 0)) ?? 0,
    netConsumptionCost: roundNumber(entries.reduce((sum, entry) => sum + (entry.netConsumptionCost ?? 0), 0)) ?? 0,
    realizedProfitLoss: roundNumber(entries.reduce((sum, entry) => sum + (entry.profitLoss ?? 0), 0)) ?? 0,
    averageResidualRate:
      residualRates.length ? roundNumber(residualRates.reduce((sum, value) => sum + value, 0) / residualRates.length, 4) : null,
    activeCount: entries.filter((entry) => ACTIVE_ASSET_STATUSES.has(entry.status)).length,
    idleCount: entries.filter((entry) => entry.status === 'idle').length,
    soldCount: entries.filter((entry) => entry.status === 'sold').length,
  }

  return {
    items: entries,
    byStatus: buildGroupedBreakdown(entries, 'status'),
    byCategory: buildGroupedBreakdown(entries, 'category'),
    topNetDailyCostAssets: sortEntries(entries, (entry) => entry.netDailyCost, 'desc', 10),
    topResidualRateAssets: sortEntries(entries, (entry) => entry.residualRate, 'desc', 10),
    lowResidualRateAssets: sortEntries(entries, (entry) => entry.residualRate, 'asc', 10),
    topIdleAssets: sortEntries(entries.filter((entry) => entry.status === 'idle'), (entry) => entry.idleDays, 'desc', 10),
    soldProfitLossAssets: entries
      .filter((entry) => entry.status === 'sold' && entry.profitLoss !== null)
      .sort((left, right) => Math.abs(right.profitLoss) - Math.abs(left.profitLoss))
      .slice(0, 10),
    highMaintenanceCostAssets: sortEntries(entries, (entry) => entry.maintenanceCostRate, 'desc', 10),
    portfolioTotals,
  }
}
