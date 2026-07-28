# Web Vercel 独立运行技术方案

状态：发布前验收

更新时间：2026-07-28

## 1. 三端关系

```text
共享 Expo 页面 / 组件 / 主题 / 纯业务规则
                 │
        ┌────────┴────────┐
        │                 │
 iOS + Android          Expo Web
 正式 App               体验版
        │                 │
 阿里云 ECS          Vercel Functions
 正式账号/同步        独立邀请码/Cookie
 App 内容服务         Vercel 静态只读镜像
```

原生端继续解析无后缀或 Native 实现；Web 通过 `.web.ts(x)` 替换认证、API、资源、内容仓库和账户页面。共享文件只允许加入 `Platform.OS === 'web'` 的隔离分支，不改变 Native 分支。

## 2. Web 运行拓扑

```text
Browser
├── feizhuicao.com 静态 Expo Web
├── /api/session             独立邀请码 + 签名 Cookie
├── /api/ai/*                Vercel Function → DashScope
├── /api/ai/transcribe       录音 Base64 → Model Studio 临时文件
├── metadata static project
│   ├── web-content/current.json
│   └── releases/<release-id>/{question-bank,vocabulary,editorial}
└── 10 immutable asset projects
    └── question-bank-assets/{audio,images}
```

浏览器不得持有 DashScope 或 Cookie 签名密钥。浏览器把不超过 3 MB 的录音编码为 Base64 发送到同源 Function；Function 取得 Model Studio 临时上传凭证，将录音放入与模型绑定的临时文件区，再以 `oss://` 内部地址调用 Qwen3-ASR。临时文件 48 小时自动过期。

## 3. 内容所有权与同步

唯一内容来源仍为仓库的 App 内容源和现有构建工具：

```text
content/question-banks + vocabulary + editorial
        ↓ build/check
releaseVersion 8 完整发布闭包
        ↓ pnpm web:content:sync
10 个 Vercel 静态资源分片 + 1 个 metadata 项目
        ↓ 发布新的 current.json
Web 自动读取新指针
```

同步命令先运行完整题库、词汇和文章校验，再按资源公开路径的 FNV-1a 哈希分配到 10 个分片。发布 ID 和项目名由 App 题库版本及总 checksum 组成，每个静态项目只承载一个不可变 release。全部资源分片成功后才部署 metadata 指针，因此失败不会暴露半个版本。

首发必须核对：

- 5 个题库、28 个分类、341 个话题、6867 张卡片；
- 6081 个资源文件、约 814.5 MB；
- 5777 个题目音频引用和 23 张题目图片；
- 838 个词汇和当前文章 release。

## 4. 会话与本机数据

- 邀请码只保存在 Vercel 加密环境变量，不进入 Web bundle 或仓库。
- 登录成功生成 30 天有效的 HMAC 签名 HttpOnly、Secure、SameSite=Lax Cookie。
- Web 不启动 Supabase Auth 和 `learning-sync`。
- 学习记录沿用现有 IndexedDB storage adapter；退出登录不删除学习记录。
- 账户页只展示本机记录和体验版边界，不显示云同步、跨设备恢复或完整账号管理。

## 5. AI 与录音

- 文本 AI：Vercel Function 直接请求 DashScope OpenAI-compatible API。
- 转写：浏览器录音 → 同源 Function → Model Studio 48 小时临时文件 → Qwen3-ASR。
- 单个录音源文件最大 3 MB，Function 超时 120 秒。
- 临时文件由 Model Studio 自动过期，不保存长期 AI 历史。
- 首版不保留长期 AI 历史，不实施用户用量额度。

## 6. 发布与回滚

1. 在 Preview 部署完整代码和环境变量。
2. 验证登录、Cookie、内容、音频、AI 和网络目标。
3. 删除 Production/Preview 的旧 ECS/Supabase 公开环境变量。
4. 将验收过的部署提升到 Production，并验证 `feizhuicao.com`。
5. 回滚优先恢复上一 Vercel deployment 或上一静态 release 指针，不把 ECS 作为常规回滚路径。
