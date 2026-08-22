# 陆空通话音频原文文本规则

> 三类题库共性规则及当前暂停 Whisper 的统一策略见 `docs/resources/domain/audio-text/audio-text-unified-rules.md`。

## 1. 文档目的

本文档用于规范陆空通话题库中 `audioText`（音频原文）的校对、修正和验收方式，保证文本在不改变原意的前提下，符合航空英语术语、陆空通话习惯和 App 展示规范。

本文档是文本治理规则，不是音频转写模型说明，也不授权对题库内容进行自由改写。

## 2. 适用范围

- 题库：陆空通话（`radiotelephony`）。
- 主要字段：`audioText`。
- 当前源数据：`content/question-banks/banks/radiotelephony/topics/`。
- App 内嵌数据：`src/features/question-bank/data/question-bank.json`。
- 首轮规则实现：`tools/radiotelephony-text-correction.mjs`。
- 第二轮增量规则实现：`tools/radiotelephony-text-unification-v2.mjs`。
- 第二轮规范化历史基线：1851 张卡片；后续经独立迁移工作流批准的净新增不受该固定总数限制。

本文档第 5.7 节是第二轮增量规则的例外范围。该节同时覆盖 `audioText`、`audioTextZh`、`referenceText`、`referenceTextZh` 四个字段，其余既有规则仍按原范围执行，不因第二轮处理而重新运行。

除第 5.7 节明确规定的四字段统一外，以下内容不属于既有规则的直接处理范围：

- 中文翻译 `audioTextZh`；
- 参考答案；
- 场景中文标题和目录分组；
- 音频文件与卡片之间的路径映射；
- ASR 模型、热词、提示词及识别参数。

## 3. 核心原则

1. **保持原意**：只修正能够明确判断的问题，不扩写、不删减关键信息，不改变通话意图。
2. **保留事实数据**：航班呼号、航向、高度、跑道、频率、应答机编码和气象数值不得凭推测修改。
3. **规范写法优先**：`audioText` 是供 App 阅读和学习使用的规范文本，不要求机械复制音频中的每一种口语读法。
4. **高置信度优先**：明显拼写、术语和格式问题可以自动修正；涉及语义判断的表达必须保守处理。
5. **单一来源**：先修改题库源数据，再同步生成 App 内嵌数据，不得只修改某一份派生 JSON。
6. **可重复执行**：规则必须幂等；同一规则重复运行不能产生重复词、重复标点或二次变形。
7. **可追溯**：批量修改应保留修改前快照、候选报告、规则编号和逐卡片差异。

## 4. 规则等级

| 等级 | 含义 | 处理方式 |
| --- | --- | --- |
| A 级 | 拼写、术语或格式可以明确判断，基本不涉及语义选择 | 可以通过确定性规则批量修正，修正后统一验证 |
| B 级 | 需要结合固定搭配或明确语境判断，但修改意图仍较清晰 | 可以生成候选，复核后应用；不得继续扩大为自由改写 |

## 5. 文本修正规则

### 5.1 明显转写和拼写错误

修正能够明确识别的转写残留、拼写错误、粘连词和漏字。

| 错误或非规范写法 | 规范写法 | 说明 |
| --- | --- | --- |
| `call sigh`、`callsigh` | `call sign` | 修正呼号术语 |
| `runaway` | `runway` | 仅用于明确的跑道语境 |
| `Lima killer Oscars` | `Lima Kilo Oscar` | 修正 ICAO 字母读法转写错误 |
| `desabled` | `disabled` | 明显拼写错误 |
| `resticted` | `restricted` | 明显拼写错误 |
| `nagative` | `negative` | 明显拼写错误 |
| `maintaine` | `maintain` | 明显拼写错误 |
| `informe` | `inform` | 明显拼写错误 |
| `ineffect` | `in effect` | 拆分粘连词 |
| `intension` | `intention` | 在明确表达意图的语境中修正 |
| `theinstruction` | `the instruction` | 拆分粘连词 |
| `readback the clearance` | `read back the clearance` | `read back` 作动词时分开；名词 `readback` 不盲目替换 |
| `advice` 作动词 | `advise` | 保留句首大小写 |
| `Airbus 3 thirty` | `Airbus 330` | 修正明确的机型数字转写残留 |
| `1 taosand 800 meters` | `1800 meters` | 修正明确的数字转写残留 |
| `You call sign` | `Your call sign` | 修正明显漏字 |
| `fight planned route` | `flight planned route` | 修正固定表达中的拼写错误 |
| `maximum breaks`、`parking breaks` | `maximum brakes`、`parking brakes` | 在制动语境中修正同音误写 |

### 5.2 航空专业术语

| 错误或非规范写法 | 规范写法 |
| --- | --- |
| `working progress` | `work in progress` |
| `taxing` | `taxiing` |
| `breaking action` | `braking action` |
| `radio inbound` | `radial inbound` |
| `be advise` | `be advised` |
| `foam-spay` | `foam spray` |

术语修正必须有明确航空语境。普通英语中的同形词不得因为题库中存在航空规则而被全局替换。

### 5.3 陆空通话表达和词形

此类规则属于 B 级规则，必须确认修改前后的通话意图一致。

| 非规范写法 | 规范写法 |
| --- | --- |
| `ready to takeoff` | `ready for takeoff` |
| `want to de-icing` | `want to de-ice` |
| `need to de-icing` | `need to de-ice` |
| `continue descend and maintain ...` | `continue descent to ...` |
| `continue descend to ...` | `continue descent to ...` |
| `during descending` | `during descent` |
| `initiated descend` | `initiated descent` |
| `initially climb to 6600 meters` | `initial climb 6600 meters` |
| `request fly lower` | `request further descent` |
| `request divert to ...` | `request diversion to ...` |
| `request for a higher level` | `request a higher level` |

不得仅因为一句话“不够自然”就重写整句。规则只处理意图明确、已有固定表达支撑的局部问题。

### 5.4 跑道、高度层和单位格式

| 非规范写法 | 规范写法 | 说明 |
| --- | --- | --- |
| `runway 36 right` | `runway 36R` | 左、右、中分别使用 `L`、`R`、`C` |
| `runway in use 18 left` | `runway in use 18L` | 保留原句结构，只规范跑道后缀 |
| `flight level 390` | `FL390` | 仅处理数字高度层 |
| `metres` | `meters` | 项目统一采用美式拼写 |

音频可能读作 `runway zero two left`、`flight level three nine zero`，App 中仍可采用 `runway 02L`、`FL390` 等规范展示形式。除非以后新增“严格逐字稿”字段，否则不应为了模拟口语读法而覆盖当前规范文本。

### 5.5 航司、管制单位和航空缩写大小写

- 航司与单位名称采用正式大小写，例如 `Air France`、`China Southern`、`Wuhan Control`、`Wuhan Approach`、`Beijing Control`。
- 数值语境中的马赫数写作 `Mach`。
- 航空缩写统一为：`QNH`、`QFE`、`ILS`、`VOR`、`NDB`、`RVR`、`RVSM`、`SELCAL`、`NOTAM`、`ADS-B`、`TCAS`。
- 遇险和紧急状态用语统一为：`MAYDAY`、`PAN PAN`。

大小写规则只规范表示方式，不修改呼号、单位名称或缩写本身。

### 5.6 标点、空格和表面格式

- 英文原文中的中文逗号、句号、分号、冒号、感叹号和问号改为英文标点。
- 删除标点前多余空格。
- 英文逗号后补充必要空格，但不得破坏小数、频率和数字格式。
- 连续多个横向空格合并为一个。
- `B:`、`C:` 等角色标签后统一保留一个空格。
- 保留原有换行和 `<br>` 所表达的对话分段，不因格式清理合并不同发言。

### 5.7 第二轮增量统一：民航字母、进离场代号、航司呼号和 Runway

本节只执行以下四类新增规则，不重新执行第 5.1 至 5.6 节的首轮文本矫正规则。处理范围统一为陆空通话卡片的 `audioText`、`audioTextZh`、`referenceText`、`referenceTextZh`，源题库与 App 内嵌题库必须同步。

#### 5.7.1 民航字母

- ICAO 26 个民航字母词统一转换为对应的大写字母，例如 `Hotel` 转为 `H`。
- 连续民航字母词合并为连续大写字母，例如 `Lima Kilo Oscar` 转为 `LKO`。
- 与民航字母词同属一个代号的数字直接连写，例如 `Alpha 3` 转为 `A3`、`Alpha Alpha 443` 转为 `AA443`、`35 Lima` 转为 `35L`。
- 不得把航路点后表示时间或高度的独立数字误并入航路点，例如 `ZF 1230`、`PEK 600 meters` 保持原有空格；只有能够由民航字母词及其所属数字明确构成的代号才紧凑处理。

#### 5.7.2 进离场代号

- 统一写作“代码-原数字及后缀”，代号和 `arrival`、`departure`、`进场`、`离场` 之间保留一个空格。
- 保持原数字位数，不补零、不删零；字母后缀紧接数字。
- 示例：`Hotel Zulu 01 departure` 转为 `HZ-01 departure`；`Zulu Foxtrot 01 Alpha arrival` 转为 `ZF-01A arrival`；`Lima Kilo Oscar 2 Alpha arrival` 转为 `LKO-2A arrival`。
- 不得省略原有 `arrival`、`departure`、`进场` 或 `离场`。

#### 5.7.3 航司和呼号

- 中英文字段都使用三字代码，不保留航司英文全称或改写为中文航司名称。
- 三字代码与原航班号数字之间统一保留一个半角空格，例如 `QFA 432`；不得根据场景标题推测或改写航班号数字。
- 航司映射如下：

| 航司原写法 | 统一代码 |
| --- | --- |
| `Qantas` | `QFA` |
| `Singapore` | `SIA` |
| `Air France` | `AFR` |
| `Speedbird`、`British Airways` | `BAW` |
| `United` | `UAL` |
| `KLM` | `KLM` |
| `Japan Air` | `JAL` |
| `Air Canada` | `ACA` |
| `Air China` | `CCA` |
| `China Southern` | `CSN` |
| `China Eastern` | `CES` |

- 当前只出现在 `atc-csn` 题组呼号位置的裸 `China` 同样转为 `CSN`；不得将其他语境中的国家名称 `China` 盲目替换。
- 无法确定的航司别名只进入候选报告，不猜测替换。

#### 5.7.4 Runway 大小写

- 英文 `runway` 后面直接跟跑道数字及可选的 `L`、`R`、`C` 后缀时，统一写作 `Runway 36R`、`Runway 08L`、`Runway 26`。
- 其他位置统一使用小写 `runway`，例如 `runway in use`、`runway condition`；仅当后续再次出现直接连接跑道号的 `runway` 时才大写。
- `runway in use runway 26` 统一为 `runway in use Runway 26`。
- 规则兼容 `runway`、`Runway`、`RUNWAY` 等现有变体，只调整单词首字母，不修改跑道数字或后缀。

## 6. 明确禁止的处理

- 不得依据单次 ASR 输出直接批量覆盖现有 `audioText`。
- 不得把 Whisper 或其他 ASR 识别结果默认视为比现有规范文本更准确。
- 不得把 `432`、`ACA702`、`02L` 等规范写法强制展开成音频口语形式。
- 不得猜测或改写呼号、跑道、航向、高度、频率、时间和应答机编码。
- 除第 5.7 节明确要求的四字段统一外，不得顺手修改中文翻译、参考答案、标题或目录结构。
- 不得移除 `B:`、`C:` 等展示标签，除非先建立独立字段并完成数据迁移。
- 不得使用宽泛的全局替换处理需要语境判断的词语。

## 7. 音频校准边界

音频抽查用于发现以下问题：

- 音频和卡片是否错配；
- 当前文本是否遗漏关键信息；
- 现有写法与音频口语形式是否只是等价表达；
- `B:`、`C:`、词数等未播出的展示信息是否混在原文字段中。

音频抽查不等于直接替换。发现差异后，应先判断属于：

1. 文本确有错误；
2. 音频与卡片映射错误；
3. 口语形式与规范写法等价；
4. 展示元数据混入文本；
5. ASR 自身识别错误。

只有第一类可以进入本文档的文本修正规则；第二类应进入音频映射流程，其余类型应分别处理。

## 8. 执行和验收流程

1. 从题库源数据读取全部陆空通话卡片。
2. 保存修改前 `audioText` 快照。
3. 先生成候选报告，不直接写入。
4. 按规则编号、置信度、修改前后文本进行复核。
5. 将通过复核的规则应用到源数据。
6. 重新生成并同步 App 内嵌题库数据。
7. 再次执行规则，确认没有残留候选，且重复运行不会继续修改文本。
8. 检查卡片总数、稳定 ID、音频路径及非目标字段未发生变化。
9. 运行题库内容校验和项目检查。

当前验证命令：

```bash
node tools/radiotelephony-text-correction.mjs audit
node tools/radiotelephony-text-correction.mjs verify
pnpm check
```

第二轮增量规则使用独立命令和独立快照、报告，不覆盖首轮记录：

```bash
node tools/radiotelephony-text-unification-v2.mjs audit
node tools/radiotelephony-text-unification-v2.mjs apply
node tools/radiotelephony-text-unification-v2.mjs verify
```

验收至少满足：

- 陆空通话卡片数量符合当前题库基线；
- 源数据与 App 内嵌数据的 `audioText` 一致；
- 没有未应用的既定规则；
- 重复执行不会产生新修改；
- 卡片 ID、音频映射和其他非目标字段不变。

## 9. 既有执行记录

2026 年 7 月的系统规范化覆盖 1851 张陆空通话卡片，修改 445 张卡片，共触发 499 次规则转换：

| 分类 | 规则命中次数 |
| --- | ---: |
| 转写与拼写 | 43 |
| 航空术语 | 24 |
| 陆空通话表达 | 23 |
| 标准格式 | 361 |
| 标点与空格 | 48 |

其中 A 级规则命中 476 次，B 级规则命中 23 次。该统计是既有执行记录，不是未来数据规模或修改数量的固定验收条件。

详细历史差异见 `docs/records/workstreams/radiotelephony-text-correction/candidate-report.md`。
