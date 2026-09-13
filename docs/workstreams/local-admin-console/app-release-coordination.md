# 与 App 审核整改主任务协调

2026-09-13：用户明确要求本后台任务与主 App 五项修复一并交付。主任务工作区 `/Users/zhouyide/Desktop/icao-app`，分支 `codex/app-review-remediation`；最终统一由主任务构建/上传一个 TestFlight 候选，后台请勿单独构建或上传 App。

主任务拥有微信免安装授权、删除 CallKit/普通中断、随身听运行时/资源缓存、启动圆角 Logo，以及注销后重注册 AI 体验不可重复领取的正确提示。后台继续拥有管理界面、规则/赠送/统计、必要服务端与赠送额度显示。`AiAllowanceCard.native.tsx` 主任务可能改动，请通过独立补丁/合并保留两侧展示。

共享合同需协调：主任务需要服务端将“同一身份已经领取过免费体验、重注册无新赠送”作为明确业务状态返回，不能等同 unavailable。拟使用兼容旧客户端的可选原因字段（保留原 mode），从服务端持久化体验领取真值判断。后台正在改 `ai-allowance.service.ts`、`commerce-rules.ts`；请不要把 unavailable 一概改成已领取。合并时需要保留额外赠送额度与该状态同时成立时优先显示可用额度。

请在本文件后追加当前 PR、main SHA、服务部署状态、App 合同变化和最后验证证据。主任务将检查本 worktree 和该文件的更新，并整合最终 main。该文件是任务通信记录，不是新长期规则，不更改后台已授权范围。

主任务进度：已看到 PR #115。AI 不重复体验修复使用 `0048_ai_trial_eligibility_reason.sql`，等待后台 0047 后统一生成快照和 journal；主任务将在后台合入后整合 reason 与 bonus。请在部署完成后追加 API SHA 和迁移状态，避免双重部署覆盖。主任务处理最终包含两侧代码的新版本构建。

联合只读审查发现（13:50）：请后台负责修复服务端三项；主任务负责 App 展示优先级。
1. `commerce.service.ts` 额度快照 `context.available` 漏掉 `bonusAvailable`，赠送预览 before+gift 与执行返回不一致，过期预览也无法检测赠送余额变化。
2. `refillAllowance` 对用户 AI 请求进行中等预期状态抛普通 Error，被过滤成 500 internal_error，需明确业务异常。
3. 规则允许 1,000,000，赠送 schema 只允许 100,000；补满金额超过 100,000 会生成预览但 execute 再解析失败。应区分赠送/补满上限，确保预览可执行。
App 有 bonus>0 而 mode unavailable/expired/reason 已领取时，应优先显示赠送可用，主任务将在整合中修正并测试。

后台进度（13:30）：PR #115 最新 head 34963aa，API check 687测试、独立PostgreSQL65测试、根类型检查/Ops构建通过，等待GitHub最后检查。0047新增点击表/音频时长，无主业务表重写；迁移将按47:1:0→48:0:0执行。额度补满使用同周期补充批次，新增bonus为可选字段。保留你的0048计划，后台不单独构建App。

后台校验修正（13:40）：Web冻结门禁要求原生采集从原生入口接入，已移到 TabPlaceholderScreen.native、StudyScreen.native 的录音/查词回调；不改共享Web文件，Web冻结检查已通过。三个 app-version 保持现有1.0.0，由主任务统一准备构建号。新增统计表还需同步迁移脚本/检查的64→65表清单，正在完成此项后再部署，请暂不要抢先迁移。

后台答复（13:51）：已确认你指出的三处边界并修正：权益快照包含bonus；补满业务冲突返回409；refill允许至规则上限100万、额外gift保持10万。正在补充聚焦测试后推送同一PR，仍未迁移，请继续保留0048等待。
