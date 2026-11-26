# Mac 屏幕统计采集器

用户级后台采集器，默认每日 08:00 一次（本机时区设为 Asia/Shanghai）。可选安装系统唤醒工具，在休眠时定时短暂唤醒后采集；未安装时由 launchd 在自然唤醒后补跑。登录时检查错过的任务，同日成功后不重复扫描。手动同步可使用 `--force`。

## 安装

要求 macOS 13+，系统 Python 3.9+ 与 Xcode Command Line Tools（用于编译固定身份的 Swift 启动器）。不安装 Python 包或常驻网络服务。Swift 启动器使用系统 Security 框架读取钥匙串，并通过标准输入把凭证传给 Python 子进程；凭证不出现在命令行、环境变量、配置文件或日志中。

```bash
python3 clients/macos-screen/install.py install
```

应用安装到 `/Applications/DisciplineScreen.app`，用户配置和 SQLite 队列位于 `~/Library/Application Support/DisciplineScreen/`（目录 0700，文件 0600），日志位于 `~/Library/Logs/DisciplineScreen/`。安装只准备任务，验证成功后才启用。

在网页「屏幕统计 → 设备与数据 → 自动采集连接」创建凭证。通过启动器 `set-token` 的标准输入传入 JSON（勿将真实 token 写入脚本、命令参数或源码）：`{"server":"https://your-domain.example","account":"your-login","collector_id":"凭证ID","token":"一次性显示的凭证","hour":8,"minute":0,"timezone":"Asia/Shanghai"}`。生产运维可通过已授权的 SSH 在服务端生成当前用户凭证，并直接通过管道配置本机钥匙串。

在「系统设置 → 隐私与安全性 → 完全磁盘访问」添加并启用该应用。Terminal 的权限不代表此应用的权限。然后双击应用：成功完成首次同步后自动启用每日任务。若权限尚未生效，提示失败并保留待上传队列，不宣称同步成功。

```bash
python3 clients/macos-screen/install.py enable
python3 clients/macos-screen/install.py status
/Applications/DisciplineScreen.app/Contents/MacOS/DisciplineScreen sync --force
python3 clients/macos-screen/install.py disable
python3 clients/macos-screen/install.py uninstall
```

`enable` 会通过实际 launchd 身份完成一次真实同步，再加载 LaunchAgent，避免调用终端的隐私身份造成误判。卸载将应用移入本地备份、卸载任务，保留本地历史与钥匙串凭证；服务器端撤销凭证会立即阻止继续上传。应用更新会保留旧应用备份，重新构建后可能需要重新确认系统隐私授权。

## 休眠时自动采集

现有安装使用下面的命令升级用户任务，无需重新编译应用或重新写入钥匙串：

```bash
python3 clients/macos-screen/install.py upgrade-agent
sudo /usr/bin/python3 -I clients/macos-screen/power.py install
python3 clients/macos-screen/install.py status
```

- 用户任务通过 `caffeinate -i -s` 在采集和短时重试期间持有防休眠断言，不保持屏幕常亮、不更改全局休眠时间，也不强制把正在使用的电脑送入休眠；完成后释放断言，系统按原有电源策略休眠。`-s` 仅在交流供电时有效，`-i` 防止空闲休眠，不能覆盖合盖或用户主动要求的睡眠。
- `daily.py` 对断网、超时及临时服务器错误最多尝试3次，间隔15秒和45秒；单次最多120秒，超时终止整组采集子进程。权限、钥匙串和凭证错误立即报告，保留未确认队列。`daily-status.json` 保留尝试次数和结果。
- 管理员步骤只安装 `/Library/Application Support/DisciplineScreenWake/power.py` 和 `/Library/LaunchDaemons/com.discipline.screen-wake.plist`。系统任务为次日08:00续订一个 owner 为 `com.discipline.screen-sync.wake` 的一次性 `pmset schedule wake` 事件；安装／开机加载时也检查。它不读取个人数据、钥匙串或用户脚本，不上传数据，不改变其他单次事件或系统重复电源计划。
- 这是“自动短暂唤醒后采集”。它不保证合盖、仅电池供电、低电量或系统限制下都能唤醒。需保持用户已登录；关机后 FileVault 的首次登录不能绕过。唤醒不等于 iCloud 已同步完所有手机／平板记录，迟到事件会在后续采集补入。
- 自定义时刻须同时向用户任务与系统工具传入相同的 `--hour`、`--minute`；更改系统时区后应重新核对时刻。

停用主动唤醒（保留通常的每日采集和自然唤醒补跑）：

```bash
sudo /usr/bin/python3 clients/macos-screen/power.py disable
```

停用／卸载用户采集器时，如已启用系统唤醒工具，也需要执行该管理员命令；安装器会显示提示。它只取消本工具拥有的未来唤醒事件。

## 真实休眠测试

```bash
python3 clients/macos-screen/sleep_test.py
```

在自己的终端执行；脚本通过系统 `sudo` 验证管理员密码，不读取或记录密码。它先验证后台真实同步，再安装每日唤醒工具，安排约两分钟后的独立测试唤醒，创建一次性用户任务，然后使电脑休眠。不要在测试期间手动唤醒或关闭终端；若未自动醒来，可手动唤醒后查看失败报告。

只有系统日志同时显示真实睡眠、带本次独立标识和目标时间的唤醒请求、系统激活定时唤醒，以及目标附近的 RTC／维护唤醒，并在唤醒后完成后台同步、队列为空，报告才标记 `verified: true`。兼容 Apple 芯片日志的 `rtc/HID Activity`，不会仅凭 HID 或时间接近判为通过。报告和日志保存在用户私有 `~/Library/Application Support/DisciplineScreen/sleep-tests/`；无论结果如何都会卸载临时用户任务并尝试取消本次尚未触发的测试事件，每日任务保留。模拟数据测试只连接本地临时 HTTP 服务和独立队列，不写正式统计。

系统工具安装到 root 所有的 `/Library/Application Support/DisciplineScreenWake/power.py`，定时任务为 `/Library/LaunchDaemons/com.discipline.screen-wake.plist`；只调用系统电源调度，不读取个人数据或钥匙串，不以 root 运行用户目录里的脚本。每天续订下次08:00的独立唤醒事件。停用时先执行 `sudo /usr/bin/python3 -I clients/macos-screen/power.py disable`，只移除本工具任务和本工具的未来唤醒事件；其他重复／一次性电源计划保留。

此模式需要 Mac 已登录账户并保留用户会话；不会自动解锁或绕过 FileVault。合盖、仅电池供电和深度待机的效果受设备电源策略影响，需按实际使用状态分别测试；不保证 iCloud 在唤醒时已经同步所有设备。采集结束后释放防休眠断言，由原系统设置决定何时再次休眠，不强制打断用户正在进行的操作。

机制依据：[Apple 定时任务](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)、[pmset 手册源码](https://github.com/apple-oss-distributions/PowerManagement/blob/main/pmset/pmset.1)。

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
