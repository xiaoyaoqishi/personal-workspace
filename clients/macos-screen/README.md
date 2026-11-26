# Mac 屏幕统计采集器

用户级后台采集器，默认北京时间每日 09:30 一次。Mac 休眠时由 launchd 在唤醒后补跑；登录时检查错过的任务，同日成功后不重复扫描。手动同步可使用 `--force`。

## 安装

要求 macOS 13+，系统 Python 3.9+ 与 Xcode Command Line Tools（用于编译固定身份的 Swift 启动器）。不安装 Python 包或常驻网络服务。Swift 启动器使用系统 Security 框架读取钥匙串，并通过标准输入把凭证传给 Python 子进程；凭证不出现在命令行、环境变量、配置文件或日志中。

```bash
python3 clients/macos-screen/install.py install
```

应用安装到 `/Applications/DisciplineScreen.app`，用户配置和 SQLite 队列位于 `~/Library/Application Support/DisciplineScreen/`（目录 0700，文件 0600），日志位于 `~/Library/Logs/DisciplineScreen/`。安装只准备任务，验证成功后才启用。

在网页「屏幕统计 → 设备与数据 → 自动采集连接」创建凭证。通过启动器 `set-token` 的标准输入传入 JSON（勿将真实 token 写入脚本、命令参数或源码）：`{"server":"https://your-domain.example","account":"your-login","collector_id":"凭证ID","token":"一次性显示的凭证","hour":9,"minute":30,"timezone":"Asia/Shanghai"}`。生产运维可通过已授权的 SSH 在服务端生成当前用户凭证，并直接通过管道配置本机钥匙串。

在「系统设置 → 隐私与安全性 → 完全磁盘访问」添加并启用该应用。Terminal 的权限不代表此应用的权限。然后双击应用：成功完成首次同步后自动启用每日任务。若权限尚未生效，提示失败并保留待上传队列，不宣称同步成功。

```bash
python3 clients/macos-screen/install.py enable
python3 clients/macos-screen/install.py status
/Applications/DisciplineScreen.app/Contents/MacOS/DisciplineScreen sync --force
python3 clients/macos-screen/install.py disable
python3 clients/macos-screen/install.py uninstall
```

`enable` 会先验证文件访问并完成一次真实同步，再加载 LaunchAgent。卸载将应用移入本地备份、卸载任务，保留本地历史与钥匙串凭证；服务器端撤销凭证会立即阻止继续上传。应用更新会保留旧应用备份，重新构建后可能需要重新确认系统隐私授权。

## 数据与恢复

- 每天重扫当前 Biome 可读记录，不以文件修改时间或最大事件时间作游标。文件会原地更新，手机也会延迟同步历史事件。
- 事件按设备、UTC 微秒时间、应用和前台状态去重。先持久化本地队列，验证服务器返回账户与配置一致后再按 1000 条分批上传。
- 服务器原子确认批次的接收／新增／重复数后才标记已上传。响应丢失、断网、部分批次失败均保留未确认事件，下次重传安全。
- 本地队列按服务器地址和账户隔离；凭证轮换不丢失进度。`sync --force --replay` 显式重传本地已缓存的所有事件，服务器仍会去重。
- 支持 `sync --force --source /可读的/App.InFocus副本` 首次导入已有快照；此选项不改变每日任务的真实数据源。快照同步成功不证明自动任务已有 Biome 读取权限。
- HTTP 上传只接受 HTTPS（单元测试允许 loopback HTTP），拒绝重定向；不上传浏览器正文、窗口标题、原始系统数据库或钥匙串内容。
- 默认使用 Mac 的屏幕时间跨设备同步记录，设备名称从 sync.db 或私有配置获得；未知设备可在网页重命名。

## 检查

```bash
python3 -m unittest discover -s clients/macos-screen/tests -v
/Applications/DisciplineScreen.app/Contents/MacOS/DisciplineScreen check-access
```

`status.json` 记录最近尝试、最近成功、失败原因、扫描／上传／新增数量；显示成功只表示该次读到的数据已确认入库，不保证 iCloud 已同步所有设备。系统未运行超过本机历史保留期限时，无法补回已经过期的源数据。

## 第三方代码

`vendor/biome_screentime` 来自 SonyCore/biome-screentime-exporter，固定提交 `0f384a39110d40effb4ce6a444735bac311e923b`，MIT 许可见 `vendor/LICENSE.biome-screentime`。仅包含离线 SEGB/protobuf/事件解析器，未使用上游基于最大时间戳的增量导出模式。实际格式兼容性需要在 macOS 升级后验证。
