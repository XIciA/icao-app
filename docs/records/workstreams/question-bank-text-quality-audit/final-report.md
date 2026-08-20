# 五套题库全量文本低级错误审查与修复报告

## 一、结论

本次对唯一正式维护源 `content/question-banks` 完成了全量文本审查。审查对象包含题库、
分类、话题、任务标题、听力原文、中译文、参考答案、选项和图片替代文本，不读取、播放、
识别或修改任何音频。

最终覆盖 5 套题库、341 个话题、6,865 张卡、374 个源文件和 40,564 个用户可见文本值。
全部文本指针均已收敛为明确状态：

- 766 个字段是能够唯一判断的低级错误，已直接修复；
- 14 个字段缺少不依赖听音或内容负责人判断的唯一证据，保留人工审核；
- 4 组观察涉及答案正确性、音频异常或文风优化，明确排除在本任务之外；
- 其余文本已检查并判定为 clean。

766 个修复字段分布在 587 张卡、101 个源文件中。自动应用后的第二次执行为零修改；
最终高召回扫描没有遗留未分类候选。题库从 v11 升为 v12，卡片数量、稳定 ID、顺序、
正确答案索引、音频和图片资源均未因本任务发生变化。

## 二、审查范围和边界

本次纳入所有用户可见文本：题库标题、英文名、描述、摘要、状态、单位、学习页标签，
分类和话题名称，`taskTitle`、`audioText`、`audioTextZh`、`referenceText`、
`referenceTextZh`、`choices`、`choicesZh` 和 `imageAlt`。

`audioText` 是文本，因此在范围内；音频文件及其听感不在范围内。没有修改音频路径、时长、
映射、文件、播放器或录音能力。没有重新判断专业答案，没有改变正确答案索引，没有以普通
书面英语替换成立的 ICAO 省略通话，没有对可理解但生硬的翻译做大范围润色，也没有猜测
无线电中听不清的数字或词语。

陆空通话呼号修复任务先完成 v11 并 handoff，本任务随后独占共享生成和发布路径。v12
是在 v11 的 3,216 张陆空通话卡基础上完成，因此最终产物同时包含另一任务的 26 场景
呼号统一和本任务的全库低级文本修复，没有相互覆盖。

## 三、覆盖方法和可追溯性

审查工具从正式 JSON schema 提取文本，以题库、分类、话题、卡片、字段和数组下标稳定排序，
每批最多 250 个文本值，共形成 163 个批次。第一轮用高召回规则发现乱码、隐藏 Unicode、
异常符号、OCR、单词粘连、内部下划线、重复词句、空白、标点、括号、引号和说话人标签问题；
第二轮逐批覆盖全部文本，而不是只看机器候选；第三轮检查同卡选项唯一性、选项与参考答案
回显、双语数字/呼号机械一致性和同场景异常；第四轮对所有拟修改项再次复核、应用并清零。

每个正式源文件保存文本投影 SHA-256。每个修复项保存文件、JSON pointer、题库/话题/卡片
定位、字段、数组下标、原文、修复后文本、原文 SHA-256、规则、置信度、依据和证据。
应用时必须同时匹配文件、指针、原文和 hash；人工保留项也绑定当前字段 hash。正文一旦变化，
门禁会要求重新审查。

完整机器可读证据包括：

- `artifacts/baseline-v11.json`：并行任务完成后的冻结基线；
- `artifacts/coverage.json`：374 个源文件的文本投影与覆盖状态；
- `artifacts/corrections.json`：766 项完整前后对照账本；
- `artifacts/review-decisions.json`：候选到最终状态的审定记录；
- `artifacts/manual-review.json`：14 项人工审核清单；
- `artifacts/out-of-scope-observations.json`：明确排除的观察；
- `artifacts/v12-build-invariants.json`：v12 数量、checksum、资源和反向复现证据。

## 四、修复统计

### 按题库

| 题库 | 修复字段 | v12 卡数 | v12 checksum |
| --- | ---: | ---: | --- |
| listening | 207 | 1,223 | `2bc4fc17fef484ef52e2f736fa646068758a0ffa397a004330f8fd4a59ae057b` |
| sentences900 | 113 | 900 | `0a21b6d238f3a9748ab74c49604c2910a03f4713d2ecad52c4499e7daf4b6ae3` |
| radiotelephony | 253 | 3,216 | `dd211915b197b5919d59b17db42fbb516685c05a33f5382f86e167382e48d811` |
| storytelling | 193 | 436 | `7695e6d281165e2bae64547d0d4a855f46b1f8f9cfa69abc6aad36acefbb5dc5` |
| opi | 0 | 1,090 | `7d8ffe589858c1049bf5bbb3d6e537176f1d05e1012e431e475c727069ecab24` |

OPI 的 1,090 张卡和相关图片替代文本已全量覆盖，但没有发现满足“唯一、确定、不改变语义”
条件的低级错误，因此 checksum 保持不变。

### 按字段

| 字段 | 修复字段 |
| --- | ---: |
| `audioText` | 300 |
| `referenceText` | 155 |
| `audioTextZh` | 140 |
| `referenceTextZh` | 72 |
| `choices` | 62 |
| `choicesZh` | 31 |
| 名称字段 | 6 |

### 按主要错误证据

一项修复可同时命中多类证据，因此以下数量不是互斥合计：上下文二次复核 277 项，已知低级
拼写/OCR 184 项，词形疑点 135 项，标点邻接空格 137 项，中文“近进/进近”确定性错字
81 项，数字与单词粘连 53 项，结构化选项标签混入正文 43 项，多空格 28 项，括号不配对
26 项，中文 ASCII 标点 25 项，飞行高度层标记未闭合 24 项，重复句段 22 项，隐藏或非法
Unicode 16 项，标签与数字粘连 16 项，英文全角标点 15 项，引号不配对 12 项。此外还有
内部下划线、异常符号、混合大小写 OCR、重复词、空行和重复标点等少量确定性问题。

## 五、代表性修复与判定依据

1. `listening-main-006` 的 A 选项从 `Is_suing a further climb instruction`
   修为 `Issuing a further climb instruction`，并同步修正参考答案中的同一文本。内部下划线
   破坏单词，修复结果唯一，答案位置未变。
2. `atc-scenario-0014-card-main-234` 将 `fight level #%$@*^#....` 修为
   `flight level [unintelligible due to radio interference]`；中文同步使用
   `［无线电干扰，内容不清］`。同卡后句明确说明放行受到干扰并请求重复，因此可以确定
   符号串表示不可辨识内容，但不能也没有猜测被干扰的高度。
3. `listening-main-1090` 的 `audioText` 误内嵌 A–D 四个选项，与结构化 `choices`
   重复。已删除正文中的选项副本，并同时修正 `Runway 13is` 为 `Runway 13 is`；
   结构化选项和正确答案索引未变。
4. `sentence900-main-167` 的中文 `直接目视近进，跑道34` 修为
   `直接目视进近，跑道34`。同一系统性错字在确定语境中统一处理。
5. `story-koala-055` 原中文把本机和冲突机高度写反。英文原文、同源
   `story-kongguan-018` 和 `story-wing-006` 三份内部证据一致，确定本机为 FL290、
   前机为 FL294，因此直接纠正角色与高度对应，不依赖听音。
6. 听力题同卡重复选项被纳入唯一性门禁。能够从英文/中文或参考答案唯一反推干扰项的卡片
   已逐卡修复；`listening-main-926` 的 C/D 中英文重复缺少唯一替代文本，未擅自编造，
   保留人工清单。

完整 766 项前后对照不在正文重复铺开，均可在 `artifacts/corrections.json` 按题库、
卡片、字段或规则检索。

## 六、人工审核清单

最终有 14 个字段需要人工介入，均位于 listening：

- 12 个 `audioText` 中含 `...` 或紧邻省略号。仅凭仓库文本无法确定它表示自然停顿、
  可补全词语还是无线电干扰，涉及卡片 `listening-main-430`、`129`、`285`、
  `1066`、`1165`、`1168`、`1175`、`690`、`1016`、`1017`、`1026` 和 `293`。
- `listening-main-926` 的 `choices[3]` 与 `choicesZh[3]` 分别重复同卡 C 选项。
  仓库内部没有足以唯一生成另一组干扰项的证据，且自行改写会触及教学设计。

人工审核时可以选择保留自然停顿、听音后补全可靠可辨识内容、确认干扰后改为统一占位语，
或由内容负责人提供新的中英文干扰项。结构化定位、全文上下文、原因和当前 SHA-256 均见
`artifacts/manual-review.json`。任何字段变化都会使当前人工保留指纹失效。

## 七、明确排除的观察

- `listening-main-1152` 的正文和当前正确答案存在语义冲突，但解决它需要判断专业答案，
  本次不改变索引。
- `listening-main-927` 与 `listening-main-1031` 的叙述、问题相同而答案不同，仓库无法
  唯一判断哪个专业结论正确。
- 少量音频时长与文本量看起来异常；本任务不读取音频，也不改时长、路径和映射。
- 少量文本可以做翻译或文风优化，但仍可理解，不属于直接破坏体验的低级错误。

这些内容被显式记录，既不会误报为“全库没有任何可讨论问题”，也不会在文本清理任务中
越权改变专业事实。

## 八、构建、派生资产与不变量

正式源只在 `content/question-banks` 修改；App 内嵌题库和
`dist/question-bank-release` 由 `content:build` 统一生成。v12 仍为 5 库、341 话题、
6,865 卡。把 766 项修复逐项反向还原后，五库 checksum 均精确复现冻结的 v11 checksum，
因此没有账本外正文变化。

资源清单保持版本 5、6,081 个文件、814,518,693 bytes，manifest SHA-256 为
`94525c1fd882667345b733d2e26885c2f761e725b0f3b454b4e4c914e3533693`。
稳定 ID、未删除卡顺序、题型、正确答案索引、音频路径、图片路径和资源 manifest 都没有
非预期变化。

静态查词数据按修正后文本重新提取：7,807 个精确词形中保留原有 7,322 个有效词条，
删除 1,445 个已不再出现的错误/旧词形，新增 485 个真实新词形，新增批次
`0091-v12-text-corrections.json`。没有借机重写词义。ASR 候选重新汇总为 236 条，
正式热词和部署热词仍为 0；正式配置 SHA-256
`64b47f3715c76a8a453ae758acc945790725a5b15458926f97a0de2fb39a9513`
保持不变。

## 九、自动化验证

以下门禁均已通过：

- `pnpm content:text:check`：`texts=40564 files=374 candidates=14 reviewed=14 corrections=766`；
- `pnpm content:build`；
- `pnpm content:check:full`；
- 静态查词提取、汇总、dataset 和运行时检查；
- ASR 候选、库存和正式热词检查；
- `pnpm check`；
- Web 内容、资源和网络边界检查；
- 修复工具第二次执行零修改；
- 766 项反向复现 v11 的逐库 checksum 检查。

测试结果包括 App Jest 70 suites / 312 tests、API Jest 8 suites / 235 tests。因为没有
React Native API、原生依赖、权限或音频生命周期变化，本次不重建 Development Build。

## 十、ECS 发布与验证

ECS 增量 manifest 只包含 listening、sentences900、radiotelephony 和 storytelling，
资源列表为空；OPI 未变化，没有写入新版本。导入结果为 4 个变化库激活、资源上传 0。

线上最终活动题库为：

| 题库 | 线上版本 | 卡数 | 话题 |
| --- | ---: | ---: | ---: |
| listening | 12 | 1,223 | 4 |
| opi | 10 | 1,090 | 144 |
| radiotelephony | 12 | 3,216 | 186 |
| sentences900 | 12 | 900 | 3 |
| storytelling | 12 | 436 | 4 |

线上验证覆盖 `/health/ready`、活动题库总数、逐库版本和 checksum、鉴权读取、ETag、
304、未鉴权 401，以及五张代表卡。API 镜像仍为 `icao-api:phase2a`，
`restart_count=0`，容器 healthy；本次没有 API 代码变更、部署或重启。

发布前活动题库快照位于
`/opt/icao/backups/content/question-bank-text-v12-20260730T170904Z/active-banks-before.json`
（SHA-256 `b5d81bd6379e6e22429d623ff95937c1b5805744e6a4640d523b5eafc38f61b6`）。
PostgreSQL 备份位于
`/opt/icao/backups/postgres/icao-question-bank-text-v12-20260730T170904Z-before.dump`
（SHA-256 `8e0bf51428e4b51d8768046af1b73e303564229ae0ab9383cc279b939ffc2aef`，
`pg_restore` 目录 646 项）。事务回滚 SQL 位于同一 content 备份目录。

## 十一、Web 内容、资源复用与回滚

Web 不可变内容 release 为 `app-qb-v12-bf1bbbc35087dfff`，checksum 为
`bf1bbbc35087dfff8a7822de0a875977ce7c5e652228de07ae17b39f7e1c0f50`。
远端 current pointer、五库文件和资源 manifest 均已与本地逐项核对。

现有 10 个正式资源分片通过同源正式域名复用；复用前要求 release marker 的资源 manifest
checksum、6,081 文件和 814,518,693 bytes 三项同时匹配。文本发布没有重新上传音频或图片，
也没有建立第二份题库或文本映射来源。

Web 发布采用 Preview 验收后把同一个不可变部署提升到 Production。最终动态部署 ID、
正式域名 `/api/health` 和页面宽度验收结果在仓库冻结后的任务交付中报告。发布前 Production
部署回滚点为 `dpl_3nmvbVtdCcfQsBYubzVsPgBszEUx`，内容回滚点为
`app-qb-v10-817646d597e77a8c`；回滚时恢复发布前环境值并重新提升该部署，不删除 v10/v12
不可变内容。

## 十二、共享模块复用与最终差异边界

本任务复用 `tools/question-bank-content.mjs`、`QuestionBankRepository`、现有资源
manifest/解析器、静态查词生成器、ASR 热词生成器、ECS 内容导入流程和 Web 不可变内容同步
流程。新增文本审查工具只读取和校验正式源，不成为运行时内容来源。

题库正文差异全部在 766 项修复账本中；另包含另一任务已交接的 v11 陆空通话呼号修复和
两卡删除。其余本任务差异为审查工具、命令/门禁、审查文档与结构化证据、统一生成物、
静态查词派生数据、ASR 派生库存、Web 同源资源复用校验和必要的数量测试更新。工作区中与
题库无关的既有文档整理修改没有被还原、覆盖或纳入内容发布包。

最终 App 显示版本在全部仓库编辑完成后按 Asia/Shanghai 当前时间刷新，并在交付消息中
明确报告。
