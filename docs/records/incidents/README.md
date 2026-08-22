# 历史故障与排障记录

本目录保存真实环境中出现过的工程故障、调查证据和当时的处理结果，只用于按症状回溯和辅助
诊断，不是新任务的执行规则。

- Codex 默认不读取本目录；排查相似症状或用户明确指定时再读取对应能力记录。
- 记录中的旧架构、旧命令、旧门禁和未完成事项不能覆盖当前代码或 `docs/rules/`。
- 历史记录可以提供排查线索，但新的诊断仍需以当前实现和当前环境证据为准。

## 能力目录

- [`audio-recording/`](./audio-recording/README.md)：录音、录音文件、回放、音频 session、上传与转写。
- [`ai-learning-runtime/`](./ai-learning-runtime/README.md)：Native 转写、语法纠错、表达润色、AI同意、上游服务与发布验证；不含静态单词解释。
- [`web-content/`](./web-content/README.md)：Web 静态内容、同域交付、浏览器缓存和中国大陆网络可达性。
