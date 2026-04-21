[English README](./README.md)

# tradingRecords：个人自托管工作台

## 一句话定位
`tradingRecords` 是一个个人自托管的多应用工作台仓库，把交易记录与复盘、知识笔记、服务器监控、个人记账、统一登录和门户入口放在同一个工作区里。

## 模块地图
- `Trading`：负责交易记录、分析、复盘会话、交易计划，以及研究/知识工作流。
- `Notes`：负责笔记本、日记/文档笔记、反向链接、待办和回收流程。
- `Monitor`：负责管理员侧的服务器指标、站点巡检、用户管理和审计日志。
- `Ledger`：独立的个人账务应用，覆盖账户、流水、规则、导入和周期账单。
- `Portal`：工作台的静态首页与登录入口。
- `Backend`：统一 FastAPI API、鉴权、数据权限、上传能力，以及基于 SQLite 的后端服务。

## 当前能力概览
### Trading
- 交易记录的增删改查、筛选、搜索选项和持仓视图。
- 面向交易记录的统计与分析接口。
- 基于粘贴文本的交易导入与分阶段解析。
- 结构化单笔复盘数据与复盘分类体系。
- 可关联交易的复盘会话，以及基于筛选结果生成会话。
- 交易计划，以及与交易、复盘会话之间的关联流转。
- 知识条目、主分类+次级分类目录、标签、状态和笔记链接。
- 信息维护（知识库）支持长内容底部滚动缓冲与返回顶部按钮。
- 复盘会话与交易计划工作台支持长内容底部滚动缓冲与返回顶部按钮。
- 复盘会话与交易计划工作台支持侧栏收起、`研究内容` / `属性与关联` 分组与主区无标题展示。
- 交易侧回收站，覆盖交易、券商、复盘会话、计划和知识条目。

### Notes / Knowledge
- 日记与文档两类笔记本管理。
- 日记/文档笔记的增删改查与统一编辑流程。
- 搜索、日历、日记树和历史回看能力。
- Wiki 链接解析与反向链接。
- 笔记工作台内的待办管理。
- 笔记回收站的恢复与清理流程。

### Monitor / Admin
- 统一后端提供的登录、退出、初始化和会话校验。
- 仅管理员可访问的监控接口。
- 服务器实时指标与历史指标。
- 站点巡检目标的增删改查与结果历史。
- 用户管理，包括角色和密码操作。
- 面向普通用户的 `trading`、`notes`、`ledger` 模块可见性控制。
- 按模块配置 `read_write` / `read_only` 数据权限。
- 审计日志的采集、列表、筛选和删除。

### Ledger
- 账户管理。
- 分类管理。
- 流水增删改查，以及按账户、分类、类型、方向、来源、关键词、日期范围筛选。
- Dashboard 汇总、账户余额和最近流水。
- CSV 导入预览、确认导入，以及导入模板保存。
- 自动规则的增删改查、预览和重新应用。
- 周期账单规则、提醒、候选识别、草稿生成和手工匹配标记。

## Quick Start
### 前置要求
- Python 3
- Node.js
- npm
- 可选：`tmux`
- 生产部署需要 Linux、`nginx` 和 `systemd`

### 安装依赖
```bash
cd backend
pip install -r requirements.txt

cd ../frontend
npm install

cd ../frontend-notes
npm install

cd ../frontend-monitor
npm install

cd ../frontend-ledger
npm install
```

### 最快启动方式
```bash
./dev.sh up
```

默认从 `http://127.0.0.1:5172` 进入 portal。

`dev.sh` 会自动发现带有 `package.json` 且定义了 `dev` 脚本的 `frontend*` 目录，并与 FastAPI backend、portal 本地网关一起拉起。

## 路由与应用入口
- `/`：工作台门户首页。
- `/login`：统一登录页。
- `/trading/`：交易前端入口；应用内部会跳转到 `/trading/dashboard`。
- `/notes/`：笔记工作台入口。
- `/monitor/`：监控与管理工作台入口。
- `/ledger/`：账务前端入口；应用内部会跳转到 `/ledger/dashboard`。
- `/api/*`：统一 FastAPI API，覆盖鉴权、交易、笔记、监控、账务、上传等后端能力。

## 架构概览
Portal 是整个工作台的入口层。各个前端应用独立构建，并分别挂在自己的子路径下；FastAPI 在 `/api/*` 下统一提供后端接口。持久化数据保存在 `backend/data` 下的 SQLite 中。生产环境由 Nginx 负责 portal、各个 SPA 和 API 的路径分发与回退处理，其中 `/ledger` 会重定向到 `/ledger/`。

## 目录结构
- `backend/`：统一 FastAPI 后端，既包含交易域，也包含独立的账务后端域 `/api/ledger/*`。
  - `core/`：配置、数据库、请求上下文、中间件与安全相关基础设施。
  - `routers/`：鉴权、交易、笔记、监控、账务、上传等 API 路由注册。
  - `services/`：共享服务模块，以及账务相关服务实现。
  - `models/`：各业务域的 SQLAlchemy 模型。
  - `schemas/`：API 输入输出的 Pydantic 模型。
  - `trading/`：交易域专用业务逻辑，如导入、分析、复盘、计划、知识等。
  - `data/`：SQLite 数据库、上传文件和运行期数据。
- `frontend/`：部署在 `/trading/` 下的交易前端。
- `frontend-notes/`：部署在 `/notes/` 下的笔记前端。
- `frontend-monitor/`：部署在 `/monitor/` 下的监控与管理前端。
- `frontend-ledger/`：部署在 `/ledger/` 下的独立账务前端。
- `portal/`：本地开发与生产共用的静态门户和登录页。
- `deploy/`：部署脚本、Nginx 配置与 systemd 服务文件。
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
pytest -q backend/tests

cd frontend && npm run build
cd frontend-notes && npm run build
cd frontend-monitor && npm run build
cd frontend-ledger && npm run build
```

## 部署说明
首次在 Linux 主机部署时使用 `deploy/setup.sh`，已有环境更新时使用 `deploy/update.sh`。生产路径分发定义在 `deploy/nginx.conf`，后端服务由 `deploy/trading.service` 管理。生产部署已纳入 `/ledger/`，并已配置好前端应用所需的 SPA fallback。

## 文档与验收
- [docs/ledger-smoke-checklist.md](./docs/ledger-smoke-checklist.md)
- [scripts/ledger-smoke.sh](./scripts/ledger-smoke.sh)
- [README.md](./README.md)
