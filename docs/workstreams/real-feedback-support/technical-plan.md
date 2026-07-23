# 技术方案

## 数据与接口

- `feedback_tickets` 保存用户、幂等 ID、三类反馈、四值状态、客户端/路由/错误上下文和题目版本关联。
- `feedback_attachments` 保存私有 object key、MIME、大小、SHA-256、到期与删除时间。
- `POST /v1/feedback` 使用 `payload` JSON 字段和 0–3 个 `images` 文件。
- 用户与 `clientSubmissionId` 唯一；重复请求返回原工单。
- 每用户每小时最多 10 条；服务端校验字数、数量、大小、MIME、扩展名和文件特征。
- 图片全部上传成功后才写事务；数据库失败立即补偿删除。

## 客户端

- Web 与原生使用平台上传适配器；Web 对 picker 返回结果再次截断。
- 自动附带展示版本、平台、系统、无 query 的来源路由，以及十分钟内最近一次结构化 API 错误。
- 学习入口先完成回答自动保存，暂停当前音频与录音预览，再 push 反馈页；返回时原学习页仍在栈内。

## 验证

- 契约、Schema、图片文件特征、UA、鉴权、表单默认值、图片增删、提交编号。
- `pnpm check`、Web production export、iOS/Android Development Build。
- 生产数据库备份和隔离恢复后只执行反馈迁移；API 从明确文件集构建并验证健康、无图和三图提交。
