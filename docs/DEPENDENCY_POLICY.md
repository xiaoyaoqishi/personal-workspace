# Dependency Policy

本文件记录当前依赖基线，并限制跨模块无理由漂移。

## 当前基线

### 后端

- `backend/requirements.txt` 已切换为精确版本（`==`）锁定。
- 部署与构建时必须使用该锁定文件，不得临时放宽版本范围。

### 前端

- 所有前端模块保留各自 `package-lock.json` 作为锁定源，安装使用 `npm ci`。
- `trading` (`frontend-trading`)：`React 19.2.8`、`React Router 8.3.0`、`antd 6`、`vite 8.2.0`。
- `notes` (`frontend-notes`)：`React 19.2.8`、`React Router 8.3.0`、`antd 6`、`vite 8.2.0`。
- `ledger` (`frontend-ledger`)：`React 19.2.8`、`React Router 8.3.0`、`antd 6`、`vite 8.2.0`。
- `monitor` (`frontend-monitor`)：`React 19.2.8`、`React Router 8.3.0`、`antd 6`、`vite 8.2.0`。
- 本地与生产前端构建要求 `Node.js >= 22.22.0`；`deploy/setup.sh` 与 `deploy/update.sh` 会安装或补齐该版本。

当前五个前端模块统一为同代核心栈；后续升级仍需按模块说明原因与影响范围。
- `discipline` 使用与 Notes 一致的 React、React Router、Ant Design、dayjs、Vite 和 icons 精确版本及独立 lockfile；复用现有技术栈，无新增第三方依赖种类，不引入富文本编辑器。新增独立构建步骤与本地端口 5177。
- 屏幕统计复用上述前端依赖与后端 SQLAlchemy/Pydantic；图表使用本地组件和 CSS，不依赖远程图表服务、应用图标网络请求或新的图表包。Mac 每日采集器的独立运行依赖见下文。

## 新增依赖规则

- AI 总结复用已锁定的 `httpx`、Pydantic、SQLAlchemy及现有前端组件；不新增 SDK、图表或 Markdown 渲染依赖。官方 DeepSeek 用 HTTP 调用，前端仅渲染经过校验的纯文本结构。

- `clients/macos-screen` 不新增 Python 第三方依赖；SEGB/protobuf 离线解析代码固定为 SonyCore/biome-screentime-exporter 提交 `0f384a39110d40effb4ce6a444735bac311e923b` 并保留 MIT 许可。Mac 安装时使用已有 Xcode Command Line Tools 的 Swift 编译器及系统 AppKit/Security 框架生成启动器、使用 `/usr/bin/python3` 运行标准库代码；不影响 Linux 后端依赖、前端包或服务器构建步骤。
- 休眠采集复用 macOS 自带 `caffeinate`、`pmset` 和 launchd，无新增包。可选 root 唤醒工具只安装于 Mac，不改变 Linux 的 nginx、systemd 或服务器部署依赖。

- 新增后端或前端依赖时，必须说明：
  - 依赖加到哪个模块。
  - 为什么现有依赖无法满足。
  - 是否影响构建体积、部署步骤或运行环境。
- 禁止无说明地把某个模块的依赖升级顺手同步到其他模块。
- 禁止因为 AI 自动补全建议，就跨模块统一升级大版本。

## 升级规则

- 依赖升级必须按模块说明原因，不做“顺手升级一片”。
- 依赖升级必须按模块说明原因，不做“顺手升级一片”。
- 后端若要升级基础依赖，需单独调整 `requirements.txt` 并验证。

## 验证规则

- 改 `backend/requirements.txt` 时，至少运行后端测试与相关检查脚本。
- 改任一前端 `package.json` / lockfile 时，至少运行对应前端 `npm run build`。
- 涉及跨模块依赖调整时，应运行 `bash scripts/check_all.sh`，并在变更说明里明确影响范围。
