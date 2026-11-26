# Security Baseline

- Mac 屏幕采集凭证只允许 `/api/discipline/screen/collector/imports` POST 与 `/collector/status` GET，不能访问统计明细、创建其他凭证或其他模块；即使同时携带网页登录 cookie 也不能扩大范围。凭证通过 CSPRNG 生成，数据库仅保存 SHA-256，按当前账户列出／撤销；账户停用、模块移除、只读或凭证撤销都会阻止后续上传。采集权限逻辑集中在 dedicated service，不进入 runtime。
- 采集凭证只在创建时返回一次，Mac 使用系统钥匙串保存，原生启动器通过标准输入交给采集子进程；不写入命令参数、环境变量、日志、源代码或普通配置。自动上传拒绝 HTTP 重定向，上传前验证服务器账户与本机配置一致。本地队列目录 0700、文件 0600，按服务器＋账户隔离。

- 屏幕统计 `/api/discipline/screen/*` 沿用现有登录、模块权限和数据权限；导入、应用分类与设备重命名要求可写权限。所有查询及唯一键按当前用户名隔离，JSON 不允许指定数据归属，不开放匿名上传入口。
- 导入要求带时区的非未来事件时间、唯一且明确声明的设备标识，单次最多 32 台设备和 50000 条事件；整批事务提交，重复事件按用户和内容指纹去重。设备及应用名称输出到 CSV 时防止公式注入。原始个人事件、设备 UUID、数据副本和导入文件不得提交到 Git。

- 自律养成 `/api/discipline/*` 要求登录及 `discipline` 模块权限；只读权限禁止 PUT。数据使用当前登录用户名隔离，管理员也仅访问自己的计划；不接受客户端传入用户归属。现有显式模块授权列表不会自动追加新模块，可由管理员在用户管理中授予。
- 自律计划 PUT 在 service 使用服务器 Asia/Shanghai 日期校验，仅当日可写；历史与未来禁止修改完整记录，包括评价、备注、时间段及统计开关，管理员和开发模式也不例外。默认作息的变更不能影响历史快照或历史漏记日成绩。
- 默认作息调整记录按登录用户名隔离；版本列表与快照详情使用相同模块权限检查，只读用户可查看自己的版本。仅成功的模板保存会追加记录，记录与模板及当天同步原子提交，无版本修改、删除、回写历史日期的 API。

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

### Upload Storage

- 上传文件目录由 `UPLOAD_DIR` 配置。
- 本地默认落在 `backend/data/uploads`；生产 systemd 服务使用 `/opt/tradingRecordsData/uploads`。
- 生产环境必须保证上传目录不在 Git 工作区内，避免用户上传文件阻塞代码更新或被误提交。

### TLS Certificate Renewal

- 生产 HTTPS 证书路径当前由 `deploy/nginx.conf` 指向 `/etc/letsencrypt/live/tradetrack.top/`。
- `deploy/cert-renew.sh` 使用 `certbot renew --deploy-hook "systemctl reload nginx"` 执行续期并在成功后重载 Nginx。
- `deploy/trading-cert-renew.timer` 默认每天两次触发续期检查。
- 若服务器证书已过期，应先手动执行一次续期或补发，再依赖自动续期。

## 生产环境禁止项

- 禁止 `DEV_MODE=1` 进入生产环境。
- 禁止把 `allow_origins=["*"]` 与 `allow_credentials=True` 作为生产默认配置继续保留。
- 禁止把调试期的“默认管理员上下文”能力暴露到公网环境。
- 禁止把会话 secret、认证数据文件或数据库文件暴露到静态目录或仓库提交中。

## 生产环境要求

- 生产部署应显式关闭 `DEV_MODE`。
- 生产 cookie 应保持 `COOKIE_SECURE=1`，并通过 HTTPS 提供服务。
- 生产 CORS 应收敛为明确白名单，不能继续使用 `*` + credentials 的组合。
- 生产证书续期任务必须处于启用状态，并定期检查 `systemctl status trading-cert-renew.timer` 与 `certbot renew --dry-run`。
- 安全相关改动若影响登录、跨域、cookie 或部署变量，必须同步检查部署脚本和相关文档。
