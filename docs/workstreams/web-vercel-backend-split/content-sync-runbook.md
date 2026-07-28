# Web 内容跟随 App 操作手册

## 单一来源

- App 已确认的提交是题库、热点、音频映射和文本的唯一真实来源。
- Web 分支只合并明确 App 提交并生成不可变镜像，不手工编辑发布 JSON。
- 当前 Web 目标为题库 `releaseVersion 10`、16 条 OPI 热点和听力中文选项。

## 标准流程

1. 记录当前 Web Production deployment 和内容 pointer。
2. 在 Web 分支合并明确的 App 基准提交。
3. 运行热点、题库和网络边界检查。
4. 生成候选内容：

```bash
pnpm web:content:sync \
  --release-version 10 \
  --reuse-assets-pointer https://feizhuicao-v8-7cf2feb2-content.vercel.app/web-content/current.json \
  --prepare-only
```

5. 检查 `.generated/web-content/current-release.json` 中的 release、checksum、资源数量和 `reusedFrom`。
6. 去掉 `--prepare-only` 发布新的不可变 metadata 项目。复用模式不重新部署音频分片。
7. 仅把 Preview 环境指向候选 release，部署并完成浏览器验收。
8. Preview 全部通过后更新 Production 环境并从同一提交部署。

代码部署使用 Git build。`pnpm web:deploy:export` 会在 Expo 导出后读取当前环境 pointer，把已发布的十个资源分片逐文件校验并物化为 `dist/question-bank-assets`。该步骤只生成同域交付镜像，不修改内容 release、资源 manifest 或 App 资源来源。Preview 必须核对 `/question-bank-assets/release.json` 的 release、6081 个文件和总字节数，并确认首页没有预取完整音频目录。

## 强制失败条件

- App releaseVersion 与命令参数不一致。
- 本地完整题库检查失败。
- 远端与本地资源 manifest SHA-256 不一致。
- 分片数量、编号或分片身份不一致。
- 任一 metadata、题库或代表资源请求失败。

不得用跳过校验、静默改用新分片或回退 ECS 的方式继续。

## 回滚

- 代码：重新 Promote 发布前记录的 Production deployment。
- 内容：恢复发布前的 Production 内容环境；当前回滚 release 为 `app-qb-v8-7cf2feb27846afb2`。
- 新旧不可变内容项目均保留，不删除资源。
