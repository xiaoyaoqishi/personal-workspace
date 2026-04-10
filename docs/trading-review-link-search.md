# Review Linked-Trade Search & Display

## New API

- Endpoint: `GET /api/trades/search-options`
- Purpose: 复盘关联交易的轻量检索，不依赖交易列表分页。
- Query:
  - `q`: 关键词（trade_id/contract/symbol/source）
  - `symbol`
  - `date_from`
  - `date_to`
  - `status`
  - `limit`（默认 30，最大 50）
  - `include_ids`（逗号分隔，保证已选交易可回填）
- Response:
  - `items[]`:
    - `trade_id`
    - `trade_date`
    - `symbol`
    - `contract`
    - `direction`
    - `quantity`
    - `open_price`
    - `close_price`
    - `status`
    - `pnl`
    - `source_display`
    - `has_trade_review`
    - `review_conclusion`

## Frontend workflow

- `ReviewList` 不再 preload `tradeApi.list(page=1,size=300)`。
- 使用防抖远程检索（300ms）：
  - 输入关键词即时搜索；
  - 支持 symbol/status/date filters；
  - 编辑态使用 `include_ids` 保证已关联样本始终可回显。

## Linked-trade display contract

- 选择器主标签：
  - 日期 + 中文品种名 + 方向 + 手数 + 开/平 + PnL + 来源（ID 仅辅助）。
- 只读卡片主信息：
  - trade_date
  - 中文品种名
  - contract
  - direction
  - quantity
  - open/close price
  - pnl
  - source
  - role
  - review_conclusion（可用时）

## Compatibility

- 不改变 paste import、匹配规则、统计/持仓语义。
- 不改变 canonical enum/symbol 的后端存储。
