# ICAO App 文档导航

`docs/` 按“长期规范、开发指南、执行证据、阶段工作记录”分层。新增文档应先确定长期归属，避免再次散落在根目录。

## 常用入口

- [三类题库音频文本统一规范](rules/audio-text/audio-text-unified-rules.md)
- [ICAO 考试规则](product/ICAO考试规则.md)
- [题库学习页数据结构](product/question-bank-study-structure.md)
- [UI 风格规范](design/ui-style-guide.md)
- [常用开发命令](guides/development-command-reference.md)
- [部署与运行规则](operations/deployment-and-runtime-rules.md)

## 目录职责

| 目录 | 内容 | 放置原则 |
| --- | --- | --- |
| `AI-requirement/` | AI 能力、领域知识、评测样本 | 可长期复用的 AI 内容规范 |
| `bigandsmall-workflows/` | 大小流程和阶段启动模板 | 项目执行方法，不放具体任务产物 |
| `design/` | UI、视觉和交互规范 | 稳定设计基准 |
| `execution/` | 正式阶段日志、验收矩阵和证据 | 主路线阶段执行记录 |
| `guides/` | 开发与使用速查 | 面向日常操作的短指南 |
| `handoffs/` | 按日期保存的交接资料 | 历史交接，不作为当前规范入口 |
| `operations/` | 部署、运行、Git 等运维规则 | 环境、发布和协作操作规范 |
| `product/` | 考试规则、题库结构和产品定义 | 稳定业务规则与数据结构说明 |
| `rules/` | 跨功能或专项内容治理规则 | 长期生效、可重复执行的规范 |
| `ui-screenshots/` | Web/RN 视觉标准截图 | 按日期和阶段保存视觉基线 |
| `workstreams/` | 独立任务的需求、快照、报告和验证 | 一个任务一个目录，完成后保留历史证据 |

## 音频文本规则

四份规则统一放在 `rules/audio-text/`：

- [统一规范](rules/audio-text/audio-text-unified-rules.md)：三类题库共性规则和当前暂停 Whisper 的总入口。
- [听力细则](rules/audio-text/listening-audio-text-rules.md)：原文、翻译、选项和答案联动。
- [故事复诵细则](rules/audio-text/storytelling-audio-text-rules.md)：单段格式、粘词和首尾标签治理。
- [陆空通话细则](rules/audio-text/radiotelephony-audio-text-rules.md)：专业术语、通话表达和航空格式。

## 文件放置规则

1. 长期生效的业务规则放入 `product/` 或 `rules/`，例如新增题库文本规范放入 `rules/`。
2. 单次迁移、审计或校准的过程材料放入 `workstreams/<任务名>/`，例如候选报告和源快照。
3. 正式路线阶段的日志和验收证据放入 `execution/`，不与单次工作流报告混放。
4. 日常命令放入 `guides/`，部署和协作规则放入 `operations/`。
5. 根目录只保留本导航文件，不再新增散落文档。

## 当前结构

```text
docs/
├── README.md
├── AI-requirement/          # AI 规则、领域知识与评测样本
├── bigandsmall-workflows/   # 文档驱动开发与编排流程
├── design/                  # UI 与视觉规范
├── execution/               # 主路线阶段日志、验收与证据
├── guides/                  # 日常开发指南
├── handoffs/                # 历史交接文档
├── operations/              # 部署、运行与 Git 规则
├── product/                 # 考试规则与题库产品结构
├── rules/
│   └── audio-text/          # 听力、故事复诵、陆空通话文本规则
├── ui-screenshots/          # 视觉基线截图
└── workstreams/             # 独立迁移、审计和校准记录
```
