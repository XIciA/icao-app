# Aviation Terminology

本文档集中管理 ICAO / 民航英语术语解释。通用维护规则见 `README.md`。

## 1. Scope

- 项目: 主要用途
  说明: 统一术语含义、中文解释、常见搭配和适用能力

- 项目: 主要服务能力
  说明: `word-lookup`

- 项目: 间接服务能力
  说明: `transcribe`，只抽取适合 ASR 的术语作为 hotwords

## 2. 字段说明

- 字段: ID
  说明: 稳定编号，方便引用

- 字段: Term
  说明: 标准术语

- 字段: Category
  说明: 术语类别

- 字段: Plain Meaning
  说明: 通用含义

- 字段: Aviation Meaning Zh
  说明: 民航语境中文解释

- 字段: Common Collocations
  说明: 常见搭配

- 字段: Use For
  说明: 适用 AI 能力

- 字段: Notes
  说明: 使用边界或提醒

- 字段: Status
  说明: 当前状态

## 3. 核心术语初版

- ID: TER-001
  Term: ATC
  Category: communication
  Plain Meaning: air traffic control
  Aviation Meaning Zh: 空中交通管制或管制员/管制单位
  Common Collocations: advise ATC, contact ATC, ATC clearance
  Use For: transcribe, word-lookup
  Notes: 转写中保持大写
  Status: ready

- ID: TER-002
  Term: runway
  Category: runway
  Plain Meaning: a prepared surface for aircraft takeoff and landing
  Aviation Meaning Zh: 跑道
  Common Collocations: runway 27, runway in sight, runway heading
  Use For: transcribe, word-lookup
  Notes: runway 后的数字可按跑道号处理
  Status: ready

- ID: TER-003
  Term: heading
  Category: navigation
  Plain Meaning: direction
  Aviation Meaning Zh: 航向，通常用三位数字表示
  Common Collocations: heading 180, maintain runway heading
  Use For: transcribe, word-lookup
  Notes: 不等同于 route
  Status: ready

- ID: TER-004
  Term: altitude
  Category: altitude
  Plain Meaning: height above a level
  Aviation Meaning Zh: 高度，通常指海拔高度或指令高度
  Common Collocations: maintain altitude, descend to altitude
  Use For: transcribe, word-lookup
  Notes: 与 flight level 区分
  Status: ready

- ID: TER-005
  Term: flight level
  Category: altitude
  Plain Meaning: pressure altitude level
  Aviation Meaning Zh: 飞行高度层，通常写作 FL 加三位数字
  Common Collocations: flight level two niner zero, maintain FL290
  Use For: transcribe, word-lookup
  Notes: 可规范为 `FL290` 这类格式
  Status: ready

- ID: TER-006
  Term: FL
  Category: altitude
  Plain Meaning: abbreviation for flight level
  Aviation Meaning Zh: flight level 的缩写
  Common Collocations: FL290, descend to FL290
  Use For: transcribe, word-lookup
  Notes: 转写中保持大写且常与数字连写
  Status: ready

- ID: TER-007
  Term: QNH
  Category: altimeter
  Plain Meaning: altimeter setting relative to mean sea level
  Aviation Meaning Zh: 修正海压，用于高度表显示海拔高度
  Common Collocations: QNH 1013, set QNH
  Use For: transcribe, word-lookup
  Notes: 转写中保持大写
  Status: ready

- ID: TER-008
  Term: QFE
  Category: altimeter
  Plain Meaning: altimeter setting relative to field elevation
  Aviation Meaning Zh: 场压，用于高度表显示相对机场标高高度
  Common Collocations: QFE 1013, set QFE
  Use For: transcribe, word-lookup
  Notes: 转写中保持大写
  Status: ready

- ID: TER-009
  Term: squawk
  Category: transponder
  Plain Meaning: transponder code instruction
  Aviation Meaning Zh: 应答机编码或设置应答机编码
  Common Collocations: squawk 7500, squawk code
  Use For: transcribe, word-lookup
  Notes: 代码通常逐位读
  Status: ready

- ID: TER-010
  Term: approach
  Category: procedure
  Plain Meaning: to move closer
  Aviation Meaning Zh: 进近或进近程序
  Common Collocations: continue approach, approach clearance
  Use For: transcribe, word-lookup
  Notes: 不是普通“靠近”优先
  Status: ready

- ID: TER-011
  Term: departure
  Category: procedure
  Plain Meaning: leaving
  Aviation Meaning Zh: 离场或离场程序
  Common Collocations: departure clearance, departure frequency
  Use For: transcribe, word-lookup
  Notes: 结合上下文解释
  Status: ready

- ID: TER-012
  Term: descend
  Category: altitude
  Plain Meaning: move downward
  Aviation Meaning Zh: 下降到指定高度或高度层
  Common Collocations: descend to altitude, descend to FL290
  Use For: transcribe
  Notes: 常与 `to` 搭配
  Status: ready

- ID: TER-013
  Term: climb
  Category: altitude
  Plain Meaning: move upward
  Aviation Meaning Zh: 爬升到指定高度或高度层
  Common Collocations: climb to altitude, climb to FL290
  Use For: transcribe
  Notes: 常与 `to` 搭配
  Status: ready

- ID: TER-014
  Term: maintain
  Category: clearance
  Plain Meaning: keep something unchanged
  Aviation Meaning Zh: 按指令保持高度、航向或速度
  Common Collocations: maintain FL290, maintain heading
  Use For: word-lookup
  Notes: 比 keep 更贴近管制指令
  Status: ready

- ID: TER-015
  Term: cleared
  Category: clearance
  Plain Meaning: allowed
  Aviation Meaning Zh: 获得管制许可
  Common Collocations: cleared for takeoff, cleared to land
  Use For: transcribe, word-lookup
  Notes: 不等同于 cleaned
  Status: ready

- ID: TER-016
  Term: deviation
  Category: navigation
  Plain Meaning: difference from normal
  Aviation Meaning Zh: 偏航、绕飞、偏离原航路
  Common Collocations: request deviation, weather deviation
  Use For: word-lookup
  Notes: 常用于天气绕飞
  Status: ready

- ID: TER-017
  Term: turbulence
  Category: weather
  Plain Meaning: irregular air movement
  Aviation Meaning Zh: 颠簸
  Common Collocations: severe turbulence, due to turbulence
  Use For: transcribe, word-lookup
  Notes: 可做 ASR 热词
  Status: ready

- ID: TER-018
  Term: thunderstorm
  Category: weather
  Plain Meaning: storm with thunder
  Aviation Meaning Zh: 雷暴
  Common Collocations: avoid thunderstorm, due to thunderstorm
  Use For: transcribe, word-lookup
  Notes: 不自动补全原因
  Status: ready

- ID: TER-019
  Term: windshear
  Category: weather
  Plain Meaning: sudden wind change
  Aviation Meaning Zh: 风切变
  Common Collocations: windshear warning, due to windshear
  Use For: transcribe, word-lookup
  Notes: `wind shear` 也可接受
  Status: ready

- ID: TER-020
  Term: visibility
  Category: weather
  Plain Meaning: how far one can see
  Aviation Meaning Zh: 能见度
  Common Collocations: poor visibility, reduced visibility
  Use For: transcribe, word-lookup
  Notes: 视上下文解释
  Status: ready

- ID: TER-021
  Term: holding
  Category: procedure
  Plain Meaning: waiting
  Aviation Meaning Zh: 等待程序或保持等待
  Common Collocations: holding pattern, enter holding
  Use For: transcribe, word-lookup
  Notes: 不等同普通 holding something
  Status: ready

- ID: TER-022
  Term: go around
  Category: procedure
  Plain Meaning: abort landing and climb away
  Aviation Meaning Zh: 复飞
  Common Collocations: go around, initiate a go-around
  Use For: transcribe
  Notes: 作为短语整体理解
  Status: ready

- ID: TER-023
  Term: mayday
  Category: emergency
  Plain Meaning: distress call
  Aviation Meaning Zh: 遇险呼叫
  Common Collocations: mayday mayday mayday
  Use For: transcribe, word-lookup
  Notes: 不自动补成完整遇险报文
  Status: ready

- ID: TER-024
  Term: pan-pan
  Category: urgency
  Plain Meaning: urgency call
  Aviation Meaning Zh: 紧急呼叫，低于 mayday 的紧急程度
  Common Collocations: pan-pan pan-pan pan-pan
  Use For: transcribe, word-lookup
  Notes: 保留连字符格式
  Status: ready

## 4. 待扩展术语样本

- ID: TERX-001
  Term: ILS
  Category: navigation
  Aviation Meaning Zh: 仪表着陆系统
  Common Collocations: ILS approach
  Use For: word-lookup, transcribe
  Status: ready

- ID: TERX-002
  Term: VOR
  Category: navigation
  Aviation Meaning Zh: 甚高频全向信标
  Common Collocations: VOR approach, VOR radial
  Use For: word-lookup, transcribe
  Status: ready

- ID: TERX-003
  Term: DME
  Category: navigation
  Aviation Meaning Zh: 测距设备
  Common Collocations: DME distance
  Use For: word-lookup, transcribe
  Status: ready

- ID: TERX-004
  Term: RNAV
  Category: navigation
  Aviation Meaning Zh: 区域导航
  Common Collocations: RNAV approach
  Use For: word-lookup, transcribe
  Status: ready

- ID: TERX-005
  Term: SID
  Category: procedure
  Aviation Meaning Zh: 标准仪表离场程序
  Common Collocations: SID departure
  Use For: word-lookup
  Status: ready

- ID: TERX-006
  Term: STAR
  Category: procedure
  Aviation Meaning Zh: 标准仪表进场程序
  Common Collocations: STAR arrival
  Use For: word-lookup
  Status: ready

- ID: TERX-007
  Term: holding point
  Category: runway
  Aviation Meaning Zh: 跑道等待点
  Common Collocations: hold at holding point
  Use For: transcribe, word-lookup
  Status: ready

- ID: TERX-008
  Term: line up
  Category: runway
  Aviation Meaning Zh: 进跑道对正
  Common Collocations: line up and wait
  Use For: transcribe
  Status: ready

- ID: TERX-009
  Term: missed approach
  Category: procedure
  Aviation Meaning Zh: 复飞程序
  Common Collocations: missed approach procedure
  Use For: word-lookup
  Status: ready

- ID: TERX-010
  Term: emergency descent
  Category: emergency
  Aviation Meaning Zh: 紧急下降
  Common Collocations: initiate emergency descent
  Use For: word-lookup
  Status: ready

- ID: TERX-011
  Term: engine failure
  Category: emergency
  Aviation Meaning Zh: 发动机失效
  Common Collocations: engine failure after takeoff
  Use For: word-lookup
  Status: ready

- ID: TERX-012
  Term: medical emergency
  Category: emergency
  Aviation Meaning Zh: 医疗紧急情况
  Common Collocations: declare medical emergency
  Use For: word-lookup
  Status: ready
