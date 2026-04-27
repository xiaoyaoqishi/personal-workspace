# Backend Structure

本文件用于限制后端结构继续漂移，尤其是 `backend/services/runtime.py` 的职责边界。

## runtime.py 的允许职责

`backend/services/runtime.py` 当前只允许承担以下职责：

- `init_runtime()` 等运行期初始化入口。
- 历史兼容迁移入口，例如补列、兼容旧表、兼容旧鉴权数据。
- 仍未拆出的历史导出函数，在重构完成前作为兼容层保留。

## runtime.py 的禁止事项

- 禁止把新的业务逻辑继续堆进 `backend/services/runtime.py`。
- 禁止在其中新增新的领域规则、复杂查询拼装、写入流程或模块专属 service。
- 禁止把本应进入 router / domain service / dedicated service 的逻辑，再次回灌到 `runtime.py`。

## 新逻辑落点

- `trading` 新业务逻辑进入 `backend/trading/` 下对应 service。
- `ledger` 新业务逻辑进入 `backend/services/ledger/` 下对应 service。
- `notes`、`monitor`、`admin` 等后续新增逻辑，应进入各自 dedicated service，不应新增到 `runtime.py`。
- router 仅负责参数、依赖和转发，不承载业务实现。

## 历史债务说明

- `runtime.py` 当前约 `4502` 行，是明确的历史债务，不代表推荐结构。
- 其中同时存在初始化、兼容迁移和历史业务代码，这种混合状态需要后续单独拆分。
- 后续拆分应单独发起，不要在业务需求顺手继续扩大该文件。
