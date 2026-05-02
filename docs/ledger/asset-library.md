# Ledger Asset Library

> 2026-05-02：资产库 V1 已完成最终收尾。本文件当前同时承担范围边界、实现决策、验收结论与后续阶段建议的沉淀职责。

## 1. Scope
- 资产库属于 `ledger` 域内独立子模块，负责长期资产资料沉淀、标签化组织、生命周期追踪与估值记录。
- Phase 1A 只落后端数据模型与 Pydantic Schema，为后续 service / API / 前端提供稳定契约。
- 明确不做：
  - 不接入交易流水、导入中心、复核工作台、规则管理、商户词典、基础分析的业务逻辑。
  - 不实现前端页面。
  - 不实现资产库 API endpoint。
  - 不实现复杂计算或自动估值逻辑。

## 2. User Journeys
- Phase 1A 先服务后续三类链路：
  - 资产录入：建立资产基础资料、标签、图片、持有状态。
  - 生命周期记录：记录购买、启用、维修、闲置、出售、报废等事件。
  - 估值追踪：记录手动估值、折旧估值、市场估值与清零状态。

## 3. Information Architecture
- 核心实体：
  - `LedgerAsset`：资产稳定信息与当前状态。
  - `LedgerAssetEvent`：生命周期事件流水。
  - `LedgerAssetValuation`：估值历史。
- 存储约定：
  - 标签与图片在数据库中使用 `tags_json` / `images_json` 文本存储，对外 schema 使用 `list[str]`。
  - 生命周期事件扩展字段使用 `metadata_json` 文本存储。
- 资产状态（字符串）：
  - `draft`
  - `in_use`
  - `idle`
  - `on_sale`
  - `sold`
  - `retired`
  - `disposed`
  - `lost`
- 生命周期事件类型（字符串）：
  - `purchase`
  - `start_use`
  - `valuation`
  - `repair`
  - `maintenance`
  - `accessory`
  - `usage`
  - `idle`
  - `resume`
  - `on_sale`
  - `sell`
  - `retire`
  - `dispose`
  - `lost`
  - `note`
- 估值类型（字符串）：
  - `manual`
  - `depreciation`
  - `market`
  - `sale`
  - `zero`

## 4. API and Backend Design
- Router 仅负责参数接收、依赖注入和转发；资产库领域逻辑后续进入 `backend/services/ledger/` 下 dedicated service。
- Phase 1B 新增独立 router：`backend/routers/ledger_assets.py`，命名空间为 `/api/ledger/assets`，避免污染现有导入、规则、商户与分析接口。
- ORM 模型继续挂在 `backend/models/ledger.py`，保持 ledger 域聚合。
- 资产库模型不依赖 `ledger_transactions`，保证与账务交易流水隔离。
- 自动建表继续依赖 `Base.metadata.create_all()`；新增模型需保持可被 `models` 模块导入。
- 事件删除一期约束：删除 `LedgerAssetEvent` 仅删除事件记录，不自动回滚资产主表状态、成本或估值。

## 5. UI/UX Principles
- Phase 2 起前端入口统一放在 `frontend-ledger` 单一一级菜单“资产库”下，主页面采用 Tabs 组织，避免在侧边栏继续拆多个子入口。
- 总览与资产列表优先接真实只读接口；新增资产、生命周期事件、估值编辑等写操作放到后续阶段逐步接入。
- 页面应围绕“高信息密度 + 清晰状态解释 + 一致批量操作链路”设计。

## 6. Milestones
- Phase 1A：
  - 完成 `LedgerAsset` / `LedgerAssetEvent` / `LedgerAssetValuation` ORM 模型。
  - 完成资产库专用 schema 文件 `backend/schemas/ledger_assets.py`。
  - 预留 `LedgerAssetMetricsOut` 字段结构：`total_cost`、`net_consumption_cost`、`realized_consumption_cost`、`cash_daily_cost`、`net_daily_cost`、`realized_daily_cost`、`residual_rate`、`profit_loss`、`holding_days`、`use_days`。
  - 保持现有 ledger 业务无行为变更。
- Phase 1B：
  - 补资产库 service、基础 CRUD API、列表/详情输出转换。
  - 定义标签/图片/事件/估值的最小写入与查询链路。
  - 实现 summary 指标与 owner_role 隔离测试。
- Phase 2：
  - 新增 `frontend-ledger` 中的 `/assets` 入口与单页面 Tabs 骨架。
  - 接入 `GET /api/ledger/assets/summary` 与 `GET /api/ledger/assets` 只读联调。
  - 其余页签先保留建设中说明，避免提前铺开不可用表单。
- Phase 3A：
  - 在 `/assets` 单页面内补齐资产新增、详情查看、编辑、软删除闭环。
  - 资产列表同时保留高密度表格与卡片视图，操作统一为“查看详情 / 编辑 / 软删除”。
  - 新增资产表单分区为基础信息、成本与价值、日期与生命周期、管理信息，并提供实时成本预估。
  - 详情展示优先使用后端 `metrics`，无值统一展示 `--`，避免前端散落空值兜底逻辑。
  - 编辑表单复用新增表单字段，不在 `/assets` 外新开独立业务入口。
- Phase 4：
  - 在资产详情 Drawer 内补齐生命周期事件列表、估值记录列表、事件录入、估值录入。
  - 生命周期页签改为真实工作台，统一承载资产选择、摘要卡、时间线、估值记录和新增表单。
  - 事件与估值录入成功后统一刷新资产详情、资产列表、总览和生命周期摘要，确保 `current_value` 与 `metrics` 同步。
  - 事件删除能力仅删除事件记录，不自动回滚资产主表状态、成本和估值，前端需明确提示该约束。
- Phase 5A：
  - 在 `/assets` 的“总览”页签补齐 KPI、状态/分类分布图和重点提醒卡，形成单页资产仪表盘。
  - 将“分析”页签从占位态改为真实分析工作区，支持按状态/分类前端筛选。
  - 新增前端分析 util，优先使用 `listAssets` 的 `metrics` 与 `summary` 数据派生组合指标、榜单与可处理资产提示。
  - 生命周期事件与估值写入后继续统一刷新总览、分析、资产列表与详情 Drawer，避免多处指标漂移。
- Phase 6：
  - 已完成 `/assets` 页面 UI 细化、交互打磨、真实链路验收与缺陷修复，不新增后端接口与前端大功能。
  - 已完成 Hero、KPI、榜单、Drawer、表单与生命周期工作台的层级、留白、长文本与空状态表现收尾。
  - 已完成新增/编辑/删除/新增事件/新增估值后的刷新链路与状态同步验收。
  - 已完成分析页与总览页请求开销检查；分析页不再为全部资产批量调用 `getAsset`，并补了冷启动共享 inflight 去重，避免开发实机下重复请求放大。

## 7. Phase 3A Decisions
- 前端 CRUD 闭环优先复用现有 `createAsset / getAsset / updateAsset / deleteAsset / getAssetSummary / listAssets` 接口，不为本阶段新增生命周期事件或估值写入口。
- `asset_type` 在后端 schema 中仍是必填字符串；前端录入默认值设为 `electronics`，避免为了表单宽松交互改动后端契约。
- 软删除沿用现有后端实现：删除后默认列表不再展示，详情访问视为不存在，不增加“回收站式恢复”能力。
- 本阶段不扩展分析页、不接入导入中心/复核工作台/商户词典/规则管理新逻辑，保证改动范围局部化。

## 8. Phase 4 Decisions
- 生命周期事件与估值记录继续集中在 `/assets` 主页面内，不新增子路由、不新增侧边栏入口。
- 详情 Drawer 与生命周期页签共用同一套事件/估值面板组件，避免两套表单和展示逻辑后续漂移。
- 事件类型、估值类型、日期时间、空值展示统一收口到 `assetConstants.js`，不在 JSX 中散落映射和提示文案。
- 本阶段不接市场价格抓取、自动折旧、OCR、账务流水联动，仅围绕手动事件与手动估值闭环实现。

## 9. Phase 5A Decisions
- 总览与分析仍集中在 `/assets` 单页面内，不新增侧边栏入口、不新增独立资产库子路由。
- 前端新增资产分析 util，统一派生 `byStatus`、`byCategory`、残值率榜单、闲置榜单、卖出盈亏与组合汇总，避免在 JSX 中散落 `reduce` 逻辑。
- 分析页筛选状态与分类仅影响分析页，不回写资产列表页筛选条件，保证“看盘”与“操作”两条链路解耦。
- 对于 `extra_cost` 等列表摘要接口未直接返回的字段，前端允许在不改后端契约前提下复用现有 `getAsset` 做轻量补充，以完善维护成本占比提示；若仍无法计算则保持空态而不报错。
- 可处理资产提示只用于规则提醒与复盘辅助，不表达投资建议或自动处置判断。

## 10. Phase 6 Decisions
- 保持 `/assets` 单页 Tabs 结构不变，不新增侧边栏入口、不新增独立子路由、不改导入中心/规则/商户等其他 ledger 页面逻辑。
- 分析与总览不再在页面初次加载时为全部资产批量调用 `getAsset`；详情请求改为“查看/编辑/生命周期进入时按需获取 + 本地缓存 + 变更后失效”。
- 维护成本占比等依赖明细字段的提示优先使用已获取到的详情缓存；若当前会话尚无足够明细，则展示明确空态提示而不是继续放大请求量。
- 文案继续避免技术字段直出，资产详情中的 metrics 区块改为中文测算指标说明。
- 本阶段若只涉及 UI/交互细化与前端缺陷修复，README 通常无需更新；若验收后确认资产库用户可见能力口径需要重写，再单独补 README。

## 11. V1 Final Status
- 已完成范围：
  - `/ledger/assets` 单页 Tabs：总览、资产列表、新增资产、生命周期、分析、设置。
  - 资产 CRUD 闭环：新增、详情 Drawer、编辑、软删除。
  - 生命周期事件：`start_use`、`repair / maintenance / accessory`、`usage`、`idle`、`resume`、`on_sale`、`sell`、`retire`、`dispose`、`lost`、`note`。
  - 估值记录：手动估值、新增后同步刷新 `current_value` 与 metrics。
  - 总览与分析：KPI、状态/分类分布、榜单、卖出复盘、可处理资产提醒。
  - 请求控制：分析页不批量补拉全部资产详情；资产页冷启动的 `summary / list / catalog` 初始化请求已做共享 inflight 去重。
- 保持不变：
  - 未新增后端聚合接口。
  - 未新增前端独立子路由或侧边栏资产库子入口。
  - 未改导入中心、复核工作台、商户词典、规则管理、基础分析的业务逻辑。

## 12. Final Acceptance Notes
- 浏览器实机链路已覆盖：
  - `/assets` 入口、Tabs 切换、空库态、新增资产、详情 Drawer、编辑、估值新增、生命周期工作台、`start_use / accessory / idle / resume / sell` 事件、总览刷新、分析页复盘、软删除回空态。
  - 现有 ledger 页面回归：`/imports`、`/analytics`、`/merchants`、`/rules` 可直接打开，路由与侧边栏入口未被资产库改坏。
- 验收中确认的口径：
  - `sell.amount -> sale_price/current_value`
  - `repair / maintenance / accessory.amount -> extra_cost`
  - 删除事件仅删记录，不自动回滚资产主表状态、成本或估值。
- 本轮收尾缺陷修复：
  - 修复了 `/assets` 冷启动在开发实机下因 React StrictMode 放大的重复 `summary / list / catalog` 请求。

## 13. Explicit Non-Goals
- 不做 OCR、电商订单导入、自动估值、自动折旧。
- 不做账务流水联动、导入中心联动、复核工作台联动、规则管理联动、商户词典联动。
- 不做资产编码、SKU、供应商治理等更强主数据治理扩展。
- 不做资产报表导出、提醒中心、批量编辑、回收站恢复等新增大功能。

## 14. Phase 5B Recommendation
- 当前不建议为了 V1 合并前再追加 Phase 5B 后端聚合接口。
- 原因：
  - 现有 V1 已可用，核心录入、追踪、复盘、删除链路已闭环。
  - 分析页已经避免无条件批量 `getAsset`，当前请求量可接受。
  - 若后续真实数据量扩大、榜单与图表计算开始受前端派生成本影响，再单独推进 Phase 5B 更稳妥。
- 结论：先合并当前 V1；Phase 5B 保留为“性能/聚合优化”候选，不作为本次收尾前置条件。

## 15. Open Questions
- 是否需要后续补 `asset_code` / `sku` / `vendor` 等更强治理字段。
- 是否需要按 `owner_role + serial_number` 引入软唯一策略。
- 是否需要估值快照与生命周期事件做双写联动，避免价值历史分叉。
