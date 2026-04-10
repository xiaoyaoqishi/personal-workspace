# Trading Analytics + Localization Notes

## Canonical Value Policy

- Backend canonical taxonomy values remain English keys:
  - `opportunity_structure`
  - `edge_source`
  - `failure_type`
  - `review_conclusion`
- API write/read payload values for structured review continue using canonical English keys.
- Frontend displays Chinese labels through centralized mapping only.

Mapping module:
- `frontend/src/features/trading/localization.js`
  - `TAXONOMY_ZH`
  - `getTaxonomyLabel(field, canonicalValue)`
  - `taxonomyOptionsWithZh(field, values)`

## New Analytics Endpoint

- Added additive endpoint: `GET /api/trades/analytics`
- Existing endpoints and semantics are unchanged:
  - `/api/trades/import-paste`
  - `/api/trades/statistics`
  - `/api/trades/positions`

### Analytics dimensions returned

1. `overview`
- total/open/closed trades
- win/loss count
- win rate
- total pnl
- avg pnl per closed trade
- avg win/avg loss
- profit factor
- sharpe ratio (daily pnl approximation)
- commission/net-profit ratio
- profit share rate
- total commission / gross profit / gross loss
- avg win-loss ratio / pnl standard deviation / max drawdown
- open position count

2. `time_series`
- `daily` / `weekly` / `monthly`
- trade_count / win_count / loss_count / win_rate / total_pnl

3. `dimensions`
- `by_symbol`
- `by_source` (metadata-first, notes fallback)
- `by_review_field` (taxonomy slices)

4. `behavior`
- error tag frequencies
- planned vs unplanned
- strategy_type / market_condition / timeframe distributions
- overnight split

5. `positions`
- open positions summary rows

6. `coverage`
- TradeReview coverage
- TradeSourceMetadata coverage
- legacy-source-only count
- source-missing count

## Dashboard Data Sources

- Main analytics page now reads `tradeApi.analytics(...)`.
- Source filter options still come from `/api/trades/sources`.
- Structured review dimensions use canonical keys from backend and render Chinese labels in UI.
- 时间维度主图采用双 Y 轴：
  - 左轴：净盈亏（`total_pnl`）
  - 右轴：胜率（`win_rate`, 0-100%）
  - 目的是避免在大额 pnl 场景下胜率曲线被压扁。

## Metric Formula Definitions (this sprint)

- `夏普比率 (sharpe_ratio)`  
  - 基于日度已平仓 pnl 序列近似计算：`mean(daily_pnl) / std(daily_pnl) * sqrt(252)`  
  - 使用样本标准差（n-1）；当样本不足或标准差为 0 时返回 0。
- `手续费/净利润 (commission_to_net_profit_ratio)`  
  - `total_commission / total_pnl`  
  - 当 `total_pnl <= 0` 时返回 `null`（避免不可解释或误导性的负比值）。
- `盈利占比 (profit_share_rate)`  
  - `gross_profit / (gross_profit + abs(gross_loss)) * 100%`  
  - 无盈亏样本时返回 0。
- `盈亏因子 (profit_factor)`  
  - `gross_profit / abs(gross_loss)`，当无亏损样本时保持返回 0（兼容既有语义）。
- `平均盈亏比 (avg_win_loss_ratio)`  
  - `avg_win / abs(avg_loss)`，当无亏损样本时返回 0。
- `盈亏波动度 (pnl_std_dev)`  
  - 已平仓单笔 pnl 的样本标准差。
- `最大回撤 (max_drawdown)`  
  - 按已平仓 pnl 累计曲线计算峰值到谷值的最大回撤金额。

## Compatibility Notes

- Paste import workflow and matching logic remain unchanged.
- Broker-scoped matching, same-batch close-before-open, partial close split semantics remain unchanged.
- Legacy `notes` and `review_note` remain available as secondary compatibility fields in workspace forms/panels.
- Existing analytics field meanings are unchanged;新增指标为 additive 字段。
