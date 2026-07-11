# Git 开发流程笔记

这份笔记用于团队协作开发。核心原则是：不要直接在 `main` 分支上开发，所有改动都先进入自己的功能分支，再通过 Pull Request 合并到 `main`。

## 一、开始开发前

```bash
git checkout main
```

含义：切换到 `main` 分支。

`main` 是项目的主分支，代表当前稳定版本。开始新任务前，先回到 `main`。

```bash
git pull
```

含义：从 GitHub 拉取最新代码，并合并到当前本地分支。

在 `main` 上执行这个命令，可以确保本地代码和 GitHub 上的最新 `main` 保持一致。

```bash
git checkout -b feature/任务名
```

含义：基于当前分支创建一个新分支，并立即切换过去。

例如：

```bash
git checkout -b feature/vocab-test-ui
```

这表示创建一个名为 `feature/vocab-test-ui` 的功能分支。后续开发都在这个分支上完成，不直接改 `main`。

## 二、开发过程中

```bash
git status
```

含义：查看当前 Git 状态。

它会告诉你：

- 当前在哪个分支
- 哪些文件被修改了
- 哪些文件还没有加入 Git 暂存区
- 是否有文件等待提交

```bash
git diff
```

含义：查看还没有暂存的具体代码改动。

提交前建议看一眼，确认没有误改不相关文件。

## 三、提交代码

```bash
git add .
```

含义：把当前目录下的改动加入暂存区。

暂存区可以理解为“准备提交的文件列表”。`git add .` 会把当前目录下所有新增、修改、删除的文件都加入下一次提交。

如果只想提交某个文件，可以写具体路径：

```bash
git add app/page.tsx
```

```bash
git commit -m "feat: 简要说明"
```

含义：创建一次本地提交。

例如：

```bash
git commit -m "feat: add vocab test entry"
```

提交信息建议使用这些前缀：

- `feat:` 新功能
- `fix:` 修复问题
- `chore:` 配置、依赖、维护类改动
- `docs:` 文档改动
- `refactor:` 重构，不改变功能

## 四、推送分支到 GitHub

```bash
git push -u origin feature/任务名
```

含义：把本地分支推送到 GitHub。

例如：

```bash
git push -u origin feature/vocab-test-ui
```

其中：

- `origin` 表示 GitHub 远程仓库
- `feature/vocab-test-ui` 是要推送的分支名
- `-u` 表示建立本地分支和远程分支的关联

第一次推送新分支时使用 `-u`。之后在这个分支上继续推送，可以直接用：

```bash
git push
```

## 五、创建 Pull Request

推送分支后，到 GitHub 页面创建 Pull Request：

```text
feature/任务名 -> main
```

含义：申请把功能分支的代码合并进 `main`。

PR 中建议写清楚：

- 改了什么
- 为什么改
- 如何测试
- 是否影响线上功能

## 六、合并后的同步

PR 被合并后，所有人都应该同步最新 `main`：

```bash
git checkout main
git pull
```

含义：回到 `main`，并拉取 GitHub 上合并后的最新代码。

如果还要继续新任务，再创建新的分支：

```bash
git checkout -b feature/新的任务名
```

## 七、团队规则

```text
不要直接在 main 上开发
不要直接 push main
每个任务一个 feature 或 fix 分支
所有改动都通过 Pull Request 进入 main
上线和部署由项目负责人确认
```

推荐分支命名：

```text
feature/xxx   新功能
fix/xxx       修 bug
chore/xxx     配置或维护
docs/xxx      文档
```

推荐完整流程：

```bash
git checkout main
git pull
git checkout -b feature/任务名

# 开发代码

git status
git diff
git add .
git commit -m "feat: "
git push -u origin feature/任务名
```

然后在 GitHub 上创建 PR，等待负责人审核后合并。

本地运行命令
pnpm install
pnpm dev