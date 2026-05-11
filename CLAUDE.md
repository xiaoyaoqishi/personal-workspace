# Claude Code Instructions

本项目已有 `AGENTS.md`，其中包含主要开发规范。开始任何分析或修改前，先阅读并遵守 `AGENTS.md`。

工作分工：
- Claude Code 是主 agent，负责需求理解、方案拆解、架构判断、review 和最终汇总。
- 具体代码实现、重构、测试补充、bug 修复，优先调用 `sonnet 4.6 medium`。

规则：
- 不要自动 commit。
- 修改前先说明计划。
- 修改后检查 `git diff` 和 `git status`。
- 涉及架构、API、依赖、安全、部署或模块边界时，先阅读相关 `docs/`。
- 最终回复使用中文，并说明验证结果、README 是否需要更新、剩余风险。