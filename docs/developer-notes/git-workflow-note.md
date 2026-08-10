# Git 协作笔记

本文件给人工开发者按需查看，不是 Codex 的自动提交、推送或建 PR 授权。

## 开始前

先确认当前分支和工作区：

```bash
git status
git branch --show-current
```

新任务通常从团队约定的基线创建 `codex/<task-name>` 或仓库当前约定的任务分支。不要假设
一定从 `main` 开始，也不要在存在未理解的本地改动时切换或拉取。

## 提交前

```bash
git status --short
git diff
git diff --check
```

只暂存本次任务文件，优先使用明确路径：

```bash
git add path/to/file another/path
git diff --cached
git commit -m "docs: clarify current workflow"
```

避免不经检查使用 `git add .`。提交信息可使用 `feat:`、`fix:`、`docs:`、`refactor:` 或
`chore:`，重点是准确描述本次结果。

## 推送与 Pull Request

推送、创建 PR、合并和发布都是外部状态变更，应在用户或团队流程明确要求时进行。第一次推送
当前分支通常使用：

```bash
git push -u origin <current-branch>
```

PR 说明应包含结果、关键取舍、验证、未覆盖风险和部署状态。不要把“已提交”写成“已部署”。
