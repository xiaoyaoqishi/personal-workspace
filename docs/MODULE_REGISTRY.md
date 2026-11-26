# Module Registry

本文件登记当前 workspace 的模块边界，作为结构、部署、权限和入口变更的基线。新增模块或调整入口时，先更新这里，再改代码或脚本。

## Registry

| module_id | 中文名 | frontend_dir | frontend_base | dev_port | backend_router | api_prefix | permission_scope | production_path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `trading` | 交易记录 | `frontend-trading` | `/trading/` | `5173` | `backend/routers/trading.py`；关联 `trade_plans.py`、`recycle.py` | `/api/trades`（含 `/api/trades/research/*`）、`/api/trade-plans`、`/api/trade-brokers`、`/api/trade-instruments`、`/api/trade-review-taxonomy`、`/api/recycle` | 普通用户数据模块；受 `module_permissions.trading` 与 `data_permissions.trading` 控制 | `/trading/` |
| `notes` | 笔记 | `frontend-notes` | `/notes/` | `5174` | `backend/routers/notes.py`、`notebook.py`、`todo.py` | `/api/notes`、`/api/notebooks`、`/api/todos` | 普通用户数据模块；受 `module_permissions.notes` 与 `data_permissions.notes` 控制 | `/notes/` |
| `ledger` | 记账 | `frontend-ledger` | `/ledger/` | `5176` | `backend/routers/ledger.py` | `/api/ledger/*` | 普通用户数据模块；受 `module_permissions.ledger` 与 `data_permissions.ledger` 控制 | `/ledger/` |
| `discipline` | 自律养成 | `frontend-discipline` | `/discipline/` | `5177` | `backend/routers/discipline.py` | `/api/discipline/*` | 受 `module_permissions.discipline` 与 `data_permissions.discipline` 控制；数据按登录用户名隔离 | `/discipline/` |
| `monitor` | 监控与管理 | `frontend-monitor` | `/monitor/` | `5175` | `backend/routers/monitor.py`；管理相关接口还包括 `admin.py`、`audit.py` | `/api/monitor/*`、`/api/admin/*`、`/api/audit/*` | `admin-only` 模块；不属于普通用户 `module_permissions` / `data_permissions` 范围 | `/monitor/` |
| `portal` | 门户 | `portal` | `/` | `5172` | `N/A`（本地由 `portal/dev_server.py` 提供静态入口与反向代理） | `N/A` | 入口层，不是普通用户数据模块 | `/` |
| `backend` | 共享后端 | `N/A` | `N/A` | `8000` | `backend/routers/__init__.py` 聚合各 router；核心入口为 `backend/app.py` | `/api/*` | 共享 API 层；`trading` / `notes` / `ledger` / `discipline` 参与普通用户模块权限判定 | `/api/` |

## Notes

- 当前普通用户数据模块为 `trading`、`notes`、`ledger`、`discipline`，与 middleware 权限集合保持一致。
- Portal 首页以「自律养成」替代账务入口。每日计划按时间段主题评价，具体记录可选；屏幕统计位于 `/discipline/screen`，AI 总结仍为禁用侧栏入口。
- 屏幕统计在 discipline 域内使用独立 model/schema/service/router，API 为 `/api/discipline/screen/*`。导入已解析的 Biome 前台事件，按当前用户长期保存并还原使用时段，支持日／周／月、设备、分类、应用与异常明细；`clients/macos-screen/` 提供用户级每日采集器，专用凭证仅允许上传与查看同步状态，不将个人数据或凭证打包进源码。
- 自律养成使用独立表与 service；首页 `/discipline/` 彩色执行日历通过侧边抽屉只读查看任意日期，不跳转。`/discipline/plan` 固定展示北京时间当天并自动保存，无日期切换、调整当天或手动保存操作。默认作息保存后同步当天，保留已有评价和备注；历史只读，不依赖 Notes 数据。
- 统计按选中时段等权计算 100/50/0，未评价计 0；75% 及以上良好、40% 至不足 75% 待改进、不足 40% 失败。仅周一至周五且非中国大陆假日的日期计入，周末调休上班日不计入。已维护 2026、2027 官方假期，其他年份暂停统计。
- 默认作息的成功修改按用户保存不可变版本、北京时间及作息快照、当天同步前后快照；历史日期不回写，当天保留评价备注，未来未生成日期按届时最新作息生成。首页日期抽屉始终限制为部分页面宽度，统计时段整卡按执行情况着色。
- `ledger` 的前后端、权限和 `/ledger/` 生产路径继续保留，但不再显示在 Portal 首页；已获授权用户仍可直接访问其路径。
- `monitor` 归属管理员工作台，不能被登记为普通用户数据模块，也不应复用普通用户模块权限语义。
- `portal` 负责入口与跳转，不承载普通用户数据域。
- `backend` 是共享服务层，不应被当成独立的普通用户业务模块处理。
- Trading 研究归属 trading 域，前端位于 `/trading/research`，后端使用 `/api/trades/research/*` 与独立数据表；不得通过 Notes 的 `/api/notes`、`/api/notebooks` 或页面嵌入实现。
