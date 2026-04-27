# Dependency Policy

本文件记录当前依赖现状，并限制跨模块无理由漂移。

## 当前现状

### 后端

- `backend/requirements.txt` 当前未 pin 版本，属于历史状态。
- 这意味着同一份依赖文件在不同时间重新安装，结果可能不完全一致。

### 前端

- `trading` (`frontend`)：`React 19`、`antd 6`、`vite 8`。
- `notes` (`frontend-notes`)：`React 19`、`antd 6`、`vite 8`。
- `ledger` (`frontend-ledger`)：`React 19`、`antd 6`、`vite 8`。
- `monitor` (`frontend-monitor`)：`React 18`、`antd 5`、`vite 6`。

当前前端栈并不完全一致，这属于已知现状，不应为了“看起来统一”而随手跨模块升级。

## 新增依赖规则

- 新增后端或前端依赖时，必须说明：
  - 依赖加到哪个模块。
  - 为什么现有依赖无法满足。
  - 是否影响构建体积、部署步骤或运行环境。
- 禁止无说明地把某个模块的依赖升级顺手同步到其他模块。
- 禁止因为 AI 自动补全建议，就跨模块统一升级大版本。

## 升级规则

- 依赖升级必须按模块说明原因，不做“顺手升级一片”。
- `monitor` 维持自身技术栈，直到专门的升级任务出现。
- 后端若要从未 pin 走向 pin，需单独设计迁移与验证，不在普通业务改动中夹带完成。

## 验证规则

- 改 `backend/requirements.txt` 时，至少运行后端测试与相关检查脚本。
- 改任一前端 `package.json` / lockfile 时，至少运行对应前端 `npm run build`。
- 涉及跨模块依赖调整时，应运行 `bash scripts/check_all.sh`，并在变更说明里明确影响范围。
