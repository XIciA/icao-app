# 静态查词替代运行时 AI 查词：阶段记录

## 阶段 1：内容契约与清单

状态：完成

- 新增 `tools/static-word-lookup.mjs`，以确定性脚本从已确认范围提取词表：听力仅使用音频原文和四个选项，其余题库按路线图范围处理。
- 已生成 `content/word-lookup/word-list.json`，锁定 8,767 个严格英文词形、298,095 次出现位置及题库 SHA-256 指纹。
- 已将 1,237 个混合编号、粘连格式等异常 token 输出为审查样本，避免例如把 `A320` 错清洗为 `a`。
- 已验证：`static-word-lookup.mjs extract`、`static-word-lookup.mjs check`。

未做：未生成任何音标或释义，未改动学习页 UI。

下一阶段：由当前 Codex 基于锁定词表生成静态词条，再运行全量结构、覆盖和指纹校验。

## 阶段 2：内容生成与自动校验

状态：进行中

- 用户已再次明确授权：按既定路线连续执行至阶段 4 完成；除非触碰既定硬约束，不再逐批请求确认。

- 增加可审查批次目录 `content/word-lookup/batches/`；`assemble-dataset` 只负责将这些批次汇总为应用只读的 `dataset.json`，不手工编辑汇总文件。
- 已由当前 Codex 生成 103 条词条（包括用户确认的 `descent`、以及 `clearance`、`deviation`），每条包含一个美式 IPA、航空释义和常用释义。
- 批次结构校验通过：`word_lookup_dataset_partial_check_ok words=103 remaining=8664`。全量覆盖校验当前按预期未通过，未将该状态标记为完成。
- 本批未调用外部 API、本机其他本地模型或第三方词典数据。
- 已新增第 104–203 个词形的可审查内容批次，汇总后词条数为 203；校验结果：`word_lookup_dataset_partial_check_ok words=203 remaining=8564`。
- 已新增第 204–303 个词形的可审查内容批次，汇总后词条数为 303；校验结果：`word_lookup_dataset_partial_check_ok words=303 remaining=8464`，同时题库输入覆盖校验持续通过（`words=8767 occurrences=298095 rejected=1237`）。
- 已新增第 304–503 个词形的两个可审查内容批次，汇总后词条数为 503；校验结果：`word_lookup_dataset_partial_check_ok words=503 remaining=8264`，题库输入覆盖校验持续通过。
- 已新增第 504–703 个词形的两个可审查内容批次，汇总后词条数为 703；校验结果：`word_lookup_dataset_partial_check_ok words=703 remaining=8064`，题库输入覆盖校验持续通过。
- 已新增第 704–803 个词形的可审查内容批次，汇总后词条数为 803；校验结果：`word_lookup_dataset_partial_check_ok words=803 remaining=7964`，题库输入覆盖校验持续通过。
- 已新增第 804–903 个词形的可审查内容批次，汇总后词条数为 903；校验结果：`word_lookup_dataset_partial_check_ok words=903 remaining=7864`，题库输入覆盖校验持续通过。
- 已新增第 904–1003 个词形的可审查内容批次，汇总后词条数为 1003；校验结果：`word_lookup_dataset_partial_check_ok words=1003 remaining=7764`，题库输入覆盖校验持续通过。
- 已新增第 1004–1103 个词形的可审查内容批次，修正情态动词词性前缀后，汇总词条数为 1103；校验结果：`word_lookup_dataset_partial_check_ok words=1103 remaining=7664`，题库输入覆盖校验持续通过。
- 已新增第 1104–1203 个词形的可审查内容批次，汇总词条数为 1203；校验结果：`word_lookup_dataset_partial_check_ok words=1203 remaining=7564`，题库输入覆盖校验持续通过。
- 已新增第 1204–1303 个词形的可审查内容批次，汇总词条数为 1303；校验结果：`word_lookup_dataset_partial_check_ok words=1303 remaining=7464`，题库输入覆盖校验持续通过。
- 已新增第 1304–1403 个词形的可审查内容批次；其中 `clearance` 已由基础批次覆盖，移除重复项后汇总词条数为 1402；校验结果：`word_lookup_dataset_partial_check_ok words=1402 remaining=7365`，题库输入覆盖校验持续通过。
- 已新增第 1404–1503 个词形的可审查内容批次，汇总词条数为 1502；校验结果：`word_lookup_dataset_partial_check_ok words=1502 remaining=7265`，题库输入覆盖校验持续通过。
- 已新增第 1504–1603 个词形的可审查内容批次，汇总词条数为 1602；校验结果：`word_lookup_dataset_partial_check_ok words=1602 remaining=7165`，题库输入覆盖校验持续通过。
- 已新增第 1604–1703 个词形的可审查内容批次，汇总词条数为 1702；校验结果：`word_lookup_dataset_partial_check_ok words=1702 remaining=7065`，题库输入覆盖校验持续通过。
- 已新增第 1704–1803 个词形的可审查内容批次，汇总词条数为 1802；校验结果：`word_lookup_dataset_partial_check_ok words=1802 remaining=6965`，题库输入覆盖校验持续通过。
- 已新增第 1804–1903 个词形的可审查内容批次，汇总词条数为 1902；校验结果：`word_lookup_dataset_partial_check_ok words=1902 remaining=6865`，题库输入覆盖校验持续通过。
- 已新增第 1904–2003 个词形的可审查内容批次，汇总词条数为 2002；校验结果：`word_lookup_dataset_partial_check_ok words=2002 remaining=6765`，题库输入覆盖校验持续通过。
- 已新增第 2004–2103 个词形的可审查内容批次；其中 `descent` 已由基础批次覆盖，移除重复项后汇总词条数为 2101；校验结果：`word_lookup_dataset_partial_check_ok words=2101 remaining=6666`，题库输入覆盖校验持续通过。
- 已新增第 2104–2203 个词形的可审查内容批次；其中 `deviation` 已由基础批次覆盖，移除重复项后汇总词条数为 2200；校验结果：`word_lookup_dataset_partial_check_ok words=2200 remaining=6567`，题库输入覆盖校验持续通过。
- 已新增第 2204–2303 个词形的可审查内容批次，汇总词条数为 2300；校验结果：`word_lookup_dataset_partial_check_ok words=2300 remaining=6467`，题库输入覆盖校验持续通过。
- 已新增第 2304–2403 个词形的可审查内容批次，汇总词条数为 2400；校验结果：`word_lookup_dataset_partial_check_ok words=2400 remaining=6367`，题库输入覆盖校验持续通过。
- 已新增第 2404–2503 个词形的可审查内容批次，汇总词条数为 2500；校验结果：`word_lookup_dataset_partial_check_ok words=2500 remaining=6267`，题库输入覆盖校验持续通过。
- 已新增第 2504–2603 个词形的可审查内容批次，汇总词条数为 2600；校验结果：`word_lookup_dataset_partial_check_ok words=2600 remaining=6167`，题库输入覆盖校验持续通过。
- 已新增第 2604–2703 个词形的可审查内容批次，汇总词条数为 2700；校验结果：`word_lookup_dataset_partial_check_ok words=2700 remaining=6067`，题库输入覆盖校验持续通过。
- 已新增第 2704–2803 个词形的可审查内容批次，汇总词条数为 2800；校验结果：`word_lookup_dataset_partial_check_ok words=2800 remaining=5967`，题库输入覆盖校验持续通过。
- 已新增第 2804–2903 个词形的可审查内容批次，汇总词条数为 2900；校验结果：`word_lookup_dataset_partial_check_ok words=2900 remaining=5867`，题库输入覆盖校验持续通过。
- 已新增第 2904–3003 个词形的可审查内容批次，汇总词条数为 3000；校验结果：`word_lookup_dataset_partial_check_ok words=3000 remaining=5767`，题库输入覆盖校验持续通过。
- 已新增第 3004–3103 个词形的可审查内容批次，汇总词条数为 3100；校验结果：`word_lookup_dataset_partial_check_ok words=3100 remaining=5667`，题库输入覆盖校验持续通过。
- 已新增第 3104–3203 个词形的可审查内容批次，汇总词条数为 3200；校验结果：`word_lookup_dataset_partial_check_ok words=3200 remaining=5567`，题库输入覆盖校验持续通过。
- 已新增第 3204–3303 个词形的可审查内容批次，汇总词条数为 3300；校验结果：`word_lookup_dataset_partial_check_ok words=3300 remaining=5467`，题库输入覆盖校验持续通过。
- 已新增第 3304–3403 个词形的可审查内容批次，汇总词条数为 3400；校验结果：`word_lookup_dataset_partial_check_ok words=3400 remaining=5367`，题库输入覆盖校验持续通过。
- 已新增第 3404–3503 个词形的可审查内容批次，汇总词条数为 3500；校验结果：`word_lookup_dataset_partial_check_ok words=3500 remaining=5267`，题库输入覆盖校验持续通过。
- 已新增第 3504–3603 个词形的可审查内容批次，汇总词条数为 3600；校验结果：`word_lookup_dataset_partial_check_ok words=3600 remaining=5167`，题库输入覆盖校验持续通过。
- 已新增第 3604–3703 个词形的可审查内容批次，汇总词条数为 3700；校验结果：`word_lookup_dataset_partial_check_ok words=3700 remaining=5067`，题库输入覆盖校验持续通过。
- 已新增第 3704–3803 个词形的可审查内容批次，汇总词条数为 3800；校验结果：`word_lookup_dataset_partial_check_ok words=3800 remaining=4967`，题库输入覆盖校验持续通过。
- 已新增第 3804–3903 个词形的可审查内容批次，汇总词条数为 3900；校验结果：`word_lookup_dataset_partial_check_ok words=3900 remaining=4867`，题库输入覆盖校验持续通过。
- 已新增第 3904–4003 个词形的可审查内容批次，汇总词条数为 4000；校验结果：`word_lookup_dataset_partial_check_ok words=4000 remaining=4767`，题库输入覆盖校验持续通过。
- 已新增第 4004–4103 个词形的可审查内容批次，汇总词条数为 4100；校验结果：`word_lookup_dataset_partial_check_ok words=4100 remaining=4667`，题库输入覆盖校验持续通过。
- 已新增第 4104–4203 个词形的可审查内容批次，汇总词条数为 4200；校验结果：`word_lookup_dataset_partial_check_ok words=4200 remaining=4567`，题库输入覆盖校验持续通过。
- 已新增第 4204–4303 个词形的可审查内容批次，汇总词条数为 4300；校验结果：`word_lookup_dataset_partial_check_ok words=4300 remaining=4467`，题库输入覆盖校验持续通过。
- 已新增第 4304–4403 个词形的可审查内容批次，汇总词条数为 4400；校验结果：`word_lookup_dataset_partial_check_ok words=4400 remaining=4367`，题库输入覆盖校验持续通过。
- 已新增第 4404–4503 个词形的可审查内容批次，汇总词条数为 4500；校验结果：`word_lookup_dataset_partial_check_ok words=4500 remaining=4267`，题库输入覆盖校验持续通过。
- 已新增第 4504–4603 个词形的可审查内容批次，汇总词条数为 4600；校验结果：`word_lookup_dataset_partial_check_ok words=4600 remaining=4167`，题库输入覆盖校验持续通过。
- 已新增第 4604–4703 个词形的可审查内容批次，汇总词条数为 4700；校验结果：`word_lookup_dataset_partial_check_ok words=4700 remaining=4067`，题库输入覆盖校验持续通过。
- 已新增第 4704–4803 个词形的可审查内容批次，汇总词条数为 4800；校验结果：`word_lookup_dataset_partial_check_ok words=4800 remaining=3967`，题库输入覆盖校验持续通过。
- 已新增第 4804–4903 个词形的可审查内容批次，汇总词条数为 4900；校验结果：`word_lookup_dataset_partial_check_ok words=4900 remaining=3867`，题库输入覆盖校验持续通过。
- 已新增第 4904–5003 个词形的可审查内容批次，汇总词条数为 5000；校验结果：`word_lookup_dataset_partial_check_ok words=5000 remaining=3767`，题库输入覆盖校验持续通过。
- 已新增第 5004–5103 个词形的可审查内容批次，汇总词条数为 5100；校验结果：`word_lookup_dataset_partial_check_ok words=5100 remaining=3667`，题库输入覆盖校验持续通过。
- 已新增第 5104–5203 个词形的可审查内容批次，汇总词条数为 5200；校验结果：`word_lookup_dataset_partial_check_ok words=5200 remaining=3567`，题库输入覆盖校验持续通过。
- 已新增第 5204–5303 个词形的可审查内容批次，汇总词条数为 5300；校验结果：`word_lookup_dataset_partial_check_ok words=5300 remaining=3467`，题库输入覆盖校验持续通过。
- 已新增第 5304–5403 个词形的可审查内容批次，汇总词条数为 5400；校验结果：`word_lookup_dataset_partial_check_ok words=5400 remaining=3367`，题库输入覆盖校验持续通过。
- 已新增第 5404–5503 个词形的可审查内容批次，汇总词条数为 5500；校验结果：`word_lookup_dataset_partial_check_ok words=5500 remaining=3267`，题库输入覆盖校验持续通过。
- 已新增第 5504–5603 个词形的可审查内容批次，汇总词条数为 5600；校验结果：`word_lookup_dataset_partial_check_ok words=5600 remaining=3167`，题库输入覆盖校验持续通过。
- 已新增第 5604–5703 个词形的可审查内容批次，汇总词条数为 5700；校验结果：`word_lookup_dataset_partial_check_ok words=5700 remaining=3067`，题库输入覆盖校验持续通过。
- 已新增第 5704–5803 个词形的可审查内容批次，汇总词条数为 5800；校验结果：`word_lookup_dataset_partial_check_ok words=5800 remaining=2967`，题库输入覆盖校验持续通过。
- 已新增第 5804–5903 个词形的可审查内容批次，汇总词条数为 5900；校验结果：`word_lookup_dataset_partial_check_ok words=5900 remaining=2867`，题库输入覆盖校验持续通过。
- 已新增第 5904–6003 个词形的可审查内容批次，汇总词条数为 6000；校验结果：`word_lookup_dataset_partial_check_ok words=6000 remaining=2767`，题库输入覆盖校验持续通过。
- 已新增第 6004–6103 个词形的可审查内容批次，汇总词条数为 6100；校验结果：`word_lookup_dataset_partial_check_ok words=6100 remaining=2667`，题库输入覆盖校验持续通过。
- 已新增第 6104–6203 个词形的可审查内容批次，汇总词条数为 6200；校验结果：`word_lookup_dataset_partial_check_ok words=6200 remaining=2567`，题库输入覆盖校验持续通过。
- 已新增第 6204–6303 个词形的可审查内容批次，汇总词条数为 6300；校验结果：`word_lookup_dataset_partial_check_ok words=6300 remaining=2467`，题库输入覆盖校验持续通过。
- 已新增第 6304–6403 个词形的可审查内容批次，汇总词条数为 6400；校验结果：`word_lookup_dataset_partial_check_ok words=6400 remaining=2367`，题库输入覆盖校验持续通过。
- 已新增第 6404–6503 个词形的可审查内容批次，汇总词条数为 6500；校验结果：`word_lookup_dataset_partial_check_ok words=6500 remaining=2267`，题库输入覆盖校验持续通过。
- 已新增第 6504–6603 个词形的可审查内容批次，汇总词条数为 6600；校验结果：`word_lookup_dataset_partial_check_ok words=6600 remaining=2167`，题库输入覆盖校验持续通过。
- 已新增第 6604–6703 个词形的可审查内容批次，汇总词条数为 6700；校验结果：`word_lookup_dataset_partial_check_ok words=6700 remaining=2067`，题库输入覆盖校验持续通过。
- 已新增第 6704–6803 个词形的可审查内容批次，汇总词条数为 6800；校验结果：`word_lookup_dataset_partial_check_ok words=6800 remaining=1967`，题库输入覆盖校验持续通过。
- 已新增第 6804–6903 个词形的可审查内容批次，汇总词条数为 6900；校验结果：`word_lookup_dataset_partial_check_ok words=6900 remaining=1867`，题库输入覆盖校验持续通过。

## 阶段 3：本地接入（待内容收口）

状态：骨架完成，未验收

- 新增运行时规范化与本地 repository；学习页查词入口已不引用 AI 客户端、认证或 AI 同意状态。
- 弹层仅保留词形、一个美式 IPA、航空释义、常用释义；无原句、本句理解、AI、加载、重试或返回按钮。
- 听力的 `referenceText` 已在行为层与学习页渲染层双重排除；四个选项新增按词长按查词，长按不触发短按作答。
- Web 改为显式“查词”模式：工具栏增加“查词”开关，激活后题干或选项内的可查词使用独立按压目标，悬停或键盘聚焦显示圆角浅蓝背景和指针光标，单击后查词；高亮复用同一交互反馈，两种模式互斥，并移除“高亮中 / 完成”浮动状态条。iOS / Android 保持长按，未改变既有查词手势。
- 已补充针对静态词条、弹层精简、听力遗留答案键隐藏与选项长按的自动测试。全量静态数据完成前，不进行阶段 3/4 的最终验收。
- Web 查词与高亮交互修复已通过类型检查、Lint、全量 App Jest（54 个测试套件、240 个测试）、Web/iOS/Android Expo 导出和静态词表局部覆盖校验。真实 Chrome 鼠标验收因本机浏览器控制插件初始化错误 `Cannot redefine property: process` 未执行；该项保留为全量内容完成后的真实页面验收项目。
