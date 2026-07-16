# OPI 题库文本梳理与重建交接文档

状态：已授权交接，待同事开始

更新时间：2026-07-17

## 1. 文档定位

本文是本工作流的第五份大流程文档，用于把 OPI 题库文本重建的小流程交给一位使用全新电脑的同事执行。

同事负责完成可脱离 App、原生开发环境和线上运行环境的文本生产工作，并通过 Git 提交可审查的 OPI 文本候选。项目负责人随后在原有完整环境中完成统一题库构建、必要的旧 OPI 学习数据清理、App 渲染和发布验收。

本文不替代以下四份决策文档；发生冲突时，需求和技术边界优先：

```text
requirements.md
technical-audit.md
technical-plan.md
roadmap.md
```

## 2. 交接授权与完成边界

项目负责人已经授权同事按照五份大流程文档进入文本内容小流程，不需要再次等待路线图确认。

本次交接的完成含义是：

```text
全部 OPI 文本卡完成四阶段内容定稿
-> 结构动作和稳定 ID 映射完整
-> OPI 权威维护源形成可审查候选
-> 专用文本校验通过
-> 提交并推送独立 Git 分支
```

本次交接完成不等于整个 OPI 工作流已经正式完成。以下工作必须由项目负责人后续接续：

```text
必要时清理旧 OPI 学习数据
-> 统一 content:build
-> content:check:full 与 pnpm check
-> App iOS/Android 渲染验收
-> release version 定稿
-> 可选 ECS 导入和线上验证
```

同事提交分支时，`closeout.md` 只能标记为“文本候选完成、环境验收待项目负责人接续”，不能写成“整个任务已完成”。

## 3. 全新电脑需要与不需要的环境

### 3.1 最小必需环境

同事需要：

- Git，用于克隆、建分支、提交和推送。
- Node.js `24.4.1`，与仓库 `.node-version` 一致；仓库允许范围为 `>=22.13.0 <25`。
- Codex 或其他能够安全编辑和审查仓库文件的工具。
- 普通网络访问，用于克隆仓库以及必要时查阅官方航空资料。

OPI 专用处理工具必须只使用 Node.js 内置模块，不能为了本次文本任务引入第三方 npm 依赖。因此默认不需要执行 `pnpm install`。

### 3.2 不需要配置

本次交接不需要：

- Xcode、CocoaPods、iOS 模拟器或 iPhone Development Build。
- Android Studio、Android SDK、模拟器或 Android Development Build。
- Expo 本地运行环境、Metro 或原生 Prebuild。
- ECS、Supabase、数据库、线上密钥或签名材料。
- 完整音频库、图片资源库、FFmpeg 或音频指纹环境。
- API 本地服务或真实账号环境。

### 3.3 为什么不能在全新电脑完成全量题库构建

统一题库工具会校验五个题库的音频和图片资源。当前大量资源来自项目负责人电脑上的只读设计资源目录；全新电脑没有这些文件时，`pnpm content:build`、`pnpm content:check` 和 `pnpm content:check:full` 都可能因其他题库资源缺失而失败。

因此同事不得为了通过全量校验而：

- 复制或下载完整音频库。
- 修改资源 manifest、资源路径或校验和。
- 删除其他题库资源引用。
- 为缺失资源制造占位文件。

全量构建和资源校验属于项目负责人后续环境验收。

## 4. 项目负责人交接前必须完成

由于当前五份大流程文档必须存在于同事可访问的 Git 历史中，项目负责人应先：

1. 审查并提交本目录下五份大流程文档。
2. 推送包含这些文档的基线分支或提交。
3. 把准确的基线分支名或 commit SHA 告知同事。
4. 确认同事对仓库具有读取和推送分支的权限。
5. 保留项目负责人电脑当前完整环境，不在同事执行期间删除题库资源。
6. 如果基线 `AGENTS.md` 要求读取仓库外的设计或战略文档，为同事提供这些文档的只读副本或对应仓库的读取权限。

如果同事克隆后看不到以下文件，不得开始：

```text
docs/workstreams/opi-question-bank-text-reconstruction/requirements.md
docs/workstreams/opi-question-bank-text-reconstruction/technical-audit.md
docs/workstreams/opi-question-bank-text-reconstruction/technical-plan.md
docs/workstreams/opi-question-bank-text-reconstruction/roadmap.md
docs/workstreams/opi-question-bank-text-reconstruction/handoff.md
```

## 5. 新电脑初始化

推荐从一个干净目录执行：

```bash
git clone https://github.com/XIciA/icao-app.git
cd icao-app
git fetch origin
git switch <包含五份大流程文档的基线分支>
git pull --ff-only origin <包含五份大流程文档的基线分支>
git switch -c codex/opi-text-reconstruction-content
git status --short
node --version
```

进入执行前必须满足：

- `git status --short` 没有未解释的本地变更。
- `node --version` 位于仓库允许范围，推荐与 `.node-version` 的 `24.4.1` 完全一致。
- 当前分支是独立工作分支，不直接在 `main` 上工作。
- 五份大流程文档与项目负责人交付的基线一致。

如果 Node 不存在，只安装符合版本要求的 Node；不需要为此安装移动端开发工具。

## 6. 强制阅读顺序

同事和其 Codex 在修改文件前必须完整阅读：

1. `AGENTS.md`。
2. `docs/bigandsmall-workflows/document-driven-development-workflow.md`。
3. `docs/bigandsmall-workflows/orchestration-loop.md`。
4. 本文 `handoff.md`。
5. `requirements.md`。
6. `technical-audit.md`。
7. `technical-plan.md`。
8. `roadmap.md`。
9. `content/question-banks/README.md`。
10. OPI 的 `bank.json`、全部 category 文件和相关 topic 文件。

绝不能只读取交接 Prompt 就开始批量改数据。

如果 `AGENTS.md` 指向同事电脑上不存在的仓库外设计或战略文档，同事不得跳过、伪造已读或自行改写 `AGENTS.md`。应先向项目负责人索取只读副本或读取权限。提供这些文档不等于配置 App 开发环境。

若执行过程中确实需要进入 UI、原生环境、音频生命周期或部署区域，必须停止并交回项目负责人，不能在缺少必需参考与环境时继续。

## 7. 权威数据与允许写入范围

### 7.1 权威数据源

只把以下维护层视为 OPI 正式来源：

```text
content/question-banks/banks/opi/bank.json
content/question-banks/banks/opi/categories/*.json
content/question-banks/banks/opi/topics/*.json
```

不得把 App 内嵌 JSON、`dist` 产物、旧音频文本或其他仓库的 OPI 数据当成新的正式来源。

### 7.2 同事允许修改或新增

- `tools/opi-text-reconstruction.mjs`。
- OPI 专用 Node 内置测试或固定样例。
- `content/question-banks/banks/opi/bank.json`。
- `content/question-banks/banks/opi/categories/*.json`。
- `content/question-banks/banks/opi/topics/*.json`。
- `docs/workstreams/opi-question-bank-text-reconstruction/phase-log.md`。
- `docs/workstreams/opi-question-bank-text-reconstruction/closeout.md`。
- `docs/workstreams/opi-question-bank-text-reconstruction/artifacts/` 下的正式审计产物。
- `src/config/app-version.ts`，只用于最终显示版本时间戳。

### 7.3 必须提交的正式审计产物

临时批次文件可以位于 `.generated/opi-question-bank-text-reconstruction/`，但该目录被 Git 忽略。最终必须把以下内容整理为可提交产物：

```text
docs/workstreams/opi-question-bank-text-reconstruction/artifacts/final-card-decisions.json
docs/workstreams/opi-question-bank-text-reconstruction/artifacts/card-target-mapping.json
docs/workstreams/opi-question-bank-text-reconstruction/artifacts/final-quality-report.json
```

这些产物至少要说明：

- 每张原始文本卡的最终动作和理由。
- 最终 category、topic 和 card 目标。
- 拆分、合并、移动、删除与图片答案延期关系。
- 最终四字段覆盖率和全部例外。
- 原始数量、最终数量及各类动作数量。
- 重要航空事实采用的官方资料及不同体系差异标记。

## 8. 同事负责完成的阶段

### 8.1 阶段 0：冻结、审计和工具

- 以当前 OPI 维护源建立文件与卡片校验和。
- 实现 `tools/opi-text-reconstruction.mjs` 的审计、冻结、准备、阶段校验、预览、应用和正式验证能力。
- 工具只使用 Node 内置模块。
- 生成 1333 张文本卡工作项，排除但保留 23 张纯图片卡。
- 确保默认命令只读，正式 `apply` 前检查基线校验和。

### 8.2 阶段 1：英文问题重建

- 先选择 30 至 50 张代表性卡完成校准批次，固定问题边界、答案风格和结构动作标准。
- 按 40 至 60 张原始卡的小批次执行。
- 完成英文纠错、重写、拆分、同话题去重和明显错位调整。
- 明确符合规则的普通纠错和结构动作可以按批次推进，不要求逐卡人工审批。
- 同事只需审核校准批次、检查点样本和少量仍无法安全判断的拆分、合并、移动或删除。
- 结构不确定时优先保留，不冒险合并或删除。
- 每完成约 200 至 300 张执行一次规则一致性复核。
- 阶段结束时锁定英文问题和全部结构动作。

### 8.3 阶段 2：中文问题重译

- 只依据已锁定英文问题重新翻译。
- 不使用旧中文作为翻译底稿。
- 不反向修改英文问题；确需修改时按路线图退回阶段 1。

### 8.4 阶段 3：英文参考答案重建

- 每题只形成一份与最终问题匹配的英文答案。
- 旧答案只作语义参考，删除多版本编号和中英混排。
- 以 ICAO 4 级容易学习、5 级自然度为目标。
- 简单题通常使用 3 至 5 句；复杂题使用 2 至 3 个短段落，不设置机械字数。
- 优先口语化、准确和可复述，不追求高级词汇或论文式表达。
- 个人经历、公司程序类答案属于可调整的示范答案，不伪装成真实经历或真实公司程序。
- 重要航空事实优先核对 ICAO、CAAC、FAA、EASA、制造商或其他官方一手资料。
- 不确定或不同体系存在差异时优先使用通用安全表述，并在审计产物中记录；不得用随机网页或模型记忆冒充事实依据。
- 只有无法脱离具体图片确认的答案可以标记为 `deferred-image-answer`；问题中英文仍须完成，旧答案不得保留。

### 8.5 阶段 4：中文参考答案重译

- 只依据已锁定英文答案重新翻译。
- 观点、范围、顺序和自然段必须对应。
- 不增加英文答案中不存在的信息。

### 8.6 阶段 5 的文本源候选部分

同事只完成阶段 5 中不依赖 App 环境的部分：

- 固化稳定 ID 和旧目标到最终目标的审计映射。
- 在临时候选中应用全部已锁定文本。
- 更新 OPI topic、category 和 bank 的声明数量。
- 生成正式审计产物和文本质量报告。
- 把通过 OPI 专用验证的维护源提交到工作分支。

本次已经确认不保留任何旧 OPI 学习进度、笔记或高亮。同事不实现客户端学习状态迁移、云同步归一、高亮迁移或 App 测试；审计映射不进入运行时代码。实际环境中如有旧 OPI 学习数据，由项目负责人后续按范围清理。

## 9. 本次交接采用的内容执行规则

### 9.1 结构判断

- 每张文本卡只保留一个可独立回答的核心任务。
- `Yes/No + Why` 或不可缺少的追问保持在同一卡片。
- 两个可分别完整阐述的问题必须拆分。
- 同话题高度相似问题保留最佳版本，不按首次出现机械决定。
- 相似度只生成候选，不自动删除。

### 9.2 ID、标题和顺序

- 保留题继续使用原 card ID。
- 拆分题的主问题保留原 ID，派生问题使用新的唯一 ID。
- 合并、移动或删除后的旧 ID 不得复用。
- 最终同一普通话题内 `taskTitle` 连续编号；稳定 card ID 不因显示编号变化而改变。
- 保留题尽量维持原相对顺序；拆分题紧跟主问题；移动题放到目标话题最相关的位置。
- 图片话题中的纯图片卡和“图片观察”标题不修改；文本问题沿用图片题现有命名模式连续整理。

### 9.3 图片题边界

- 图片话题的英文文本问题和中文问题仍必须完成清洗与重译。
- 需要具体画面才能确定的只延期参考答案，不把整张文本卡静默跳过。
- 延期项必须出现在决策清单和质量报告中。
- 不读取、替换、移动或修改图片资源。

### 9.4 人工审核责任

本次不做 1333 张卡的逐卡人工审批。人工审核集中在：

- 30 至 50 张代表性校准批次。
- 每个 200 至 300 张检查点的代表性样本。
- 少量无法通过通用安全表述解决的航空事实冲突。
- 少量仍无法可靠决定的拆分、合并、移动和删除。

普通语法修正、翻译、答案润色和明确结构动作可以批量执行，但仍需通过规则校验和抽样检查。答案不确定时优先使用通用安全表述；结构不确定时优先保留而不是合并或删除。

## 10. 同事明确禁止的范围

同事不得修改或提交：

- `dist/question-bank-release/`。
- `src/features/question-bank/data/question-bank.json`。
- `src/features/question-bank/data/audio-index.json`。
- `content/question-banks/registry.json` 的 release version 或 releasedAt。
- `content/question-banks/resources/`。
- `package.json`、lockfile 或第三方依赖。
- 学习页 UI、路由、播放器、录音、权限或音频生命周期。
- 学习状态、同步、标注、AI 请求或数据库实现。
- `services/api/`、数据库 migration、ECS 或线上 active release。
- 听力、900 句、陆空通话、故事复诵或图片资源。
- `AGENTS.md` 和大流程已确认的需求边界。

同事还不得：

- 把 `.generated/`、`node_modules/`、密钥、签名材料或本机环境文件提交 Git。
- 使用未经确认的付费第三方批量生成 API。
- 为通过校验而弱化规则、删除异常记录或伪造成功报告。
- 因缺少 App 环境而自行扩大到 Web、Flutter 或其他项目。

## 11. 同事可执行的验证

实际命令以阶段 0 最终实现的工具帮助信息为准，至少应能执行：

```bash
node --check tools/opi-text-reconstruction.mjs
node tools/opi-text-reconstruction.mjs audit
node tools/opi-text-reconstruction.mjs verify-stage question-en
node tools/opi-text-reconstruction.mjs verify-stage question-zh
node tools/opi-text-reconstruction.mjs verify-stage answer-en
node tools/opi-text-reconstruction.mjs verify-stage answer-zh
node tools/opi-text-reconstruction.mjs build-review
node tools/opi-text-reconstruction.mjs verify-formal
git diff --check
git status --short
```

`verify-formal` 至少验证：

- OPI bank、category、topic 和 card 数量声明一致。
- 全部 OPI card ID 唯一，旧 ID 未被复用。
- 1333 张原始文本卡都有最终决策。
- 除正式记录的图片答案延期外，四字段覆盖完整。
- 中英字段不混排，无答案版本编号和未决斜杠表达。
- 同话题完全重复为 0，高相似候选全部有结论。
- 所有结构动作都有来源、目标和理由。
- 对同一输入重复验证结果一致。

### 11.1 在全新电脑明确跳过

同事默认跳过并在 `closeout.md` 中如实记录：

```bash
pnpm content:build
pnpm content:check
pnpm content:check:full
pnpm check
pnpm ios:*
pnpm android:*
```

跳过原因必须写成“缺少完整题库资源和 App 工程依赖，已交由项目负责人接续”，不能写成“验证通过”。

## 12. Git 提交要求

### 12.1 提交前

1. 确认仍在 `codex/opi-text-reconstruction-content` 或同类独立分支。
2. 检查 `git status --short` 和 `git diff --name-only`。
3. 确认没有交接禁止范围文件。
4. 运行全部 OPI 专用验证和 `git diff --check`。
5. 在最后一次内容或文档修改后，把 `src/config/app-version.ts` 更新为上海时区的 `vYYYY.MM.DD.HHmm`。
6. 再次运行 OPI 专用验证与 diff 检查。

### 12.2 提交与推送

只暂存交接范围内文件，建议提交信息：

```bash
git commit -m "feat(content): rebuild OPI question bank text"
git push -u origin codex/opi-text-reconstruction-content
```

不得直接合并到 `main`，不得强推，不得改写项目负责人已有提交。

### 12.3 交还信息

同事应向项目负责人提供：

- 分支名和 commit SHA。
- 原始与最终话题、卡片、文本卡和图片卡数量。
- rewrite、split、merge、move、delete、deferred-image-answer 数量。
- OPI 专用验证的完整结果。
- 因环境缺失而跳过的命令。
- 所有图片答案延期和航空事实待复核项。
- 项目负责人后续必须执行的检查清单。

## 13. 项目负责人接续清单

收到同事分支后，项目负责人在原有完整环境中：

1. 审查 commit、最终决策清单、目标映射和质量报告。
2. 如存在旧 OPI 学习进度、笔记或高亮，按 OPI 范围直接清理；不开发迁移兼容。
3. 更新 `content/question-banks/registry.json` 的正式 release version 和 releasedAt。
4. 运行 `pnpm content:build`。
5. 运行 `pnpm content:check:full`。
6. 运行 `pnpm check`。
7. 在 iOS 和 Android 检查代表性短题、长题、多段答案、拆分题、移动题和图片话题文本题。
8. 再次更新最终 App 显示版本。
9. 完成正式 `closeout.md`。
10. 只有另行确认上线后，才导入 ECS 并验证 `/health/ready` 和线上 OPI release。

项目负责人不得在没有审查映射和报告的情况下只复制 topic JSON。

## 14. 必须暂停并交回项目负责人的情况

出现以下任一情况，同事应停止相关动作、保留现状并报告：

- 基线五份文档缺失或互相冲突。
- 干净克隆中出现不明改动或源校验和意外变化。
- 继续执行需要修改 UI、音频、同步、数据库、API 或其他题库。
- 需要付费外部 API、密钥、生产账号或受限数据。
- 无法可靠确定 card ID 应如何保留、合并或移动。
- 航空事实存在重大冲突，无法通过官方资料形成稳妥通用答案。
- 工具无法保证幂等、回滚或逐卡可追溯。
- 最终文本候选不能通过 OPI 专用严格校验。

缺少 Xcode、Android Studio、Expo、音频资源和 ECS 不是文本阶段的阻断条件；只需按本文跳过对应环境验收。

## 15. 可直接复制的交接 Prompt

```text
你现在接手 icao-app 的 OPI 题库文本梳理与重建任务。你的电脑是全新环境，本次只完成文本内容生产和 OPI 权威维护源候选，不配置或运行 iOS、Android、Expo、ECS、数据库、音频资源或真实 App。

仓库：
https://github.com/XIciA/icao-app.git

开始前：
1. 从项目负责人给出的、已经包含五份 OPI 大流程文档的基线分支或 commit 开始。
2. 创建独立分支 codex/opi-text-reconstruction-content，不要直接在 main 上工作。
3. 确认 git status --short 干净。
4. 确认 Node 在 >=22.13.0 <25，优先使用仓库 .node-version 的 24.4.1。
5. 默认不要执行 pnpm install；OPI 专用工具必须只使用 Node 内置模块。
6. 如果 AGENTS.md 指向本机不存在的仓库外设计或战略文档，先向项目负责人索取只读副本或读取权限；不要跳过，也不要修改 AGENTS.md 绕过要求。

必须完整阅读，不能只看本 Prompt：
- AGENTS.md
- docs/bigandsmall-workflows/document-driven-development-workflow.md
- docs/bigandsmall-workflows/orchestration-loop.md
- docs/workstreams/opi-question-bank-text-reconstruction/handoff.md
- docs/workstreams/opi-question-bank-text-reconstruction/requirements.md
- docs/workstreams/opi-question-bank-text-reconstruction/technical-audit.md
- docs/workstreams/opi-question-bank-text-reconstruction/technical-plan.md
- docs/workstreams/opi-question-bank-text-reconstruction/roadmap.md
- content/question-banks/README.md

执行目标：
- 按路线图阶段 0 至阶段 4 完成 1333 张 OPI 文本卡的英文问题重建、中文问题重译、英文参考答案重建、中文参考答案重译。
- 完成阶段 5 中不依赖 App 环境的内容：稳定 ID 映射、文本候选应用、OPI 数量同步、正式决策清单和质量报告。
- 先做 30 至 50 张代表性校准批次；普通内容按批次自动推进，不做 1333 张逐卡人工审批。
- 人工审核集中在每 200 至 300 张检查点样本，以及少量仍无法安全判断的结构或航空事实问题。
- 按 40 至 60 张批次执行，每 200 至 300 张做一次规则一致性复核。
- 英文问题、中文问题、英文答案、中文答案必须严格依次锁定，后阶段不能悄悄修改前阶段。

必须保留的原则：
- 旧文本和旧答案只作语义参考，最终质量优先。
- 一张文本卡只包含一个独立回答任务；Yes/No + Why 等不可拆追问保留。
- 同话题高度相似问题保留最佳版本，不做跨话题机械去重。
- 保留卡沿用原 card ID；拆分主问题沿用原 ID；派生问题用新 ID；退役 ID 永不复用。
- 普通话题 taskTitle 最终连续编号，但稳定 ID 不因显示编号变化而改变。
- 图片话题的文本问题仍要完成双语清洗；只有依赖具体画面的参考答案可以延期。
- 每题只保留一份最终英文答案及其中文翻译，中英文严格分字段。
- 英文答案以 ICAO 4 级容易学习、5 级自然度为目标；简单题通常 3 至 5 句，复杂题 2 至 3 个短段落，不设置机械字数。
- 优先口语化、准确和可复述；个人经历与公司程序答案是可调整示范，不伪装成真实经历。
- 重要航空事实优先核对 ICAO、CAAC、FAA、EASA、制造商等官方一手资料；体系有差异或不确定时使用通用安全表述并标记。
- 不保留任何旧 OPI 学习进度、笔记或高亮；目标映射只用于审计，不开发运行时迁移。

只允许写入：
- tools/opi-text-reconstruction.mjs 及其专用测试/样例
- content/question-banks/banks/opi 下的 bank、category、topic 维护源
- docs/workstreams/opi-question-bank-text-reconstruction 下的 phase-log、closeout 和 artifacts
- 最后更新 src/config/app-version.ts

严禁修改：
- dist/question-bank-release
- src/features/question-bank/data/question-bank.json
- src/features/question-bank/data/audio-index.json
- content/question-banks/registry.json
- content/question-banks/resources
- package.json、lockfile、第三方依赖
- UI、导航、播放器、录音、音频生命周期
- 学习状态、同步、标注、API、数据库、ECS
- 其他四套题库和图片资源

必须提交以下正式审计产物：
- docs/workstreams/opi-question-bank-text-reconstruction/artifacts/final-card-decisions.json
- docs/workstreams/opi-question-bank-text-reconstruction/artifacts/card-target-mapping.json
- docs/workstreams/opi-question-bank-text-reconstruction/artifacts/final-quality-report.json
- phase-log.md
- closeout.md，且只能标记为“文本候选完成，环境验收待项目负责人接续”

至少运行：
- node --check tools/opi-text-reconstruction.mjs
- OPI 工具的 audit、各阶段 verify-stage、build-review、verify-formal
- git diff --check
- git status --short

在这台全新电脑上明确跳过 pnpm content:build、pnpm content:check、pnpm content:check:full、pnpm check 和所有 iOS/Android 命令，因为缺少完整题库资源和 App 工程依赖。必须在 closeout 中如实写成“跳过并交由项目负责人接续”，不能写成通过。

完成后只提交交接范围内文件，提交信息可用：
feat(content): rebuild OPI question bank text

推送独立分支，不要合并 main。最终向项目负责人报告分支、commit SHA、动作统计、验证结果、跳过项、图片延期项和后续环境验收清单。

遇到需要扩大到 UI、音频、同步、数据库、API、其他题库、付费外部 API，或者无法通过通用表述、保守保留和官方资料核对解决 ID/航空事实冲突时，暂停并报告，不要自行扩大范围。
```
