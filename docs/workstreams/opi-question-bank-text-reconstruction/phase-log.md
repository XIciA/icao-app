# OPI 题库文本重建阶段日志

状态：阶段 0 已完成；阶段 1 执行中

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
