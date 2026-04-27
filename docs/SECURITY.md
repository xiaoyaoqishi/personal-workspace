# Security Baseline

本文件记录当前安全相关基线，避免开发便利配置误入生产。

## 当前配置点

### DEV_MODE

- 配置来源：`backend/core/config.py`
- `DEV_MODE=1` 时，后端进入开发模式。
- 当前效果：
  - 请求默认视为管理员上下文。
  - `/api/*` 不再执行正常登录校验流程。
  - 普通用户模块权限与数据权限限制不会按生产方式生效。

### COOKIE_SECURE

- 配置来源：`backend/core/config.py`
- 默认值：
  - `DEV_MODE=1` 时默认 `0`
  - 其他情况下默认 `1`
- 登录时实际写 cookie 的 `secure` 标记，还会额外要求请求 scheme 为 `https`。

### CORS

- 当前配置位于 `backend/app.py`。
- 现状是：
  - `allow_origins=["*"]`
  - `allow_credentials=True`
  - `allow_methods=["*"]`
  - `allow_headers=["*"]`
- 这是开发期宽松配置，不应直接视为生产安全基线。

### Session Secret

- 会话 secret 由 `backend/auth.py` 生成并持久化到 `backend/data/.secret`。
- 若该文件不存在，会自动生成随机 secret。
- 生产环境必须保证：
  - `.secret` 不被提交到仓库。
  - 数据目录权限受控。
  - 部署迁移时不要意外覆盖现有 secret，否则会导致现有登录态失效。

## 生产环境禁止项

- 禁止 `DEV_MODE=1` 进入生产环境。
- 禁止把 `allow_origins=["*"]` 与 `allow_credentials=True` 作为生产默认配置继续保留。
- 禁止把调试期的“默认管理员上下文”能力暴露到公网环境。
- 禁止把会话 secret、认证数据文件或数据库文件暴露到静态目录或仓库提交中。

## 生产环境要求

- 生产部署应显式关闭 `DEV_MODE`。
- 生产 cookie 应保持 `COOKIE_SECURE=1`，并通过 HTTPS 提供服务。
- 生产 CORS 应收敛为明确白名单，不能继续使用 `*` + credentials 的组合。
- 安全相关改动若影响登录、跨域、cookie 或部署变量，必须同步检查部署脚本和相关文档。
