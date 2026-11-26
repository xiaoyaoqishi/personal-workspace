# 直接源码快照部署

仅在用户明确要求不推送 Git、直接部署本地源码时使用。默认部署流程仍为 Git 更新；不得在本机运行 `deploy/update.sh`。

1. 使用本机 `.codex/local/aliyun-prod.md` 的连接和标准入口；快照模式不执行 Git push。
2. 上传前确认服务器基线提交等于本地基线 HEAD、服务器源码干净，排除密钥、`.env`、`.codex`、数据库、上传、node_modules 和构建产物。对快照每个文件记录 SHA-256。
3. 服务器校验归档和清单，备份原代码、构建产物、已安装配置，并通过 SQLite 在线备份保存数据库。备份置于静态目录与 Git 工作区之外。
4. 上传源码后运行服务器 `DEPLOY_SOURCE_MODE=snapshot DEPLOY_SNAPSHOT_MANIFEST=/绝对路径/manifest.json bash deploy/update.sh`。清单格式：`{"snapshot_id":"local-...","files":[{"path":"backend/...","sha256":"..."}]}`。
5. 校验部署后全部源码哈希、基线 HEAD 未变，`trading`、`nginx`、`trading-cert-renew.timer` 均 active，`/api/health` 与数据库健康；portal、notes、trading、ledger、monitor、discipline、discipline/plan 及静态资源均通过 HTTP 验收。
6. 出错时恢复备份代码、静态产物、已安装配置并重启；不要用旧数据库覆盖部署期间用户新写入的数据。新增文件应移至备份目录，避免不可恢复删除。

快照部署后服务器源码差异是预期状态，不能宣称 Git 工作区干净或已推送目标提交。报告快照 ID、基线提交、备份路径和哈希验收结果。后续 Git 更新须先明确处理这些差异，禁止强制 reset 覆盖。
