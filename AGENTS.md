# AGENTS

本仓库是一个 self-hosted multi-app workspace，不是单一 trading app。当前并列模块包括：
- trading
- notes
- monitor
- ledger
- portal
- backend

## 1. 基本协作约定
- 本地调试统一使用 `./dev.sh`（`up/status/attach/down/restart`）。
- 生产部署统一使用 `deploy/update.sh`。
- 修改前必须先阅读 `docs/MODULE_REGISTRY.md`、`docs/API_STYLE.md`、`docs/BACKEND_STRUCTURE.md`、`docs/DEPENDENCY_POLICY.md`、`docs/SECURITY.md`。
- 涉及部署初始化或 nginx/systemd 的改动，需同步检查 `deploy/setup.sh`、`deploy/nginx.conf` 等相关文件。
- 优化时除功能正确外，需要兼顾易用性、信息密度和整体观感。

## 2. 架构边界
- 不要把业务逻辑写回 `backend/main.py`。
- 不要把新的领域逻辑堆进 `backend/services/runtime.py`。
- `backend/services/runtime.py` 只允许保留启动、迁移、兼容导出和全局 owner-role glue。
- `backend/services/runtime.py` 的边界检查采用“顶层函数白名单”策略，不允许新增任何未登记顶层函数。
- 涉及 runtime/service 拆分或新增后端业务逻辑时，业务实现必须进入对应 dedicated runtime 文件，不得写回 `backend/services/runtime.py`。
- 新业务函数必须进入对应 dedicated runtime 文件，不得作为 `backend/services/runtime.py` 顶层函数新增。
- Router 负责参数接收、依赖注入和转发；业务逻辑应放在 service。
- 新增 ledger 能力必须优先放在 ledger 域下，不要混入 trading/notes/monitor。
- 不要把 ledger 前端页面塞进 `frontend-trading`；ledger 保持在 `frontend-ledger`。

## 2.1 Ledger 资产库专项约定
- 产品边界：资产库是 ledger 域内的长期能力，负责资产资料沉淀、标签化组织与可复用查询，不承载交易执行、行情分析、资讯阅读、运维监控等非 ledger 目标。
- 路由入口：资产库前端入口统一归属 `frontend-ledger` 与 ledger 对应路由，不新增或复用 `frontend-trading`、`frontend-notes`、`frontend-monitor`、`portal` 的业务入口承载资产库主流程。
- 后端边界：资产库 API、service、runtime 拆分遵循 ledger 域隔离原则；Router 仅做参数接收与转发，领域逻辑落在 ledger service/dedicated runtime，不得回流 `backend/main.py` 或 `backend/services/runtime.py`。
- 核心产品逻辑：优先保证“资产可录入、可检索、可追踪、可治理”四类主链路完整；字段模型、分类体系、状态流转与审计留痕需保持可扩展和可回溯，避免一次性脚本式设计。
- UI/UX 要求：界面应强调信息密度与可读性平衡，列表/详情/筛选/批量操作链路一致，关键状态可见且可解释；交互文案需明确动作后果，避免仅技术导向命名。
- 开发节奏：按“最小可用切片 -> 验收反馈 -> 增量迭代”推进；每次迭代需明确范围边界与不做事项，并在 `docs/ledger/asset-library.md` 持续沉淀决策、待办与里程碑。

## 3. 模块改动原则
- 改某个模块时，尽量保持影响范围局部化，避免无关模块连带修改。
- 改 portal、deploy、nginx、dev.sh 这类高影响文件时，必须明确说明改动原因和影响范围。
- 若涉及 API、路由、部署路径、目录结构、模块入口变化，必须同步更新相关文档。

## 4. 文档要求
- 只有在改动影响以下内容时，才需要更新 `README.md` 与 `README.zh-CN.md`：
  - 用户可见功能
  - 路由或入口
  - 部署方式
  - 目录结构骨架
  - 模块说明
  - 运行方式或常用命令
- 若改动仅属于内部重构、实现细节调整、测试补充、样式微调或不影响用户理解的代码整理，通常不需要更新 README。
- 若改动影响验收路径或 smoke 脚本，需同步更新 `docs/` 或 `scripts/` 下相关文件。
- 回复中必须明确说明：
  - README 已更新；或
  - README 无需更新，并说明理由。

## 5. 验证要求
- 后端改动：至少运行相关 `python3 -m pytest -q backend/tests`（或相关子集）。
- 前端改动：至少运行对应前端的 `npm run build`。
- portal / deploy / route 改动：需说明入口、刷新、静态资源路径是否正常。
- 涉及 router/API 注册方式变更时，必须运行：
  - `python3 scripts/check_router_style.py`
  - `bash scripts/check_all.sh`
- 涉及结构、部署、权限、依赖变更时，必须运行相关检查脚本：`scripts/check_deploy.sh`、`scripts/check_naming.sh`、`scripts/check_runtime_size.py`、`scripts/check_all.sh` 中的适用项。
- 涉及 runtime/service 拆分或新增后端业务逻辑时，必须运行：
  - `python3 scripts/check_runtime_boundaries.py`
  - `bash scripts/check_all.sh`
- 修改 runtime 相关逻辑后，必须运行：
  - `python3 scripts/check_runtime_boundaries.py`
  - `bash scripts/check_all.sh`
- 若无法完成真实联调，必须明确说明未验证项，不得假装已验证。

## 6. 回复要求
回复应简洁，但必须包含：
- 改动文件路径或范围
- 验证结果
- README 改动文件路径 + 改动摘要；或 README 无需更新的理由
- 仍未完成或未验证的项
