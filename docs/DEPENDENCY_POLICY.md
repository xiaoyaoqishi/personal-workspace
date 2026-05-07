# Dependency Policy

本文件记录当前依赖基线，并限制跨模块无理由漂移。

## 当前基线

### 后端

- `backend/requirements.txt` 已切换为精确版本（`==`）锁定。
- 部署与构建时必须使用该锁定文件，不得临时放宽版本范围。

### 前端

- 所有前端模块保留各自 `package-lock.json` 作为锁定源，安装使用 `npm ci`。
- `trading` (`frontend-trading`)：`React 19`、`antd 6`、`vite 8`。
- `notes` (`frontend-notes`)：`React 19`、`antd 6`、`vite 8`。
- `ledger` (`frontend-ledger`)：`React 19`、`antd 6`、`vite 8`。
- `monitor` (`frontend-monitor`)：`React 19`、`antd 6`、`vite 8`。

当前四个前端模块已统一为同代核心栈；后续升级仍需按模块说明原因与影响范围。

## 新增依赖规则

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
