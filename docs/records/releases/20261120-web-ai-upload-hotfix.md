# 2026-11-20 网页 AI 录音上传最小修复

## 正式交付

- 用户授权：仅修复网页 AI 评分故障并上线，保持其他功能；会员与学习记录问题不在本次范围。
- 源码：[PR #369](https://github.com/XIciA/icao-app/pull/369)，干净 `main / origin/main` 提交 `e63998d2c027204fe060436e5c4cbd430239eebc`。
- 平台：EdgeOne Production / `readyoufife.com`；deployment `dpdm3apqhtfg`。
- 版本保持 1.3.2；annotated tag：`release/web-edgeone/20261120-e63998d2`。
- 2026-11-20 15:39（北京时间）公网核验通过；真实用户设备上的录音评分仍待用户验收。
- 回滚目标：上一 deployment `dpq5dl5b2k7g`，标签 `release/web-edgeone/20261113-89d46fd2`。

## 最小变更

1. Web 音频适配器按共享合同接收所选 ASR 模型，并在音频之前写入 multipart `model` 字段；保留音频内容、文件命名和传输方式。
2. 将 `invalid_asr_model` 映射为配置异常与提交诊断提示，避免误导用户反复检查网络。
3. AI 诊断入口携带题库、分类、话题、原始题目和版本摘要；没有题目来源时使用通用反馈入口，保留诊断编号和来源页面。

没有修改或部署 API、数据库、会员、学习记录持久化、录音引擎、纯文字评分接口、依赖、iOS 或 Android 安装包。新增的两处共享 AI 展示逻辑本次仅随 Web 发布。

## 验证证据与边界

- 冻结仓库依赖后 `pnpm check` 完整通过；媒体检查使用本机已验证媒体缓存。客户端 288 套 / 2,049 项测试通过；API 837 项通过、3 项既有跳过。新增的录音上传、异常提示与诊断入口回归已包含其中。
- [GitHub CI](https://github.com/XIciA/icao-app/actions/runs/44695352044) 的数据库约束、完整源码检查、contracts 和 EdgeOne 导出通过。
- 导出 190 文件 / 39.6 MiB；候选与主干正式重建的入口脚本一致。与原线上包相比，两者均含 1,941 个模块，仅上传适配器、AI 错误提示和学习工作台三个模块不同。
- 用实际导出适配器生成 multipart 请求，经线上容器中独立实例的 Fastify 解析器与已部署 controller 验证：WebM / Ogg / MP4 / WAV × 转写 / ATC / story / OPI 共 16 项通过；使用 provider stub，无真实 AI 调用或业务数据写入。
- 已部署反馈 schema 拒绝旧缺题目信息的学习诊断；修复后的题目诊断和无题目来源的通用诊断均通过校验。
- 公网 `/`、`/download`、`/auth` 返回 200 且引用新脚本；脚本与正式产物逐字节一致，SHA-256 `0dd09000e75c67fba9aacb504d7acc16bbc4c3cd7022b9929ad9f87aad2453c3`。Chrome 实际打开首页并确认加载新脚本。
- 课程 JSON 发布前后摘要一致；API 版本仍为 `ai-output-20261113-bd9b8988`，API / 数据库健康正常，AI 跨域预检 204。
- 以上证明已确认的上传漏参与诊断合同缺陷已修复，不代替用户麦克风录音到真实 AI 返回的完整验收；未将截图那次缺少关联请求的失败断言为唯一根因。

本机详细检查、模块比对、生产产物与发布结果保存在 `/Users/zhouyide/.codex/artifacts/web-ai-hotfix-20261120/`；私有发布日志不入库。
