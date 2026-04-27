# Module Registry

本文件登记当前 workspace 的模块边界，作为结构、部署、权限和入口变更的基线。新增模块或调整入口时，先更新这里，再改代码或脚本。

## Registry

| module_id | 中文名 | frontend_dir | frontend_base | dev_port | backend_router | api_prefix | permission_scope | production_path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `trading` | 交易记录 | `frontend-trading` | `/trading/` | `5173` | `backend/routers/trading.py`；关联 `review.py`、`review_sessions.py`、`trade_plans.py`、`knowledge.py`、`recycle.py` | `/api/trades`、`/api/reviews`、`/api/review-sessions`、`/api/trade-plans`、`/api/knowledge-items`、`/api/trade-brokers`、`/api/trade-review-taxonomy`、`/api/recycle` | 普通用户数据模块；受 `module_permissions.trading` 与 `data_permissions.trading` 控制 | `/trading/` |
| `notes` | 笔记 | `frontend-notes` | `/notes/` | `5174` | `backend/routers/notes.py`、`notebook.py`、`todo.py` | `/api/notes`、`/api/notebooks`、`/api/todos` | 普通用户数据模块；受 `module_permissions.notes` 与 `data_permissions.notes` 控制 | `/notes/` |
| `ledger` | 记账 | `frontend-ledger` | `/ledger/` | `5176` | `backend/routers/ledger.py` | `/api/ledger/*` | 普通用户数据模块；受 `module_permissions.ledger` 与 `data_permissions.ledger` 控制 | `/ledger/` |
| `monitor` | 监控与管理 | `frontend-monitor` | `/monitor/` | `5175` | `backend/routers/monitor.py`；管理相关接口还包括 `admin.py`、`audit.py` | `/api/monitor/*`、`/api/admin/*`、`/api/audit/*` | `admin-only` 模块；不属于普通用户 `module_permissions` / `data_permissions` 范围 | `/monitor/` |
| `portal` | 门户 | `portal` | `/` | `5172` | `N/A`（本地由 `portal/dev_server.py` 提供静态入口与反向代理） | `N/A` | 入口层，不是普通用户数据模块 | `/` |
| `backend` | 共享后端 | `N/A` | `N/A` | `8000` | `backend/routers/__init__.py` 聚合各 router；核心入口为 `backend/app.py` | `/api/*` | 共享 API 层，不是普通用户数据模块；仅 `trading` / `notes` / `ledger` 参与普通用户模块权限判定 | `/api/` |

## Notes

- 当前普通用户数据模块只有 `trading`、`notes`、`ledger`，这一点与 `backend/core/middleware.py` 中的 `ALL_USER_MODULES` 保持一致。
- `monitor` 归属管理员工作台，不能被登记为普通用户数据模块，也不应复用普通用户模块权限语义。
- `portal` 负责入口与跳转，不承载普通用户数据域。
- `backend` 是共享服务层，不应被当成独立的普通用户业务模块处理。
