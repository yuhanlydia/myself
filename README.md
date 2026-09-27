# Myself

A local-first memory and planning assistant for macOS.

面向 Mac 的个人记忆与主动安排助手：从获准的数字活动中恢复项目上下文，减少反复登记与解释，并在适当时机提出下一步行动。

## Current status / 当前状态

**Design stage. No runnable application or installer is available yet.**

目前已开始整理第一版设计，方案通过草稿 Pull Request 审阅。功能描述代表目标，不代表已经实现。

## First milestone / 第一阶段

- 明确授权的应用活动记录、暂停和时间线。
- 带来源的项目进展与未完成事项记忆。
- 被打断后的上下文恢复。
- 结合时间约束提出下一步，并支持完成、延后和纠正反馈。

## Data boundary / 数据边界

计划在 Mac 本地处理和保存个人活动。采集默认关闭，内容访问按来源选择。仓库仅存放代码、文档和合成测试数据；运行时数据库、真实浏览记录、凭据与个人文档不进入版本控制。

GitHub 用于开发和后续分发。助手需要安装到 Mac 并获得相应授权才能运行。

## Design review / 设计审阅

See [Pull requests](https://github.com/yuhanlydia/myself/pulls) for the initial design proposal.
