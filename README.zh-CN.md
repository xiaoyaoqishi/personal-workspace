[English README](./README.md)

# tradingRecords：个人自托管工作台

## 一句话定位
`tradingRecords` 是一个个人自托管的多应用工作台仓库，把交易记录与复盘、知识笔记、管理员侧站点巡检、个人记账、统一登录和门户入口放在同一个工作区里。

## 模块地图
- `Trading`：负责交易记录、分析、单笔结构化复盘、交易计划和研究工作流。
- `Notes`：负责笔记本、日记/文档笔记、Wiki 链接跳转、待办和回收流程。
- `Monitor`：负责管理员侧的站点巡检、用户管理和审计日志。
- `Ledger`：独立的个人账务应用，当前围绕导入批次、校对台、规则、商户词典、分析页面和资产库展开。
- `Discipline`：首页执行日历、每日计划、屏幕统计与 AI 总结。每日计划按主题自主评价，符合／部分符合／偏离分别计 100%／50%／0%，未评价计 0%；75% 及以上良好、40% 至不足 75% 待改进、不足 40% 失败。屏幕统计支持苹果设备的日／周／月趋势、设备累计与去重时长、应用排行与个人分类、夜间使用、时段明细及 CSV 导出。数据按用户隔离。AI 总结结合计划与用机数据，支持日／周复盘、依据详情、历史版本及同步后的自动生成。
- `Portal`：工作台的静态首页与登录入口。
- `Backend`：统一 FastAPI API、鉴权、数据权限、上传能力，以及基于 SQLite 的后端服务。

## 当前能力概览
### Trading
- 交易记录的增删改查、筛选、搜索选项、持仓视图，以及表格中的开仓/平仓时间展示。
- 保存已平仓交易时，盈亏金额可直接填写绝对值；系统会根据做多/做空方向及开仓价、平仓价的关系自动确定最终正负号，加密货币 USDT 盈亏以及后续修改方向或价格时同样适用。
- 加密货币交易的手续费与盈亏以 USDT 录入，表单自动获取并允许校正美元兑人民币汇率，同时保存 USDT 原值、成交汇率和换算人民币；记录页按“人民币（USDT）”展示，仪表盘与全部统计统一使用人民币口径。
- 新建与编辑交易的品种统一从系统品种目录中模糊搜索选择，不再自由输入；“信息维护”页面提供品种维护与券商维护页签，品种支持新增、编辑、删除，修改品种代码时会同步既有交易和计划。
- 交易记录已移除收藏、星级功能，以及对应的收藏、星级和自定义排序筛选。
- 交易记录已移除行为纪律字段、违纪标记及相关分析，历史值不保留。
- 交易记录已移除手数字段及其在新建编辑、表格、详情、关联摘要、持仓视图和 API 中的展示，历史值不保留。
- 交易记录已移除保证金字段及其表单、API 和存储数据，历史值不保留。
- 交易记录已移除补充交易信息、期货特有信息和交易前中后字段，并清理相关分析、API 与历史数据。
- 交易表单已移除来源信息、补充记录、错误标签及其历史数据；交易决策收敛为入场逻辑、出场逻辑、策略类型和核心信号四项。
- 新建交易提供独立的“交易决策”页签，交易详情以只读区块展示对应决策内容。
- 新建交易必须填写当前止损点、目标点和占本金百分比；后续调整会追加包含三项值的带时间快照，金字塔加减仓变化可追溯。
- 交易日期由唯一对外填写的开仓时间自动派生；止损/目标调整历史统一按中国标准时间展示。
- 交易记录页面统一使用单条记录操作，不再提供多选或基于当前筛选的批量操作。
- 面向交易记录的统计与分析接口，仪表盘支持按日期、交易类型和品种筛选。
- Trading 默认进入行动导向的交易首页，集中展示当前持仓、本月盈亏、近期交易、待执行计划、复盘/来源提醒和最近研究；完整仪表盘继续专注深度分析。
- Trading 前端现已提供 4 套可切换主题（`ink` / `light` / `tech` / `dark`），通过侧边栏下拉选择器切换，默认保留当前水墨风，并在本地持久化当前选择。
- 基于粘贴文本的交易导入实现仍保留，但交易记录页面入口当前暂停开放。
- 结构化单笔复盘数据与复盘分类体系。
- 交易详情中的结构化复盘仅供查看，并为加密货币展示杠杆倍数；引用该交易的全部研究会以标题链接列出并支持跳转，复盘内容统一通过编辑交易页面维护。
- 可关联交易的交易计划。
- 原分组型复盘会话/复盘研究工作台及计划跟进复盘流程已移除，单笔结构化复盘继续保留。
- Trading 各子页面统一使用紧凑操作栏，不再展示独立的“标题 + 说明文案”页面头；主操作统一靠右，交易记录的视图切换、筛选与新建操作收敛在同一控制行。
- 单篇研究支持搜索并引用多条交易记录；引用摘要置于正文顶部，集中展示交易日期、方向、价格、盈亏与状态，并可在当前研究页通过抽屉查看交易详情。
- Trading 现已提供完全独立的“研究”子模块，页面采用与文档模块一致的资料夹树和单一阅读/编辑区，进入模块时资料夹树默认全部折叠；研究和资料夹都支持拖拽移动与同级排序，资料夹还可通过拖拽调整层级，并提供搜索、标签、置顶、Wiki 双向关联与研究回收站。研究阅读态的正文图片支持连续按比例放大、缩小、复位及放大后拖拽查看。富文本编辑器支持插入可命名的折叠块，折叠块内部可继续插入图片和其他正文内容，阅读态下默认全部收起。富文本编辑栏能力与 Notes 文档编辑器保持一致，但代码、API 和数据表仍完全归属交易域；旧的交易作用域 Notes 数据会在运行期迁移时复制到独立研究域。
- 交易侧回收站，覆盖交易、券商和计划。

### Notes
- 日记与文档两类笔记本管理。
- 日记/文档笔记的增删改查与统一编辑流程。
- 阅读态正文图片支持连续按比例放大、缩小、复位及放大后拖拽查看。
- 文档和文件夹都支持跨文件夹拖拽与同级排序，文件夹还可通过拖拽调整层级；原有文档移动按钮继续保留。
- 搜索、日历、日记树和历史回看能力。
- 笔记首页提供统一搜索、快捷新建、最近文档、可直接完成的待办和紧凑的记录节奏概览。
- Wiki 链接解析与文档间正向跳转。
- 待办工作台支持快捷新建、可选截止与提醒、清晰的完成状态、筛选以及显式批量管理模式。
- 笔记回收站的恢复与清理流程。

### Monitor / Admin
- 统一后端提供的登录、退出、初始化和会话校验。
- 仅管理员可访问的站点巡检与管理接口。
- Monitor 前端现已提供 4 套可切换主题（`light` / `ink` / `tech` / `dark`），通过侧边栏下拉选择器切换，并在本地持久化当前选择。
- 站点巡检目标的增删改查与结果历史。
- 用户管理，包括角色和密码操作。
- 面向普通用户的 `trading`、`notes`、`ledger`、`discipline` 模块可见性控制。
- 按模块配置 `read_write` / `read_only` 数据权限。
- 审计日志的采集、列表、筛选和删除。

### Ledger
- 以导入批次为核心的导入优先记账流程。
- 先入中间表 `ledger_import_rows`，再进入正式流水，避免直接写入账本。
- 分层规则引擎（来源识别 -> 商户归一 -> 分类 -> 兜底）与首批中国场景内置规则，且保留逐层命中痕迹。
- `/dedupe` 步骤当前保留为复核阶段的“重复标记清理”动作；自动重复标记默认关闭，避免同商户多次消费被误判为重复。
- review queue 后端闭环：批量改分类、批量改商户、批量确认、人工修正一键沉淀规则。
- 导入校对台支持从当前勾选样本直接创建规则（支持商户归一/分类/组合/来源平台规则，不需要填写分类编号，分类下拉含“其他”，可选择重识别未确认或全部记录）。
- 校对台强化：支持批量勾选、对当前批次重放规则、对待确认重新识别，并将提交入账操作集中在表格上方工具区。
- 校对台支持高置信阈值可调与“一键确认高阈值”待确认记录。
- 规则生成强化：支持预览命中范围与预计影响条数、跳过明显重复规则、支持“仅当前来源范围”与“全局”两种生效范围。
- commit 仅导入 `confirmed` / `approved` / `accepted` 行，并保留 batch / row / transaction 关联。
- 导入时间口径统一为“年月日”（导入时不保留时分秒）。
- 商户词典 `ledger_merchants`（规范名/别名/默认分类/命中次数）支持编辑，并展示最近关联样本。
- 统一表格读取层支持 `csv/xls/xlsx`（包含 HTML table 风格 `.xls` 导出）。
- 资产库页面 `/ledger/assets` 已支持资产长期记录、买入成本、附加成本、使用与闲置、生命周期事件、卖出复盘与日均成本分析，并统一收敛在单页面 Tabs 工作区内。
- 资产库的生命周期与分析视图现已补充顶部紧凑事件表单、事件前 5 条折叠与展开、hover 删除按钮、更清晰的生命周期选择器指标条，以及覆盖类型分布、购入年份趋势、使用效率、附加成本占比、ROI 和闲置天数的扩展分析图表。
- Ledger 前端现已提供 4 套可切换主题（`light` / `dark` / `ink` / `tech`），并通过侧边栏下拉选择器切换，紧凑模式与所有主题兼容。
- 当前 Ledger 页面包括：
  - 导入中心：`/ledger/imports`
  - 导入校对台：`/ledger/imports/:batchId/review`
  - 基础分析页：`/ledger/analytics`
  - 商户词典页：`/ledger/merchants`
  - 规则管理页：`/ledger/rules`（支持规则新增/编辑/删除，含命中次数与最近命中时间）
  - 资产库页：`/ledger/assets`（在单页面 Tabs 内完成资产长期记录、买入成本、附加成本、使用与闲置、生命周期事件、卖出复盘与日均成本分析）
- 关键接口：
  - `POST /api/ledger/import-batches`、`GET /api/ledger/import-batches`、`GET /api/ledger/import-batches/{id}`
  - `POST /api/ledger/import-batches/{id}/parse`、`/classify`、`/dedupe`、`/commit`
  - `GET /api/ledger/import-batches/{id}/review-rows`、`GET /api/ledger/import-batches/{id}/review-insights`
  - `POST /api/ledger/import-batches/{id}/review/bulk-category`、`/review/bulk-merchant`、`/review/bulk-confirm`、`/review/reclassify-pending`、`/review/generate-rule`
  - `GET /api/ledger/categories`
  - `GET/POST/PUT /api/ledger/merchants`
  - `GET/POST/PUT/DELETE /api/ledger/rules`
  - `GET /api/ledger/analytics/summary`、`/analytics/category-breakdown`、`/analytics/platform-breakdown`、`/analytics/top-merchants`、`/analytics/monthly-trend`、`/analytics/unrecognized-breakdown`
  - 前端已切到导入工作流主入口；Phase 4（AI/报表增强）尚未开始。
  - 校对台来源渠道、平台、分类、状态等用户可见字段统一中文展示。

## Quick Start
### 前置要求
- Python 3
- Node.js 22.22.0 或更高版本
- npm
- 可选：`tmux`
- 生产部署需要 Linux、`systemd` 和 Nginx

### 安装依赖
```bash
cd backend
python3 -m pip install -r requirements.txt

cd ../frontend-trading
npm ci

cd ../frontend-notes
npm ci

cd ../frontend-monitor
npm ci

cd ../frontend-ledger
npm ci
```

### 最快启动方式
```bash
./dev.sh up
```

默认从 `http://127.0.0.1:5172` 进入 portal。

`dev.sh` 会自动发现带有 `package.json` 且定义了 `dev` 脚本的 `frontend*` 目录，并与 FastAPI backend、portal 本地网关一起拉起。

## 路由与应用入口

生产更新默认通过服务器 `deploy/update.sh` 拉取 Git。明确要求不推送 Git 时，也可先备份并上传经哈希校验的本地源码快照，在服务器设置 `DEPLOY_SOURCE_MODE=snapshot` 和 `DEPLOY_SNAPSHOT_MANIFEST`（含 snapshot_id 及各源码文件路径、SHA-256 的 JSON 清单）执行同一脚本。该模式跳过 Git 拉取，仍执行依赖安装、五个前端构建、Nginx 校验和服务重启；部署入口还须核验源码哈希、API/数据库健康及所有公开入口。源码快照不改变 Git HEAD，服务器工作区会保留快照差异，后续 Git 部署前须先核对处理。
- `/`：工作台门户首页；「自律养成」替代隐藏的账务入口。
- `/discipline/`：自律首页，展示月均达成率、等级天数和彩色执行日历。仅统计周一至周五扣除节假日的日期，周末调休上班也不计入；已维护 2026、2027 年中国大陆官方假期，其他年份暂停统计。首次记录前不追溯计分，之后漏记工作日按 0% 保留。
- 首页点击日历日期通过侧边抽屉查看当日时段、成绩与具体记录，保留首页位置。
- `/discipline/plan`：固定北京时间当天的每日计划，评价、统计开关及可选备注在修改后自动保存，显示保存状态与失败重试。默认作息保存后同步当天，保留原有评价和备注；历史只读。初始起床时间 07:00 可改。
- `/discipline/screen`：屏幕统计，可切换日／周／月和设备，查看应用、分类与前台使用轨迹。支持导入已解析的 Biome 事件、重复去重及迟到数据重算；可安装 [Mac 每日采集器](clients/macos-screen/README.md)，默认08:00同步，支持登录／唤醒补跑、钥匙串专用上传凭证和本地失败队列。来源、统计规则和导入格式见 [屏幕统计说明](docs/discipline-screen.md)。
- `/discipline/ai`：AI 总结，支持日／周复盘、生成重点与长度、事实依据、历史版本、重新生成、复制／下载和同步后的可选自动复盘。DeepSeek 密钥仅保存在后端，计划备注默认不发送。配置命令 `python3 scripts/configure_discipline_ai.py`，详见 [AI 总结说明](docs/discipline-ai.md)。
- 首页日期抽屉最多占视口宽度的 78%（且不超过 640px），保留首页可见区域。参与统计的时段在抽屉和每日计划中均使用整卡配色：符合为绿、部分符合为黄、偏离为红；未评价及未参与统计的时段保持中性色。
- 默认作息调整只同步当天时间、主题和统计范围，保留已有评价与备注，可能重新计算当天达成率；历史安排和成绩不变，未来未生成日期按届时最新作息生成。每日计划的“调整记录”保存每次成功调整的新旧作息、北京时间、当天同步前后完整快照，历史版本只读；旧数据只保留现存版本基线，不虚构此前的修改时间与记录。
- 删除作息时段会同步从当天移除，原评价和备注保存在调整前快照；在相同时间新建另一时段可正常保存，并从未评价、空备注开始。新增时段优先填补空档，校验失败会指出具体时段及原因。
- `/login`：统一登录页。
- `/trading/`：交易工作台首页；记录、仪表盘、计划、研究、信息维护和回收站继续作为独立子页面提供。
- `/notes/`：笔记工作台入口。
- `/monitor/`：监控与管理工作台入口。
- `/ledger/`：授权用户可直接访问的账务前端入口；应用内部会跳转到 `/ledger/imports`，但 Portal 首页不再展示该入口。
- `/api/*`：统一 FastAPI API，覆盖鉴权、交易、笔记、监控、账务、上传等后端能力。

## 架构概览
Portal 提供包括自律养成在内的独立应用入口，并隐藏账务卡片。FastAPI 在 `/api/*` 提供接口，自律养成使用 `/api/discipline/*` 与按用户隔离的独立数据表。SQLite 数据位于 `backend/data`，生产上传通过 `UPLOAD_DIR` 存在 Git 工作区外。Nginx 提供 SPA 回退，`/ledger` 与 `/discipline` 均重定向到带尾斜杠路径。

## 目录结构
- `backend/`：统一 FastAPI 后端，既包含交易域，也包含独立的账务后端域 `/api/ledger/*`。
  - `core/`：配置、数据库、请求上下文、中间件与安全相关基础设施。
  - `routers/`：鉴权、交易、笔记、监控、账务、上传等 API 路由注册。
  - `services/`：共享服务模块，以及账务相关服务实现。
  - `models/`：各业务域的 SQLAlchemy 模型。
  - `schemas/`：API 输入输出的 Pydantic 模型。
  - `trading/`：交易域专用业务逻辑，如导入、分析、研究、复盘和计划等。
  - `data/`：SQLite 数据库和本地运行期数据；生产上传文件配置在仓库外。
- `frontend-trading/`：部署在 `/trading/` 下的交易前端。
- `frontend-notes/`：部署在 `/notes/` 下的笔记前端。
- `frontend-monitor/`：部署在 `/monitor/` 下的监控与管理前端。
- `frontend-ledger/`：部署在 `/ledger/` 下的独立账务前端。
- `frontend-discipline/`：部署在 `/discipline/`、本地端口 5177 的自律养成前端；首次运行需在此目录执行 `npm ci`，再使用 `./dev.sh up`。生产更新脚本自动构建。
- `clients/macos-screen/`：可选的 Mac 每日屏幕采集器、原生钥匙串启动器、本地队列、有限网络重试与采集期间的临时防休眠。可由管理员安装独立唤醒工具，通过带标识的事件定时唤醒，不覆盖其他电源计划；包含隔离模拟数据测试及真实休眠／唤醒测试，安装与停用见该目录 README。
- `portal/`：本地开发与生产共用的静态门户和登录页。
- `deploy/`：裸机部署脚本、systemd 服务文件与 Nginx 运行配置。
- `dev.sh`：统一拉起 backend、portal 和自动发现前端的本地开发脚本。

## 技术栈
- FastAPI / SQLAlchemy / Pydantic / Uvicorn
- SQLite
- React / Vite / Axios / Ant Design
- Recharts
- Nginx / systemd / shell scripts

## 环境变量
| 变量 | 用途 |
| --- | --- |
| `DEV_MODE` | 控制后端是否启用本地开发模式。 |
| `COOKIE_SECURE` | 控制鉴权 Cookie 是否要求 HTTPS。 |
| `PORTAL_DEV_PORT` | portal 本地网关端口。 |
| `PORTAL_BACKEND_PORT` | portal 本地代理使用的后端端口。 |
| `PORTAL_TRADING_PORT` | portal 本地代理使用的交易前端端口。 |
| `PORTAL_NOTES_PORT` | portal 本地代理使用的笔记前端端口。 |
| `PORTAL_MONITOR_PORT` | portal 本地代理使用的监控前端端口。 |
| `PORTAL_LEDGER_PORT` | portal 本地代理使用的账务前端端口。 |
| `POEM_CACHE_TTL` | 可选的每日诗词接口缓存时长。 |
| `POEM_REMOTE_URL` | 可选的每日诗词远端来源地址。 |
| `JINRISHICI_TOKEN` | 可选的每日诗词来源令牌。 |

## 常用命令
```bash
./dev.sh up
./dev.sh down
./dev.sh status
./dev.sh attach
python3 -m pytest -q backend/tests

cd frontend-trading && npm run build
cd frontend-notes && npm run build
cd frontend-monitor && npm run build
cd frontend-ledger && npm run build
```

## 部署说明
生产部署默认改为“项目直接放在服务器上运行”。仓库建议放在 `/opt/tradingRecords`，各前端直接在服务器本机构建，FastAPI 通过 `systemd` 常驻运行，主机 Nginx 负责 portal、各 SPA 静态资源以及 `/api/*` 反向代理。

```bash
bash deploy/setup.sh
bash deploy/update.sh
```

- `deploy/setup.sh`：首次部署脚本。负责安装运行时依赖（包括 Node.js 22.22.0）、在 `/opt/tradingRecordsData/venv` 创建生产虚拟环境、构建全部前端、安装 Nginx 配置并启用 `trading` systemd 服务。
- `deploy/cert-renew.sh`：执行 `certbot renew`，并在续期成功后自动 reload Nginx。
- `deploy/trading-cert-renew.service` + `deploy/trading-cert-renew.timer`：通过 `systemd timer` 每天两次检查证书续期，`deploy/setup.sh` 会自动安装并启用。
- `deploy/update.sh`：常规更新脚本。负责拉取最新代码、确保 Node.js 不低于 22.22.0、在 `/opt/tradingRecordsData/venv` 刷新后端依赖、重建全部前端、同步 portal 文件、重载 Nginx 并重启 `trading` 服务。
- `deploy/trading.service`：systemd 单元文件，从 `/opt/tradingRecordsData/venv` 启动 `uvicorn`，并通过 `UPLOAD_DIR=/opt/tradingRecordsData/uploads` 将上传目录放在仓库外。
- `deploy/nginx.conf`：宿主机 Nginx 配置，负责 `/`、`/trading/`、`/notes/`、`/monitor/`、`/ledger/` 的静态分发和 `/api/*` 到 `127.0.0.1:8000` 的代理。

对于已经存在 Let’s Encrypt 证书的服务器，可以立即手动触发一次续期检查：

```bash
bash deploy/cert-renew.sh
systemctl status trading-cert-renew.timer
```

## 文档与验收
- [docs/MODULE_REGISTRY.md](./docs/MODULE_REGISTRY.md)
- [docs/API_STYLE.md](./docs/API_STYLE.md)
- [docs/BACKEND_STRUCTURE.md](./docs/BACKEND_STRUCTURE.md)
- [docs/DEPENDENCY_POLICY.md](./docs/DEPENDENCY_POLICY.md)
- [docs/SECURITY.md](./docs/SECURITY.md)
- [scripts/check_all.sh](./scripts/check_all.sh)
- [scripts/check_deploy.sh](./scripts/check_deploy.sh)
- [scripts/check_naming.sh](./scripts/check_naming.sh)
- [scripts/check_router_style.py](./scripts/check_router_style.py)
- [scripts/check_runtime_boundaries.py](./scripts/check_runtime_boundaries.py)
- [scripts/check_runtime_size.py](./scripts/check_runtime_size.py)
- [docs/ledger-smoke-checklist.md](./docs/ledger-smoke-checklist.md)
- [scripts/ledger-smoke.sh](./scripts/ledger-smoke.sh)
- [README.md](./README.md)
