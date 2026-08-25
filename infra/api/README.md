# ICAO API 部署

- 镜像从仓库根目录构建，使用固定 Node/pnpm 版本。
- ECS 环境文件位于 `/opt/icao/runtime/api/.env`，不进入 Git。
- 容器加入 `supabase_default` 内部网络访问数据库和 Kong，API 只映射到宿主机 `127.0.0.1:3101`。
- 数据库 Migration 必须在 API 启动前执行；不得通过 Studio 手工建表。

## 内容离线凭证签名密钥

1. 在仓库外选择绝对路径；叶子目录必须是当前用户所有且权限为 `0700`。生成工具只会创建一级
   不存在的叶子目录，不会修改已有目录权限，也拒绝相对路径、Git 仓库内路径、符号链接和已存在文件。
2. 运行下列命令。工具把 PKCS#8 Ed25519 私钥写为 `0600` 文件，标准输出只包含对应的 32 字节公钥
   Base64；不得把私钥或命令输出重定向回仓库。

   ```sh
   node tools/content-credential-signing-key.mjs generate \
     --private-key-path /absolute/protected/path/content-credential-ed25519.pem
   ```

3. 只把上一步的公钥更新到 `packages/contracts/src/index.ts` 的
   `CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64`，通过任务分支、检查和 PR 进入 `origin/main`；私钥继续只
   保存在仓库外的受保护路径，不手工复制进仓库、发布归档或远端环境文件。
4. 在与候选源码相同的干净主线上验证仓库外私钥；缺失、权限过宽、非 Ed25519、符号链接或公私钥
   不匹配都会失败关闭：

   ```sh
   node tools/content-credential-signing-key.mjs verify \
     --private-key-path /absolute/protected/path/content-credential-ed25519.pem
   ```

5. `scripts/deploy-api-release.sh` 要求通过
   `ICAO_CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY_PATH` 显式提供同一路径，并在任何生产网络读取前执行
   本地匹配校验。部署只把文件内容传到本次发布独有、锁保护的远端 `0700` 临时目录和 `0600` 文件，
   不把私钥内容放入命令参数、标准输出或源码归档；远端会再次拒绝符号链接、异常所有者和异常权限。
6. 候选镜像使用包含新私钥的临时 `0600` 环境文件完成配置预检和只读 Migration 检查。两者都成功
   后，部署才以 `0600` 字节一致备份原环境文件并原子替换；任一切流前失败都保持原环境文件字节不变，
   切流后到最终成功标记前的任一失败都会恢复并验证旧镜像、环境、Compose 和源码目录。成功或失败均
   删除上传文件和候选环境临时文件；回滚或清理无法验证时发布失败关闭并要求人工处置。

这套单公钥流程用于 1.0.0 首次生产启用。正式客户端发布后的再次轮换必须先设计兼容旧客户端的
多公钥/Key ID 过渡，不得直接替换常量和服务端私钥。
