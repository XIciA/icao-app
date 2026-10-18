# Native 兼容内容发布来源

本目录保存帮助与法律文案的固定结构来源。不是 CMS，也不改变页面、权限或业务流程。

## 来源与当前工单更新

以下文件为固定内容和初始发布输入。OPI 热点与资源文章经后台工单更新后，以服务端最新有效快照为处理基线，不能用旧本地文件覆盖线上增量。编辑、审核和归档遵循 [内容处理规则](../../docs/rules/content-processing.md)；下文导入命令是工具说明，不是另一套日常处理流程。

## 文件式发布输入

- 帮助 Q&A、用户协议、隐私政策、第三方服务清单：`text.json`。
- OPI 热点日期、考点及原题引用：`../question-banks/opi-hotspots.json`。发布与 Native 内置回退均组合这一来源，不维护另一份热点清单。
- 题库：现有题库源及其生成 release。Native 独立导入器只读取 release，保留原题 ID，将媒体路径固定到 checksum。
- 资源文章：现有 editorial release 与发布链路；Native 读取同一文章内容，封面按 checksum 固定。

合同位于 `packages/contracts/src/app-content.ts`。`schemaVersion: 1` 只接受已实现的字段，不包含脚本、页面配置或付费题面。题库和媒体仍使用已有账号与会员权限。

## 文案及热点发布

修改内容后提升 `text.json` 中的整体 `version`、更新 `publishedAt`。法律正文变动还应提升对应文档 `version`；重要变动同时提升 `consentVersion`，并写明 `changeSummary`。普通说明修订可保持 `consentVersion`，不重复要求同意。已经发布的整体版本和法律文档版本都不可改写，回滚只能重新激活原有完整版本。

从仓库根目录运行离线检查或生成可交付文件：

```sh
node services/api/scripts/import-app-content.mjs --validate
node services/api/scripts/import-app-content.mjs --prepare /absolute/output/app-content.json
```

正式发布时由获授权的部署流程提供 `APP_CONTENT_FILE` 和数据库连接，运行同一脚本。它会在一个事务中校验热点全部引用、版本不可变性，然后切换整份内容。先完成数据库迁移 `0043_app_content_releases`。API 对外只提供固定正文和热点元数据；不会公开付费题目。

## Native 题库发布

现有生成物只读输入 `services/api/scripts/import-native-content.mjs`，使用显式 `NATIVE_CONTENT_VERSION`。离线检查示例：

```sh
NATIVE_CONTENT_VERSION=13 RELEASE_DIR=dist/question-bank-release node services/api/scripts/import-native-content.mjs --validate
```

正式导入需要完整 `RESOURCE_ROOT` 以及部署环境的数据库和对象存储配置。首次切换到不可变媒体路径会上传资源对象；重跑验证并复用已存在的相同内容，不覆盖旧字节。上传成功后事务切换五类题库，原题身份保持不变，并验证当前热点引用。发布不得运行或修改冻结的 Vercel 生成、构建、预览或部署链路。

## 客户端与同意记录

- 每次重新进入内容入口获取完整有效版本；正在学习、模考、历史回看的题包不被后台内容替换。
- 网络失败、未知 schema 或 checksum 不符时保留整份有效缓存；没有缓存时使用 App 内置固定文案与热点元数据。无效内容不会部分覆盖。
- 登录前法律正文可读取，公开文案请求不携带账号 token。付费题面仍走已鉴权题库入口。
- 法律同意以服务端接受的精确文档版本为准。客户端按 API 环境和账号保存 receipt 与当时的正文；已有有效 receipt 在断网时可继续使用。首次没有有效 receipt 时，服务端确认成功前不能假定已同意。
- 重要更新由登录与主页面的统一提示承接，保持已有学习不被打断。401/403 等认证错误不以离线 receipt 绕过。
- 学习记录清除保留法律同意；法律 receipt 不接受普通学习同步写入，AI 同意与法律同意分别记录。

此文档说明代码实现和发布输入，不代表已迁移数据库、已发布内容或已完成 TestFlight 验收。
