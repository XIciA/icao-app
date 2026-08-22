# OPI 参考答案补全与双语正式版最终质量报告

## 锁定结果

- 问题锁：`6a1b20f3cdeb9438115675cbc1a196b7df41e83e1d1e9b84881c4588c1b13e93`
- 英文锁：`ad2519fefd4374f6080b7594f544a533c3e9301e8525a687d20fede9d4e92f9a`
- 双语锁：`64f583c1d3f587c2bf0afe7e07c9ee3ee889b4895072c366a73d56a3ce3e7686`
- 正式源 digest：`35040cff9acbcb44c948df9e5aabddf339f3eb73658c9659ea421dbcb1148a44`

## 数量

- 分类：8
- 话题：144
- 总卡片：1090
- 文本卡：1067
- 纯图片卡：23
- 英文答案：1067
- 中文答案：1067
- 已补齐历史空缺：168
- 来源不足：0
- 图片延期：0

## 文本复核

- 168 份新增英文答案完成独立 Codex 全量只读复核，所有问题由主 Codex 裁决关闭。
- 中文答案完成 300 张分层抽检；19 项发现均已关闭。
- 8 个达到升级阈值的批次完成全量复核，共覆盖 432 张，新增 29 项发现均已关闭。
- 合计修复 48 项中文准确性、自然度或问答对应问题；13 个受影响批次重新验证并封存。
- 最终数字对应报警：0。
- 独立复核上下文没有直接写入生产文本。

## 结构与工程门禁

- 问题、ID、话题、排序和数量锁：通过。
- 英中答案完整性、语言边界、格式、异常换行和 hash：通过。
- `verify-answer-completion-formal`、`pnpm content:build`、`pnpm content:check:full`、`pnpm check`：通过。
- App：63 个测试套件、281 个测试通过。
- API：8 个测试文件、230 个测试通过。
- Android 和 iOS 模拟器按用户最新决定不在本轮验收范围；iOS 真机由用户发布后自行验收。

## 回滚

- 本地应用快照：`.generated/opi-answer-completion/snapshot`
- 本地回滚命令：`node tools/opi-rebuild.mjs rollback-answer-completion`
- 生产发布前必须另行保留活动 OPI v9 内容导出和 PostgreSQL 备份，并完成隔离恢复验证。
