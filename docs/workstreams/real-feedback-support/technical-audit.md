# 技术审计

## 复用

- 鉴权：复用 `RequireAuthGuard`、当前 Auth token 获取和 401 恢复流程。
- 题目：只传递现有 question-bank ID；服务端从活动 `question_bank_releases` 校验并保存版本和 checksum，不复制题库。
- 播放：学习页复用现有题目播放器、录音预览的 pause request；没有新增音频会话所有者。
- 版本：复用 `APP_DISPLAY_VERSION`。
- 错误：`ApiClientError` 在保持 `Error.message === code` 兼容性的同时保存 `code/requestId/status`。

## 新边界

反馈截图不复用 ASR 临时音频存储。`FeedbackAttachmentStorage` 只拥有
`feedback-screenshots/feedback/*`，原因是反馈图片需要一年保留、账号级清理和独立 MIME
策略；ASR 对象是短期转写输入，生命周期与所有权不同。

## 发布隔离

工作区同时存在邀请码和编辑内容等未提交改动。反馈迁移被排在尚未执行的这些迁移之前；
生产迁移和 API 部署必须从 ECS 当前源码加反馈明确文件集构建，不能直接打包整个工作区。
