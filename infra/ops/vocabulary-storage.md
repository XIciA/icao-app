# 词库录音受限上传凭据

本文件是本轮词库发布的操作材料，不授予生产操作权限。统一发布任务执行；不得从任务分支直接上线。SQL 不属于应用 migration，不会由启动、构建、部署脚本自动执行。

## 2026-10-27 生产只读核对

- Storage 使用 `supabase_storage_admin` 连接；该角色为 `NOINHERIT NOBYPASSRLS`，拥有 `storage.objects/buckets`，两表 RLS 已开启，当时无 policy。
- `supabase_storage_admin` 是 `authenticator` 的成员。后者已有 `anon/authenticated/service_role` 成员关系。新角色不继承这些角色，Storage 必须按请求 `SET ROLE`。
- 三个 schema `public/storage/auth` 当时无 PUBLIC 表级授权，`public/auth` 无 PUBLIC 可执行的 SECURITY DEFINER 函数。
- 实际 Kong `storage-v1` 无 `key-auth`，透传已有 Authorization JWT，与固定上游 `1ce1fd66643c90f9f51f72e59220bb59664ee535` 一致。不需要把受限 JWT 注册成全权限 API key。
- 此次核对未读取签名根密钥，未创建角色、policy、token 或资源。执行时仍须重新检查；以上是时点事实。

后续执行中的更正：首次盘点仅覆盖上述三个 schema，未覆盖 `extensions/net`。全 schema 只读核对发现 `extensions.pg_stat_statements/pg_stat_statements_info` 有既存 PUBLIC SELECT，但词库角色无 extensions USAGE，当前不能直接访问；`net.http_request_queue/_http_response` 则有 PUBLIC ALL、PUBLIC schema USAGE，且无 RLS，含请求头/正文及响应内容结构，属于实际敏感能力，必须阻止签发 token。不得通过忽略整个 extensions/net 或撤销全局 PUBLIC 表授权来消除报错。

完整元数据盘点入口为 `audit-vocabulary-storage-access.sql`，输出全 schema 表/序列/函数授权、PUBLIC 来源及 schema 可达性，不读取请求响应数据、SQL 查询文本、环境变量或密钥。

## 配置和校验

在本轮已批准、干净的 `main == origin/main` 发布来源中，通过现有私有数据库连接，**以已有的 `supabase_admin` 超级用户角色**执行。生产 `postgres` 不是超级用户，虽然具有 CREATEROLE，PG17 会自动为创建者添加 ADMIN TRUE/INHERIT FALSE/SET FALSE 成员关系，与本工具严格成员边界不符。配置在修改前明确拒绝非超级用户，不临时提升 postgres，也不放宽成员检查。超级用户身份只用于这次配置，不用于 Ops 常驻 JWT。

```sh
psql -X -v ON_ERROR_STOP=1 -f infra/ops/vocabulary-storage-role.sql
psql -X -v ON_ERROR_STOP=1 -f infra/ops/verify-vocabulary-storage-role.sql
```

不要在参数中写密码。沿用私有环境、PGPASSFILE 或既有容器内 psql 连接，不输出它们。

配置 SQL 仅创建/维护 `ops_vocabulary_storage`：NOLOGIN、NOINHERIT、NOBYPASSRLS；只允许 Storage 认证连接切换到该角色。授予 `storage.objects` SELECT/INSERT 和 `storage.buckets` SELECT。RLS 将对象限于：

```text
question-bank-assets/vocabulary/<文本SHA256>-<音频SHA256>.mp3
```

只允许读取指定桶。不给覆盖、删除、建桶或业务表权限；restrictive policy 防止其他宽泛 PUBLIC policy 放大范围。同名角色属性、成员关系或业务权限不符时失败回滚，不自动清理其他权限。重复执行只替换这九条命名 policy，不影响既有角色的 policy。只读验证同时检查角色、有效权限、policy 定义和实际可见范围；不上传、修改或删除对象。若 PUBLIC 权限或其他系统变化使校验失败，先查原因，不能跳过检查。

验证器按每个对象的 ACL 来源及 schema USAGE 判断权限：没有 USAGE、仅从 PUBLIC 获得的 ACL 会作为 dormant 通知输出；直接授给词库角色的额外权限、可访问的额外表/序列及网络函数仍拒绝。不会按 schema 名通配忽略扩展。SQL 标准函数体可能预绑定对象 OID，从而绕过后续的 schema 名称查找，因此验证器还递归检查可执行函数依赖中的额外关系、网络函数和 SECURITY DEFINER 入口。PG17 回归已复现并拦截该路径。新增函数/扩展 DDL 后须重新验证；此工具不是对任意动态 C 扩展代码的形式化安全证明。

## 可选的 net PUBLIC USAGE 收紧

`narrow-vocabulary-net-public-usage.sql` 是**另外需要明确批准的系统 ACL 操作**，不由配置、迁移或部署自动执行。当前生产验证仍受 net 权限阻塞，不能仅修验证器后签发 token。

该 SQL 只执行 `REVOKE USAGE ON SCHEMA net FROM PUBLIC`，不改变任何表/序列/函数 ACL、RLS、数据或已有显式 schema 授权，不创建新授权。它预先要求 postgres、anon、authenticated、service_role、supabase_functions_admin 已有显式 USAGE，并在事务内确认这些角色及 owner supabase_admin 的访问保留，词库角色不再有 net USAGE；条件不符回滚。执行前记录现有 ACL，执行后跑完整只读验证及批准的服务验证，再考虑签发 JWT。此一项差异的回滚是重新 GRANT USAGE TO PUBLIC，须按实际授权执行。

兼容性只读证据：API/Ops 使用 postgres；PostgREST 仅暴露 public、graphql_public；仓库业务源码未检出 pg_net 调用。实际 pg_net worker 使用 supabase_admin。catalog 中引用 net 的函数为扩展授权 event trigger 和私有 `supabase_functions.http_request()`，后者 SECURITY DEFINER、owner 为已有显式 USAGE 的 supabase_functions_admin，词库角色不能执行它，也没有挂载它的用户触发器。Storage 现有四个触发器不引用 net。已安装 pg_net 0.20.3 的授权 event trigger 仅在 CREATE EXTENSION 时工作，保留五个显式角色；后续扩展重装/更新后需重新验证。

范围和限制：所有仅靠 PUBLIC USAGE 的其他角色会失去直接查找 net 对象的能力；不因为其当前能查找就盲目补 grant。现有五个显式角色和 owner 的权限在 PG17 本地生产式 fixture 中保留，已检查的 App/后台路径不依赖新词库上传 token。外部脚本、被淘汰的历史语句和未来动态调用不能由静态盘点全部证明不存在（生产统计已发生 deallocation）；因此系统 ACL 改动须明确按这个范围获批，真实服务行为仍由统一发布任务验证。测试中的 pg_net 接口是无网络副作用的 ACL fixture，不假称已对生产 pg_net 发起真实网络请求。

App 词库读取/学习及既有音频播放不依赖 Ops 写 token；缺失只让后台新增 MP3 上传返回 `vocabulary_audio_upload_unconfigured`。本次 126 项初始资源走原维护发布流程，测试 App 的交付不需要等待该新增上传能力完成验收。

## 受限 JWT 签发

在服务器私有签发环境中，用 Storage **当前仍信任的 HS256 根密钥**仅注入本次签发进程的 `VOCABULARY_STORAGE_JWT_SECRET`。本机测试只用假密钥；仓库不包含生产密钥读取器，也不轮换全局 JWT 密钥。若生产已不接受 HS256，停止使用此工具，按当前签名机制准备兼容实现，不改回 service_role。

```sh
node services/api/scripts/mint-vocabulary-storage-token.mjs \
  --output /root/.config/icao-vocabulary/token.next \
  --ttl-hours 720
```

输出目录事先由运维建立为当前用户所有的真实目录、权限 `0700`。输出文件必须不存在，且不在 checkout 内；脚本写入 `0600`，只输出角色和到期时间。签发根密钥、token、路径不会输出。不要把生产密钥写在命令行、历史或日志里，不使用 `set -x`。签发工具只生成本地文件，不连接服务器、改 SQL 或修改 Ops 环境。

通过既有服务器私有配置流程，将**签发后的 JWT**写入 `/opt/icao/runtime/ops-api/.env` 中唯一的 `OPS_VOCABULARY_STORAGE_WRITE_TOKEN`。该文件保持 root 所有、`0600`；根签名密钥不能进入 Ops 环境。复用现有 `OPS_FEEDBACK_STORAGE_URL`；试听仍由既有 `OPS_FEEDBACK_STORAGE_READ_TOKEN` 负责。保持 env 白名单和无重复键，不新增 `SUPABASE_SECRET_KEY`。

记录到期时间，提前通过相同服务器流程轮换 JWT 并更新/重启 Ops；这不需要更新 App。默认示例为 30 天，可指定 1–2160 小时。工具不创建定时任务。上线交接必须明确轮换负责人和下一次时间，不能把有限期 token 描述成永久凭据。需紧急撤销时可撤销此专用角色的 Storage 表权限，或从 `authenticator` 撤销该角色；只改该专用角色，不轮换全局签名密钥或影响普通用户角色。重新开启需重新执行配置并完整验证。

## 最终环境验证

1. 运行只读 SQL，得到 `vocabulary_storage_role_verified_read_only`；确认实际 Storage 请求使用上述角色。
2. 以真实 Ops 管理员，选用本轮已批准的实际录音，通过词库页面上传并试听；确认新对象下载的字节数、SHA256 与上传文件一致，资源登记 ready 且生成审计。不要造测试垃圾对象，也不要覆盖历史录音。
3. 确认上传新对象成功、同 key 不可覆盖；普通 App 用户不能直接上传。其他目录/桶、删除/覆盖/建桶的拒绝已在独立临时 PostgreSQL 中验证，生产若要 HTTP 复验只能使用已批准的对象和范围，不能对用户对象发起破坏性探测。
4. 未配置或过期 token 时上传明确失败，不能回退使用只读 token 或 service_role。页面发布仍须通过词库版本、媒体完整性和审计检查。

这些动作不由配置脚本自动执行。SQL 验证通过不代表 Storage HTTP 或真实 Ops 页面已经验收。

## 与本次 126 个资源的区别

本次增量清单的 126 项对象键全部是 `pronunciations/<SHA256>.mp3`，总计 2,270,952 字节。它们由既有 `stage-content-resources.mjs` 的维护发布流程处理，不能用上述只允许 `vocabulary/` 的日常 Ops token 替代。

维护脚本从已有 API 服务器私有环境取得 `DATABASE_URL/SUPABASE_URL/SUPABASE_SECRET_KEY`，并写入 `resource_objects`、取得 `app_content_publish` 事务锁。service key 绕过 Storage RLS，只用于本次已授权资源发布，不成为 Ops 常驻凭据。先本地 `--validate`，再上传并登记；之后按清单下载逐字节/摘要复验及 DB ready 检查。`stage_complete` 本身不证明新上传的对象已被重新下载校验。

## 本地确定性检查

```sh
VOCABULARY_TEST_PG_BIN=/path/to/postgresql17/bin \
node --test services/api/scripts/vocabulary-storage-role-tests.mjs \
  services/api/scripts/mint-vocabulary-storage-token-tests.mjs
```

SQL 测试要求 PostgreSQL 17，启动独立临时集群并安装真实 pg_stat_statements；pg_net 使用同等 PUBLIC ACL、表/序列权限的无网络 fixture。覆盖幂等、Storage 连接角色切换、正确键写入、跨桶/目录拒绝、不可覆盖/删除、普通角色隔离、宽 PUBLIC policy 抵御、异常角色/SECURITY DEFINER/被篡改 policy 拒绝、CREATEROLE 自动成员、扩展只读误报、敏感 net 阻塞、可选收紧及恢复、既有调用角色保留、OID 绑定多层函数旁路和审计元数据。结束后删除临时集群。签发测试仅用固定假密钥，检查签名、角色、到期范围、私有排他写入和无敏感日志。

参考：[Storage Custom Roles](https://supabase.com/docs/guides/storage/schema/custom-roles)、[Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)、[PG17 Role Attributes](https://www.postgresql.org/docs/17/role-attributes.html)、[PG17 pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html)。
