# OPI 题库文本梳理与重建收口

状态：文本候选完成，环境验收待项目负责人接续

收口日期：2026-07-17

执行分支：`codex/opi-text-reconstruction-content`

## 1. 本次完成内容

- 完成阶段 0 至阶段 4 的四字段文本生产和锁定。
- 完成阶段 5 中不依赖 App 环境的稳定 ID、审计映射、数量同步和 OPI 权威维护源候选写回。
- 生成 OPI 专用处理工具和以下正式产物：
  - `artifacts/final-card-decisions.json`
  - `artifacts/card-target-mapping.json`
  - `artifacts/final-quality-report.json`
- 原始 1356 张卡整理为最终 1353 张卡：1330 张文本卡、23 张纯图片卡。
- 合并 3 张同话题完全重复文本卡；没有执行高风险拆分、移动或删除。

## 2. 图片答案延期

以下问题的中英文问题已完成，但答案必须依赖具体图片细节，因此保持为空：

- `opi-image-002-q01`
- `opi-image-008-q01`
- `opi-image-011-q01`
- `opi-image-012-q01`
- `opi-image-018-q01`
- `opi-image-021-q01`
- `opi-image-023-q01`

延期原因和目标话题已写入正式质量报告。

## 3. 航空事实与后续复核

- 48 个涉及机型、运营人、机场或监管体系差异的事项已使用通用安全表述，并保留在事实复核清单中。
- 重要事实卡记录了 ICAO、EASA 和 FAA 一手资料；具体来源随逐卡记录保存在正式审计产物中。
- 没有无法继续推进的关键 ID 或航空事实冲突；`criticalUnresolved` 为 0。

## 4. 已跳过的环境验收

以下命令未执行：

```text
pnpm content:build
pnpm content:check
pnpm content:check:full
pnpm check
pnpm ios:*
pnpm android:*
```

跳过原因：缺少完整题库资源和 App 工程依赖，已交由项目负责人接续

以上项目不得视为验证通过。

## 5. 项目负责人接续清单

1. 审查本分支提交、逐卡决策、目标映射、质量报告和 7 张图片答案延期项。
2. 如存在旧 OPI 学习进度、笔记或高亮，按 OPI 范围清理，不开发迁移兼容。
3. 更新 `content/question-banks/registry.json` 的正式 release version 和 `releasedAt`。
4. 在完整资源环境运行 `pnpm content:build`、`pnpm content:check:full` 和 `pnpm check`。
5. 在 iOS 和 Android 验收代表性短题、长答案、合并题、个人示范回答和图片话题文本题。
6. 根据完整环境验收结果更新最终 App 显示版本并完成正式阶段 6 收口。
7. 只有在另行确认上线后，才执行 ECS 导入、健康检查和线上代表性请求验证。

## 6. 回滚

文本处理工具在本地忽略目录保存了冻结快照，并提供 `rollback` 命令。Git 层面的正式回滚应以本分支提交为单位进行，不修改或复用已经退役的 card ID。
