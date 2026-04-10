# Trading-Record Bugfix Audit (2026-04 Sprint)

## 1) 已复现问题与根因

### BUG-1: Review 关联交易经常“找不到已有交易”
- 代码位点：
  - `frontend/src/pages/ReviewList.jsx`（旧实现一次性加载 `tradeApi.list({ page: 1, size: 300 })`）
  - `backend/main.py` `/api/trades` 对 `size` 限制 `<= 200`
- 根因：
  - 前端请求超出后端限制，返回 422，导致 options 常为空。
  - 旧方案仅预加载首页，无法覆盖大数据量和新导入数据。

### BUG-2: 部分下拉出现“No Data”影响工作流
- 代码位点：
  - Review 关联交易选择器依赖一次性 preload。
  - TradeReview taxonomy 拉取失败时，部分编辑页直接落到空 options。
- 根因：
  - options 依赖单点请求且缺少回退。
  - 无远程搜索、无已选回填机制。

## 2) 审计范围与现状结论

### review trade options 加载路径
- `frontend/src/pages/ReviewList.jsx`：已改为远程检索，不再固定 preload 首页。

### dropdown/select 数据源
- taxonomy-driven:
  - `frontend/src/features/trading/workspace/useTradeWorkspace.js`
  - `frontend/src/pages/TradeForm.jsx`
  - 已增加 taxonomy 常量回退。
- source/broker/tag:
  - tags 编辑均为 `mode="tags"`，保持自由输入；
  - broker 导入为 `AutoComplete`，保持自由输入；
  - review-link select 已改为远程检索 + 空态可继续输入。

### 读写双态
- `TradeDetailDrawer`、`ReviewList`、`BrokerManage` 已统一 read/edit 操作模式（默认读态 + 显式编辑 + 保存/取消）。
- `/trades/:id/edit` 保持深度编辑页定位（创建/全面编辑）。

### linked trades 主展示内容
- 已从“ID 优先”改为“交易信息优先”，ID 降级为辅助信息。

### 中文品种显示
- 新增集中 display 层，活跃路径统一通过 display helper 输出中文名（保留 canonical symbol 存储）。

### 多标签一致性
- 前端统一 `normalizeTagList` 去重/清洗逻辑，覆盖 review/knowledge/trade-review 主流程。

## 3) 本轮修复策略摘要

1. 新增后端轻量检索接口 `/api/trades/search-options`。
2. Review 关联交易改为防抖远程搜索（支持 query/symbol/date/status/include_ids）。
3. taxonomy 下拉增加失败回退常量，避免“空 options 阻断编辑”。
4. 抽取通用 read/edit actions 组件，统一主编辑工作台行为。
5. 引入集中 display 层（品种、角色、标签、关联交易摘要）并在活跃路径复用。
