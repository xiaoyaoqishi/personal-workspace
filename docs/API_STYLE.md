# API Style

本文件记录当前 router 风格现状，并定义后续统一目标。

## 当前现状

### Discipline 风格

- AI 总结使用 `/api/discipline/ai` 前缀：`GET /overview?period=day|week&anchor=YYYY-MM-DD` 查询事实、最新成功报告、生成状态与过期标记；`POST /reports` 创建或复用生成任务；`GET /reports/{id}` 读取本人报告版本；`GET /history` 查询历史；`GET/PUT /settings` 读取或设置自动生成及备注使用偏好。GET 不调用模型、不创建任务、不产生费用。生成及设置要求 discipline 可写权限，采集凭证无权访问；密钥始终留在后端。

- 屏幕统计独立 router 使用 `/api/discipline/screen` 前缀：`GET /overview?start=YYYY-MM-DD&end=YYYY-MM-DD&device=...` 获取不超过 366 天的统计；`GET /sessions` 使用同样范围及可选 `app`、`status=normal|anomaly`、`offset`、`limit` 分页读取时段；`GET /export` 导出所选范围正常时段 CSV；`POST /imports` 原子导入 version=1 的设备与前台事件 JSON；`PUT /devices/{device_key}` 修改设备名称；`PUT /apps` 保存个人应用名称和分类。所有接口使用现有登录和 discipline 数据权限，不开放匿名上传。GET 无写入副作用。
- `GET/POST /collectors` 与 `DELETE /collectors/{key}` 为网页登录用户列出、创建和撤销本人采集凭证。`POST /collector/imports` 和 `GET /collector/status` 仅接受专用 Bearer 采集凭证（开发模式也不豁免），不接受网页登录替代。采集凭证访问任何其他路径一律 403，状态接口仅返回本凭证的状态和账户标识，不返回使用明细。token 只在创建响应中出现一次，其他响应不含 token 或 hash。

- `backend/routers/discipline.py` 使用 `/api/discipline` 模块前缀与 decorator。
- `GET/PUT /api/discipline/days/{day}` 读取与保存时段快照、主题评价、`included` 统计开关及可选记录；PUT 仅允许北京时间当天，历史与未来均返回 403（含管理员、开发模式）。GET 返回服务器日期、editable、day_type 和 achievement。
- `GET /api/discipline/calendar?year=YYYY&month=M` 返回当月每天成绩、日期类型及工作日汇总，仅查询当前用户记录。
- `GET/PUT /api/discipline/template` 读取与保存默认作息；PUT 使用 revision 防止覆盖其他窗口更新。可传 `day_revision` 校验当天版本，模板与已存在的当天快照在同一事务中同步，返回 `day`；不隐式创建当天记录。
- `GET /api/discipline/template/history?offset=0&limit=20` 分页读取当前用户作息版本；`GET /api/discipline/template/history/{revision}` 查看完整作息和调整当天同步前后快照。版本追加保存、只读，不提供历史回写或删除接口；旧模板仅登记为时间未知的基线。
- 时段使用稳定 `id` 关联模板与当天记录。当天严格同步最新模板：保留时段延续评价与备注；删除时段从当天移除，原内容保存在调整前快照；新建时段（即使复用删除段的时间）从未评价、空备注开始。仅无标识的旧记录对保留时段兼容按时间匹配。模板本身重叠返回 422，当天版本已变化返回 409，事务整体回滚。历史快照不参与同步。
- 每日计划客户端在输入停顿后自动 PUT，串行提交以防乱序覆盖；首页抽屉仅 GET。每日计划固定当天，不使用日期 query 参数切换。
- 日期 GET 无写入副作用；数据归属当前用户名，业务实现在 `services/discipline_service.py`。
- 首次保存之前不追溯计分；首次记录之后漏记的历史工作日固定 0 分。当日未保存为待记录，保存后计入月均值；未来不计。未选择统计时段为无统计，月均值按有效日期等权平均。节假日与周末完全排除，未维护的年份不计分。

### Trading 兼容例外

- `backend/routers/trading.py` 已迁移为 decorator 风格，但继续保留 `APIRouter(prefix="/api", tags=["trading"])`。
- 这是正式兼容例外，不是待修复 bug。
- 当前 trading 对外 API 继续使用：
  - `/api/trades`
  - `/api/trades/{trade_id}/risk-point-history`
  - `/api/trades/exchange-rate/usd-cny`
  - `/api/trades/research/*`
  - `/api/trade-brokers`
  - `/api/trade-instruments`
  - `/api/trade-review-taxonomy`
- 禁止在普通重构中新增独立的 trading 模块级 API 前缀。
- 独立研究能力沿用现有 `/api/trades` 前缀，收敛在 `/api/trades/research/*`，不复用 Notes API。
- 如未来需要新的 trading 模块级 API 前缀，必须单独发起 API v2 迁移，不能在普通重构中顺手修改。

### 已迁移模块/文件

- 所有 router 文件均已迁移为 decorator 风格，并禁止继续使用 `add_api_route(...)`。
- `backend/routers/trading.py` 已迁移为 decorator 风格，当前仍保留 `prefix="/api"` 以兼容历史 API。
- `backend/routers/monitor.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/monitor"`。
- `backend/routers/notes.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/notes"`。
- `backend/routers/notebook.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/notebooks"`。
- `backend/routers/todo.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/todos"`。
- `backend/routers/trade_plans.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/trade-plans"`。
- `backend/routers/auth.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/auth"`。
- `backend/routers/admin.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/admin"`。
- `backend/routers/audit.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/audit"`。
- `backend/routers/health.py` 已迁移为 decorator 风格，当前保留 `prefix="/api"` 作为全局健康检查兼容例外。
- `backend/routers/upload.py` 已迁移为 decorator 风格，当前保留 `prefix="/api"` 以同时覆盖 `/api/upload` 与 `/api/uploads/{filename}`。
- `backend/routers/recycle.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/recycle"`。
- `backend/routers/poem.py` 已迁移为模块级 prefix + decorator 风格，当前使用 `prefix="/api/poem"`。

### Ledger 风格

- `ledger` 采用 `APIRouter(prefix="/api/ledger")`。
- 路由声明主要使用 `@router.get/post/put/delete(...)` decorator。
- 代表文件：`backend/routers/ledger.py`。

### Router 检查范围

- `scripts/check_router_style.py` 当前覆盖 `backend/routers/*.py` 全量 router 文件。
- 所有 router 文件禁止出现 `add_api_route(...)`。
- 只有以下兼容例外允许保留 `APIRouter(prefix="/api")`：
  - `backend/routers/trading.py`
  - `backend/routers/health.py`
  - `backend/routers/upload.py`
- 除上述 3 个文件外，其他 router 必须使用模块级 prefix。

## 后续目标风格

- 目标风格是“模块级前缀 + decorator 声明式路由”：
  - 除 `trading.py`、`health.py`、`upload.py` 这 3 个兼容例外外，router 前缀应明确到模块级，例如 `/api/ledger`、`/api/notes`。
  - 路由定义优先使用 `@router.get/post/...`。
  - router 文件只负责参数接收、依赖注入和转发，不承载业务逻辑。
- `trading.py` 属于历史兼容例外：当前仅统一为 decorator 风格，继续保留 `prefix="/api"`。
- `health.py` 属于全局健康检查兼容例外：继续保留 `prefix="/api"`。
- `upload.py` 因同时覆盖 `/api/upload` 与 `/api/uploads/{filename}`，继续保留 `prefix="/api"`。
- 不在同一个模块内继续混合两种风格，避免新增漂移。

## 过渡规则

- 对新域或单独重构的模块：
  - 优先采用“模块级前缀 + decorator”目标风格。
  - 路由路径应先在本文件和 `docs/MODULE_REGISTRY.md` 中登记，再落代码。
