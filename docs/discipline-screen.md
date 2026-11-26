# 屏幕统计

屏幕统计归属自律养成，入口 `/discipline/screen`，API `/api/discipline/screen/*`。
当前提供持久化统计与手动导入；可通过 `clients/macos-screen/` 安装用户级每日采集任务，详见其 README。服务器接收受限凭证上传的事件，不读取某台 Mac 的文件路径，也不连接 Apple 账户。

## 页面

- 默认显示北京时间昨天，支持日、自然周（周一至周日）、自然月，以及前后周期、今天、昨天快捷切换。
- URL 保存日期、周期和设备筛选，支持刷新、直接访问和浏览器前后退。
- 设备累计时长分别累加各设备；去重使用时长合并重叠区间，不代表专注时长。
- 图表可按设备或分类堆叠。周／月的每日趋势可点击进入当天，24 小时分布按所选日期累计。
- 应用排行包含时长、占比和使用片段数，支持搜索、时长／片段排序、展开全部、应用轨迹和个人名称／分类维护。片段数不是拿起次数或启动次数。
- 支持正常时段与异常时段分页查看、设备重命名、数据范围及最近入库时间查看、按当前日期／设备／应用导出 CSV。
- 没有正常使用时段的日期显示暂无记录，不能推断为零使用。日均分母为有正常使用记录的天数。
- 与上一同长周期比较时，当前和前期各设备每天都须有正常记录，且不能存在异常区间；今天及未来的未结束周期不作百分比比较。即使满足这一条件，也不保证系统数据完全同步。

## 事件导入

在「设备与数据 → 导入记录」选择 JSON，预览设备数／事件数并确认。文件最长 20 MB，单次最多 32 台设备、50000 条事件；大批次应拆分。后端只接受当前账户的数据，所有接口沿用 discipline 模块权限，只读用户不能导入或修改元信息。

```json
{
  "version": 1,
  "source": "Biome App.InFocus",
  "devices": [
    {"key": "local", "name": "Mac", "kind": "mac"},
    {"key": "example-phone", "name": "iPhone", "kind": "iphone"}
  ],
  "events": [
    {"device": "example-phone", "time": "2026-11-25T08:00:00.123456+08:00", "app": "com.apple.Notes", "starting": true},
    {"device": "example-phone", "time": "2026-11-25T08:15:00.654321+08:00", "app": "com.apple.Notes", "starting": false}
  ]
}
```

设备 key 必须稳定，由字母、数字、点、下划线或短横线组成；kind 为 mac/iphone/ipad/other。事件时间须为 2001 年至当前时间、包含时区。`starting` 为 JSON 布尔值。事件必须引用同批声明的设备。示例为虚构数据，不代表真实用户记录。

用户＋设备＋精确事件时间＋应用标识＋前台状态组成去重身份，存储使用 UTC 整数微秒。重放不会重复计时。迟到事件会在同一事务中重建受影响设备的派生时段，原始事件长期保留。导入不会覆盖个人设备名称或应用分类，也不会修改每日计划及历史评价。

## 还原与统计规则

同设备按时间排序，退出事件先于同一时刻的进入事件。同应用重复进入不重置开始时间；匹配退出或其他应用进入结束当前片段。无法匹配的退出事件不虚构开始时间。

- 正常片段：闭合，时长 1 秒至 4 小时。
- 系统状态：loginwindow、ScreenSaver.Engine、springboard.stand-by，不计入，包括持续数日的锁屏。
- 异常长片段：非系统应用超过 4 小时，保留供核对，不计正常时长。
- 未闭合：保留开始事件，不用当前时间推测结束；之后导入退出事件可重新还原。
- 极短片段：不足 1 秒，保留派生记录，不计入正常时长。

所有正常时段先按所选范围截取，再按北京时间零点和整点分配，最后聚合。夜间为 23:00—次日 06:00。不在聚合前四舍五入；页面以分钟显示，CSV 保留秒数精度。

应用分类是可调整的初始建议，浏览器默认属于工具，不把总时长自动当作浪费时间。当前仅使用 App.InFocus，不提供通知次数、拿起次数或网站细分，也不声称与系统屏幕时间所有口径一致。

## 实现范围

- `backend/models/discipline_screen.py`：设备、事件、时段、导入批次、个人应用偏好。
- `backend/schemas/discipline_screen.py`：导入及修改参数验证。
- `backend/services/discipline_screen/`：存储、还原、聚合、CSV 与默认应用信息。
- `backend/routers/discipline_screen.py`：路由和依赖注入。
- `frontend-discipline/src/ScreenTime.jsx`、`ScreenCharts.jsx`、`ScreenDetails.jsx`、`screenStats.js`、`ScreenTime.css`：页面、图表、详情和格式化。

## 验收

1. `python3 -m pytest -q backend/tests/test_discipline_screen.py`；覆盖跨日、时区、跨设备重叠、合计守恒、异常、缺数据、导入幂等、迟到重算、用户隔离、只读限制与导出。
2. `npm run build --prefix frontend-discipline`、`python3 scripts/check_router_style.py`、`python3 scripts/check_runtime_boundaries.py`、`bash scripts/check_all.sh`。
3. 使用 `./dev.sh up`，经 portal 或直接访问 `/discipline/screen`，刷新与资源加载正常。导入已解析记录后与原始导出核对昨日累计、设备总计和应用占比。
4. 切换日／周／月、设备、图表分组；点击周／月日期、应用详情、片段分页、搜索、展开更多。URL 刷新、前后退保持筛选；快速切换不显示旧请求结果。
5. 修改名称和分类后刷新保持，重导入不覆盖；CSV 遵循当前日期／设备／应用筛选。异常抽屉标明原始区间及截取区间，锁屏不误当作异常应用。
6. 检查浅色／暗色／水墨／科技、紧凑布局、320/390/1280 像素视口；无横向页面溢出，窄屏抽屉可关闭、分类可操作。空状态有最近日期和导入入口；失败状态可重试。

真实数据保存在数据库和个人工作目录中，不放入源码、测试夹具或前端构建产物。生产发布沿用仓库规定入口 `bash .codex/local/aliyun-prod.sh deploy`，以服务、数据库、页面与静态资源验收结果确认部署完成。

## 每日自动采集验收

- 创建凭证后仅显示一次；列表不包含密钥，撤销后上传失败。采集 Bearer 无法读取统计或其他模块。
- 首次全量上传；同一批次重放新增为0，网络失败保留未确认队列，事件时间早于上次同步的迟到事件仍可入库。
- Mac 安装应用与用户级 LaunchAgent，默认09:30，每日成功后跳过重复触发，登录／唤醒补跑。完全磁盘访问须按实际后台程序身份验证。
- 可读副本的首次上传不能替代真实Biome权限验收；未获得权限时不得宣称自动采集已经工作。
- `python3 -m unittest discover -s clients/macos-screen/tests -v`；`python3 -m pytest -q backend/tests/test_screen_collectors.py`；`bash scripts/check_all.sh`。
