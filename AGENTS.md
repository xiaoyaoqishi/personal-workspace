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

- 资产库是 Ledger 域内的独立子模块，页面名称固定为「资产库」，用于个人资产全生命周期管理。
- 资产库集成在账务管理中，但不依赖账务导入、交易流水、复核工作台、商户识别或规则引擎；用户应能直接创建、维护、估值、追踪和复盘资产。
- 资产库前端入口归属 `frontend-ledger`，主流程集中在一个「资产库」页面内，通过 Tabs 承载功能；不要新增多个一级导航入口，也不要放入 `frontend-trading`、`frontend-notes`、`frontend-monitor` 或 `portal`。
- 资产库后端归属 ledger 域，API、schema、service、runtime 应保持 ledger 边界内聚；Router 只做参数接收与转发，领域逻辑放在 ledger service/dedicated runtime，不得回流 `backend/main.py` 或 `backend/services/runtime.py`。
- 资产库详细产品逻辑、状态机、数据对象、指标口径、V1 范围和阶段计划以 `docs/ledger/asset-library.md` 为准；只有执行资产库相关任务时才需要阅读该文档。
- 资产库开发按“可验收切片 -> 反馈修正 -> 增量迭代”推进；每次迭代需明确范围边界、不做事项、验证方式，并在必要时同步更新 `docs/ledger/asset-library.md` 的设计决策、待办与里程碑。

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
