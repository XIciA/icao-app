# OPI 题库文本重建阶段日志

状态：阶段 0、阶段 1 已完成；阶段 2 执行中

更新时间：2026-07-17

## 阶段 0：原始基线冻结

- 直接基于 `main` 的原始 OPI 维护源重新开始，不使用其他分支的题库文本、脚本或审计产物。
- 基线为 8 个分类、144 个话题、1356 张卡，其中 1333 张文本卡、23 张纯图片卡。
- 图片话题包含 64 张仍需完成双语问题清洗的文本卡。
- 原始数据有 20 张文本卡缺少独立中文问题，1269 张文本卡缺少独立中文答案字段。
- 新建 `tools/opi-rebuild.mjs`，完成只读审计、153 个源文件冻结、1333 个逐卡工作项生成和冻结完整性校验。
- 冻结摘要：`81ff4e8d16582b5bfd3a2e6b4cf08f6f6eb89159be2b6b93f4c0e3370aea7d42`。

验证：

```text
node --check tools/opi-rebuild.mjs
node tools/opi-rebuild.mjs audit
node tools/opi-rebuild.mjs freeze
node tools/opi-rebuild.mjs verify-baseline
```

结果：全部通过，可以进入英文问题重建阶段。

## 阶段 1：英文问题与结构

- 1333 张原始文本卡全部完成英文问题处理和结构决策。
- 39 个能够脱离上下文独立回答的附加问题拆分为派生卡；`Yes/No + Why` 和指代性追问保留在同一卡片。
- 4 张同话题完全重复问题合并，最终形成 1368 张有效英文问题。
- 修复编号残留、全角标点、异常换行、斜杠备选、错误连字符、缩略词问题和明显语法残片。
- 图片话题中的 64 张文本问题全部纳入本阶段，没有因图片答案延期而跳过。
- 所有结果仍只存在于冻结工作项，尚未写回正式维护源。

验证：

```text
node tools/opi-rebuild.mjs verify-baseline
node tools/opi-rebuild.mjs draft-question-en
node tools/opi-rebuild.mjs verify-question-en
```

结果：1368 张有效英文问题通过非空、语言纯度、结尾标点、稳定目标 ID、同话题完全重复和锁定校验，可以进入中文问题重译阶段。
