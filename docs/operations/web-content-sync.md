# Web 内容同步与发布

状态：当前运维手册
更新时间：2026-07-30

Web 内容由 App 已确认的题库、热点、音频映射和编辑内容生成。不可变 release、manifest 和
checksum 是发布事实；Vercel 同域文件只是经过校验的交付镜像，不能手工成为第二来源。

## 发布前

1. 确认当前任务明确包含 Web 内容预览或生产发布。
2. 记录当前 production deployment、内容 pointer 和可回滚 release。
3. 确认要同步的 App 提交、当前题库 release 及所有生成 manifest。
4. 运行与内容直接相关的完整检查以及 Web 资产、内容和网络边界检查。

版本、资源数量和 pointer 必须从当前 manifest、环境和 production 读取，不从旧 workstream
复制固定数字或 URL。

## 生成候选

先以当前 release 和已复核 pointer 执行 prepare-only：

```bash
pnpm web:content:sync \
  --release-version <current-release-version> \
  --reuse-assets-pointer <reviewed-current-pointer> \
  --prepare-only
```

检查 `.generated/web-content/current-release.json` 中的 release、checksum、资源数量和
`reusedFrom`。确认后再去掉 `--prepare-only` 生成/发布候选 metadata；复用模式不得无理由重发
音频分片。

正式代码导出：

```bash
pnpm web:deploy:export
pnpm check:web:assets
pnpm check:web:content
pnpm check:web:network
```

## Preview 验收

- 仅让 Preview 指向候选内容，先验证邀请码、刷新和核心路由。
- 核对题库 release、manifest、checksum、代表音频/图片、词汇、文章和封面。
- 检查窄屏与宽屏，不让首页预取完整音频或内容目录。
- 确认浏览器没有 ECS/Supabase 请求，客户端包没有服务端 secret。

Preview 通过后，才把同一提交和已验证候选提升到 Production。

## 强制停止

- 命令参数与当前 release 不一致；
- 本地内容、题库或 Web 边界检查失败；
- 远端与本地 manifest/checksum 不一致；
- 分片身份、数量或编号不一致；
- 任一必要 metadata、题库或代表资源不可访问；
- 需要通过跳过校验、静默新建平行分片或回退 ECS 才能继续。

## 回滚

- 代码：Promote 发布前记录的可用 production deployment。
- 内容：恢复发布前记录的 production pointer/release。
- 保留新旧不可变内容项目用于回滚和审计，不用删除资源解决发布失败。
- 回滚后重新验证正式域名的 pointer、关键路由、代表内容和网络边界。
