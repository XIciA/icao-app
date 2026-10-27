# 本轮迁移演练恢复入口

本说明仅覆盖 2026-10-27 已成功的 646 演练及本轮脚本修复，不增加长期规则或生产操作授权。执行者仍是统一发布任务，运行来源仍须为干净的最新 `main == origin/main`。

## 正常执行与时间边界

正常模式继续新建备份并完整演练。成功演练完成到正式核验仍限 30 分钟；备份必须不晚于演练完成，备份到演练完成最多 6 小时，备份到本次核验总计最多 6.5 小时。长演练不再因为备份本身超过 30 分钟而必然失败。演练开始的 15 分钟备份门槛、正式 old API drain 后创建新备份的门槛均保持。

两脚本的每次 SSH/SCP（包括清理、恢复证据读取）采用 ConnectTimeout=10、ServerAliveInterval=15、ServerAliveCountMax=3。它限制建连和失联等待，不会因恢复数据库长时间无 stdout 而中断仍响应 SSH 探测的连接，也不宣称能终止健康连接上的任意远端进程挂起。失败后仍核对远端活动和锁，不盲目重复迁移。

## 本轮唯一可复用的成功证据

显式设置：

```sh
ICAO_PRODUCTION_MIGRATION_REUSE_REHEARSAL_EVIDENCE=/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-64678f357635-20261027T034722Z.txt
```

该变量只接受上述文件，不接受任意源、复制到其他路径的文件或宽泛跳过演练。仍使用现有 `ICAO_PRODUCTION_MIGRATION_EXPECTED_PRE_PLAN=55:2:0` 和新 runner 完整 SHA 生成的确认串；可用原 `--print-confirmation` 入口读取准确确认串。

恢复流程：

1. 读取原 root-owned `0600` 成功证据，目录保持 `0700`、拒绝符号链接；核对原 source、计划、校验和、清理、零指纹差异和 schema 合同证据。
2. 646 必须是当前 runner 的祖先。比较归档全部输入的 Git 对象，唯一例外是已审 PR280 的 `services/api/scripts/vocabulary-storage-role-tests.mjs` 从 `d6fdc30447306c06046677c9d01d62f894460bc4` 到 `3e674d452cdddc8f27b3d46234ba4aeb03b2c58f`、且保持 `100644`。其他运行时、迁移、配置、依赖或内容差异一律拒绝，不忽略整个 tests/scripts 目录。
3. 重建原 646 归档，逐字匹配原 SHA256 `8abb78de8c063e7b76aa41d36b436a00f148bacb4408cdd23f55b8e260b51522`；上传前及远端执行前均核对。原成功证据自身摘要、备份摘要和受保护路径再次核对。
4. 在已有发布/迁移锁内，用现有只读计划工具重新核对当前生产账本精确为 `55:2:0`；不接受 drift 或其他计划。生成新的 root-only `reuse-*.txt` 状态证明，明确写 `authority=locked_readonly_ledger_reconfirmation`、原演练完成时间、原证据摘要、旧 payload 和新 runner。新时间是账本重确认时间，绝不冒充又做过一次整库演练。
5. 正式 drain 前要求该只读重确认非未来且不超过 30 分钟；原备份总体时长仍不超过 6.5 小时。之后照常 drain、创建并校验全新权威备份，再执行精确候选迁移及已有验证。状态或来源不符就停止，不通过回写旧时间或绕过新备份来继续。

原迁移制品仅改变过 PR280 的测试文件：API Dockerfile 的运行入口是编译后的 `main.js`，生产构建不执行该 mjs 测试。当前工具仍使用原 646 归档，完全保留其真实 source 和摘要。TestFlight 从包含流程修复的最新主干构建，不回退 App 功能。

## 发布证据字段

- `source_sha` / `runner_source_sha`：执行流程的最新主干 SHA。
- `payload_source_sha` / `running_api_source_sha`：实际 API/迁移归档的原 646 SHA，不能填 runner SHA 假称全树相同。
- `API_RELEASE_ID=production-migration-<runner短SHA>`：本次切换身份标签；它不替代 payload 源码字段。
- `payload_tree_sha256`、`archive_sha256`、`reused_evidence_sha256`：原制品和原证据绑定。
- `reuse_pre_plan_verified_at` / `reuse_state_proof`：新鲜只读状态证明及其路径，原演练时间单独保留。

该文件证明复用前的来源及账本状态，不证明第二次完整恢复或第二轮整库指纹。生产最终效果由统一发布任务的实际执行记录说明。
