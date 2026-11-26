# Backend Structure

本文件用于限制后端结构继续漂移，尤其是 `backend/services/runtime.py` 的职责边界。

## runtime.py 的允许职责

`backend/services/runtime.py` 当前只允许承担以下职责：

- `init_runtime()` 等运行期初始化入口。
- legacy schema migration，例如补列、兼容旧表、兼容旧鉴权数据。
- 兼容导出别名，作为历史 import 的兼容层保留。
- 全局 owner-role helper 与最小 glue。
- 最小 maintenance glue，例如清理线程启动与相关辅助函数。

## runtime.py 的禁止事项

- 禁止把新的业务逻辑继续堆进 `backend/services/runtime.py`。
- 禁止在其中新增新的领域规则、复杂查询拼装、写入流程或模块专属 service。
- 禁止把本应进入 router / domain service / dedicated service 的逻辑，再次回灌到 `runtime.py`。
- 禁止把新的 CRUD、analytics、import、review、ledger、monitor、notes、trading 业务逻辑写回 `runtime.py`。
- `monitor` 运行期逻辑已迁出到 `backend/services/monitor_runtime.py`，后续新的 monitor 采样、巡检、系统信息聚合与 monitor 站点管理逻辑不得写回 `runtime.py`。
- `notes / notebook / todo` 运行期逻辑已迁出到 `backend/services/notes_runtime.py`，后续新的 notes 域查询、笔记链接索引、默认 notebook 初始化、回收站处理与 todo 逻辑不得写回 `runtime.py`。
- `auth` 运行期逻辑已迁出到 `backend/services/auth_runtime.py`，后续新的认证、登录、登出、setup、鉴权检查与用户权限归一化逻辑不得写回 `runtime.py`。
- `admin` 运行期逻辑已迁出到 `backend/services/admin_runtime.py`，后续新的用户管理、模块权限配置与管理员操作逻辑不得写回 `runtime.py`。
- `audit` 运行期逻辑已迁出到 `backend/services/audit_runtime.py`，后续新的审计写入、审计查询与审计删除逻辑不得写回 `runtime.py`。
- `recycle` 运行期逻辑已迁出到 `backend/services/recycle_runtime.py`，后续新的 recycle / soft delete / restore / purge 逻辑不得写回 `runtime.py`。

## 新逻辑落点

- AI 复盘使用 `models/discipline_ai.py`、`schemas/discipline_ai.py`、`routers/discipline_ai.py` 与 `services/discipline_ai/`。`snapshot.py` 复用既有统计生成依据，`provider.py` 处理官方模型调用与校验，`service.py` 管理用户偏好／任务／版本，`jobs.py` 处理领取、租约和自动任务；应用 lifespan 启停工作线程，不进入 runtime 领域逻辑。

- 屏幕采集凭证位于 `services/discipline_screen/collectors.py` 与独立 `discipline_screen_collectors` 表；请求上下文 middleware 仅识别两个受限接口并调用 service，不把凭证加入匿名白名单。成功上传状态与原始事件入库共用事务，撤销和账户权限会再次校验。

- 屏幕统计使用 `models/discipline_screen.py`、`schemas/discipline_screen.py`、`routers/discipline_screen.py` 与 `services/discipline_screen/`。`store.py` 负责用户隔离、事件去重和事务内时段重建；`analytics.py` 负责时区切分、重叠合并和查询；`catalog.py` 提供可由个人偏好覆盖的应用分类。独立表通过现有 `init_db` 创建，不改 runtime 顶层函数。

- `discipline` 的每日时段、默认作息、用户隔离与并发版本检查位于 `backend/services/discipline_service.py`，表结构位于 `backend/models/discipline.py`；不进入 runtime。
- 默认作息版本使用 `discipline_routine_versions` 独立追加表及 `services/discipline_history.py`，与模板和当天同步共用事务；历史快照不引用可变对象，不提供修改或删除入口。

- `trading` 新业务逻辑进入 `backend/trading/` 下对应 service；止损点/目标点快照逻辑位于 `backend/trading/risk_point_service.py`，独立研究逻辑位于 `backend/trading/research_service.py`。
- `ledger` 新业务逻辑进入 `backend/services/ledger/` 下对应 service。
- `notes`、`monitor`、`auth`、`admin`、`audit`、`recycle` 等后续新增逻辑，应进入各自 dedicated runtime / service，不应新增到 `runtime.py`。
- router 仅负责参数、依赖和转发，不承载业务实现。

## 历史债务说明

- `runtime.py` 当前基线为 `446` 行，hard max 为 `550` 行，并继续以 `scripts/check_runtime_size.py` 强制守护。
- `scripts/check_runtime_size.py` 超过 `446` 行会给出 warning，超过 `550` 行才失败。
- `scripts/check_runtime_boundaries.py` 当前正式策略为“顶层函数白名单”，不再依赖函数名前缀黑名单。
- 当前 `runtime.py` 只应保留 `init_runtime`、migration glue、compatibility exports、global owner-role helpers 与 minimal maintenance glue。
- 不允许在 `runtime.py` 新增未登记顶层函数；如需新增后端业务函数，必须进入对应 `backend/services/*_runtime.py`。
- auth/admin/audit 运行期逻辑已迁出；后续拆分应单独发起，不要在业务需求顺手继续扩大该文件。
- 分组型 review / review_session 功能及其 API 已移除；历史 ORM 表仅为非破坏性数据兼容保留，不得重新接回路由或新增业务逻辑。
- trade_plan 运行期逻辑已迁出到 `backend/services/trade_plan_runtime.py`，后续新的 plan CRUD 与 trade link 逻辑不得写回 `runtime.py`。
- poem / upload 小模块运行期逻辑已迁出到 `backend/services/utility_runtime.py`；health 逻辑当前仍在 `backend/routers/health.py` 内联，本轮无需迁出。
- trading 主域运行期逻辑已迁出到 `backend/services/trading_runtime.py`、`backend/services/trade_import_runtime.py`、`backend/services/trade_analytics_runtime.py`、`backend/services/trade_broker_runtime.py`。
- 后续新的 trading CRUD、import、analytics、broker、source metadata 与展示 helper 不得写回 `backend/services/runtime.py`，应继续落到对应 dedicated runtime。
- Trading 研究使用 `trading_research_*` 独立表；`runtime.py` 只调用幂等的旧数据迁移入口，不承载研究 CRUD 或链接索引业务。

## 已完成的 dedicated runtime 拆分

- `backend/services/monitor_runtime.py`
- `backend/services/notes_runtime.py`
- `backend/services/auth_runtime.py`
- `backend/services/admin_runtime.py`
- `backend/services/audit_runtime.py`
- `backend/services/recycle_runtime.py`
- `backend/services/trade_plan_runtime.py`
- `backend/services/utility_runtime.py`
- `backend/services/trading_runtime.py`
- `backend/services/trade_import_runtime.py`
- `backend/services/trade_analytics_runtime.py`
- `backend/services/trade_broker_runtime.py`
