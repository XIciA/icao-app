# Aviation Hotwords

本文档集中管理 ICAO / 民航英语 ASR 热词和缩写规则。通用维护规则见 `README.md`。

## 1. Scope

- 项目: 主要用途
  说明: 帮助 ASR 识别民航高频词、缩写和常见变体

- 项目: 不负责
  说明: 不做语法纠错、不做润色、不生成标准答案

## 2. 核心高频词

- ID: HW-001
  Category: communication
  Hotword: ATC
  Common Variants: air traffic control
  Notes: 必须保持大写
  Status: ready

- ID: HW-002
  Category: runway
  Hotword: runway
  Common Variants: run way
  Notes: 跑道相关核心词
  Status: ready

- ID: HW-003
  Category: heading
  Hotword: heading
  Common Variants: head in
  Notes: 航向相关核心词
  Status: ready

- ID: HW-004
  Category: altitude
  Hotword: altitude
  Common Variants: altitudes
  Notes: 高度相关核心词
  Status: ready

- ID: HW-005
  Category: altitude
  Hotword: flight level
  Common Variants: flight levels
  Notes: FL 的完整说法
  Status: ready

- ID: HW-006
  Category: altitude
  Hotword: FL
  Common Variants: flight level
  Notes: 常见缩写
  Status: ready

- ID: HW-007
  Category: altimeter
  Hotword: QNH
  Common Variants: q n h
  Notes: 高度表拨正值
  Status: ready

- ID: HW-008
  Category: altimeter
  Hotword: QFE
  Common Variants: q f e
  Notes: 场压相关
  Status: ready

- ID: HW-009
  Category: transponder
  Hotword: squawk
  Common Variants: squawk code
  Notes: 应答机编码
  Status: ready

- ID: HW-010
  Category: procedure
  Hotword: approach
  Common Variants: approaches
  Notes: 进近
  Status: ready

- ID: HW-011
  Category: procedure
  Hotword: departure
  Common Variants: departures
  Notes: 离场
  Status: ready

- ID: HW-012
  Category: altitude
  Hotword: descend
  Common Variants: descending, descent
  Notes: 下降
  Status: ready

- ID: HW-013
  Category: altitude
  Hotword: climb
  Common Variants: climbing
  Notes: 爬升
  Status: ready

- ID: HW-014
  Category: clearance
  Hotword: maintain
  Common Variants: maintaining
  Notes: 保持高度 / 航向
  Status: ready

- ID: HW-015
  Category: clearance
  Hotword: cleared
  Common Variants: clearance
  Notes: 放行 / 许可
  Status: ready

- ID: HW-016
  Category: weather
  Hotword: deviation
  Common Variants: deviate, deviating
  Notes: 绕飞 / 偏航
  Status: ready

- ID: HW-017
  Category: weather
  Hotword: turbulence
  Common Variants: turbulent
  Notes: 颠簸
  Status: ready

- ID: HW-018
  Category: weather
  Hotword: thunderstorm
  Common Variants: thunderstorms
  Notes: 雷暴
  Status: ready

- ID: HW-019
  Category: weather
  Hotword: windshear
  Common Variants: wind shear
  Notes: 风切变；两种写法都应识别
  Status: ready

- ID: HW-020
  Category: weather
  Hotword: visibility
  Common Variants: visual
  Notes: 能见度
  Status: ready

- ID: HW-021
  Category: procedure
  Hotword: holding
  Common Variants: hold, holding pattern
  Notes: 等待程序
  Status: ready

- ID: HW-022
  Category: procedure
  Hotword: go around
  Common Variants: go-around
  Notes: 复飞
  Status: ready

- ID: HW-023
  Category: emergency
  Hotword: mayday
  Common Variants: may day
  Notes: 遇险呼叫
  Status: ready

- ID: HW-024
  Category: urgency
  Hotword: pan-pan
  Common Variants: pan pan
  Notes: 紧急呼叫
  Status: ready

## 3. 可扩展热词

- ID: HWX-001
  Category: navigation
  Hotword: ILS
  Notes: 仪表着陆系统
  Status: ready

- ID: HWX-002
  Category: navigation
  Hotword: VOR
  Notes: 导航台
  Status: ready

- ID: HWX-003
  Category: navigation
  Hotword: DME
  Notes: 测距设备
  Status: ready

- ID: HWX-004
  Category: navigation
  Hotword: RNAV
  Notes: 区域导航
  Status: ready

- ID: HWX-005
  Category: procedure
  Hotword: SID
  Notes: 标准仪表离场
  Status: ready

- ID: HWX-006
  Category: procedure
  Hotword: STAR
  Notes: 标准仪表进场
  Status: ready

- ID: HWX-007
  Category: runway
  Hotword: holding point
  Notes: 等待点
  Status: ready

- ID: HWX-008
  Category: runway
  Hotword: line up
  Notes: 进跑道对正
  Status: ready

- ID: HWX-009
  Category: runway
  Hotword: takeoff
  Notes: 起飞
  Status: ready

- ID: HWX-010
  Category: runway
  Hotword: landing
  Notes: 着陆
  Status: ready

- ID: HWX-011
  Category: procedure
  Hotword: missed approach
  Notes: 复飞程序
  Status: ready

- ID: HWX-012
  Category: emergency
  Hotword: emergency descent
  Notes: 紧急下降
  Status: ready

- ID: HWX-013
  Category: emergency
  Hotword: engine failure
  Notes: 发动机失效
  Status: ready

- ID: HWX-014
  Category: emergency
  Hotword: medical emergency
  Notes: 医疗紧急情况
  Status: ready

## 4. 缩写和格式规则

- ID: AB-001
  Raw / Possible ASR Output: atc
  Normalized Form: ATC
  Rule Type: uppercase
  Status: ready

- ID: AB-002
  Raw / Possible ASR Output: air traffic control
  Normalized Form: air traffic control
  Rule Type: keep
  Status: ready

- ID: AB-003
  Raw / Possible ASR Output: qnh
  Normalized Form: QNH
  Rule Type: uppercase
  Status: ready

- ID: AB-004
  Raw / Possible ASR Output: q n h
  Normalized Form: QNH
  Rule Type: collapse-if-clear
  Status: ready

- ID: AB-005
  Raw / Possible ASR Output: qfe
  Normalized Form: QFE
  Rule Type: uppercase
  Status: ready

- ID: AB-006
  Raw / Possible ASR Output: q f e
  Normalized Form: QFE
  Rule Type: collapse-if-clear
  Status: ready

- ID: AB-007
  Raw / Possible ASR Output: fl
  Normalized Form: FL
  Rule Type: uppercase
  Status: ready

- ID: AB-008
  Raw / Possible ASR Output: f l
  Normalized Form: FL
  Rule Type: collapse-if-clear
  Status: ready

- ID: AB-009
  Raw / Possible ASR Output: ils
  Normalized Form: ILS
  Rule Type: uppercase
  Status: ready

- ID: AB-010
  Raw / Possible ASR Output: vor
  Normalized Form: VOR
  Rule Type: uppercase
  Status: ready

- ID: AB-011
  Raw / Possible ASR Output: dme
  Normalized Form: DME
  Rule Type: uppercase
  Status: ready

- ID: AB-012
  Raw / Possible ASR Output: rnav
  Normalized Form: RNAV
  Rule Type: uppercase
  Status: ready

- ID: AB-013
  Raw / Possible ASR Output: pan pan
  Normalized Form: pan-pan
  Rule Type: hyphenate
  Status: ready

- ID: AB-014
  Raw / Possible ASR Output: pan-pan
  Normalized Form: pan-pan
  Rule Type: keep
  Status: ready

- ID: AB-015
  Raw / Possible ASR Output: may day
  Normalized Form: mayday
  Rule Type: collapse-if-clear
  Status: ready

- ID: AB-016
  Raw / Possible ASR Output: wind shear
  Normalized Form: windshear
  Rule Type: normalize-term
  Status: ready
