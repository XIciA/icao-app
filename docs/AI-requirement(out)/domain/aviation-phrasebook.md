# Aviation Phrasebook

本文档管理 ICAO / 民航英语常见短语。通用维护规则见 `README.md`，状态定义见 `../shared/content-asset-structure-v1.md`。

## 1. Scope

- 项目: 主要用途
  说明: 服务 ASR phrase hints、word-lookup 的短语解释、polish 的口语表达风格

- 项目: 重要边界
  说明: 短语可以提示识别和表达选择，但不能自动补全用户没说的话

## 2. 数字和指令短语

- ID: PH-001
  Phrase Hint: runway two seven
  Target Format: runway 27
  Related Hotwords: runway
  Notes: 可作为 normalization 参考
  Status: ready

- ID: PH-002
  Phrase Hint: runway two seven left
  Target Format: runway 27L
  Related Hotwords: runway
  Notes: 带跑道方向后缀
  Status: ready

- ID: PH-003
  Phrase Hint: heading one eight zero
  Target Format: heading 180
  Related Hotwords: heading
  Notes: 三位航向
  Status: ready

- ID: PH-004
  Phrase Hint: flight level two niner zero
  Target Format: FL290
  Related Hotwords: flight level, FL
  Notes: 标准 FL 示例
  Status: ready

- ID: PH-005
  Phrase Hint: FL two niner zero
  Target Format: FL290
  Related Hotwords: FL
  Notes: ASR 可能听到缩写
  Status: ready

- ID: PH-006
  Phrase Hint: QNH one zero one three
  Target Format: QNH 1013
  Related Hotwords: QNH
  Notes: 气压值示例
  Status: ready

- ID: PH-007
  Phrase Hint: QFE one zero one three
  Target Format: QFE 1013
  Related Hotwords: QFE
  Notes: 场压示例
  Status: ready

- ID: PH-008
  Phrase Hint: squawk seven five zero zero
  Target Format: squawk 7500
  Related Hotwords: squawk
  Notes: 应答机编码示例
  Status: ready

- ID: PH-009
  Phrase Hint: altitude three thousand feet
  Target Format: altitude 3000 feet
  Related Hotwords: altitude
  Notes: v1 建议 hint-only，不自动转数字
  Status: hint-only

- ID: PH-010
  Phrase Hint: maintain flight level two niner zero
  Target Format: maintain FL290
  Related Hotwords: maintain, flight level
  Notes: 可拆分处理，不强制整句改写
  Status: hint-only

## 3. 放行 / 管制短语

- ID: PH-011
  Phrase Hint: cleared for takeoff
  Target Format: cleared for takeoff
  Related Hotwords: cleared, takeoff
  Notes: 不改写语法
  Status: ready

- ID: PH-012
  Phrase Hint: cleared to land
  Target Format: cleared to land
  Related Hotwords: cleared, landing
  Notes: 不改写语法
  Status: ready

- ID: PH-013
  Phrase Hint: line up and wait
  Target Format: line up and wait
  Related Hotwords: line up
  Notes: 美式常见表达
  Status: ready

- ID: PH-014
  Phrase Hint: maintain runway heading
  Target Format: maintain runway heading
  Related Hotwords: maintain, runway, heading
  Notes: 常见离场指令
  Status: ready

- ID: PH-015
  Phrase Hint: maintain altitude
  Target Format: maintain altitude
  Related Hotwords: maintain, altitude
  Notes: 高度保持
  Status: ready

- ID: PH-016
  Phrase Hint: maintain flight level
  Target Format: maintain flight level
  Related Hotwords: maintain, flight level
  Notes: 高度层保持
  Status: ready

- ID: PH-017
  Phrase Hint: descend to altitude
  Target Format: descend to altitude
  Related Hotwords: descend, altitude
  Notes: 下降到高度
  Status: ready

- ID: PH-018
  Phrase Hint: descend to flight level
  Target Format: descend to flight level
  Related Hotwords: descend, flight level
  Notes: 下降到高度层
  Status: ready

- ID: PH-019
  Phrase Hint: climb to altitude
  Target Format: climb to altitude
  Related Hotwords: climb, altitude
  Notes: 爬升到高度
  Status: ready

- ID: PH-020
  Phrase Hint: climb to flight level
  Target Format: climb to flight level
  Related Hotwords: climb, flight level
  Notes: 爬升到高度层
  Status: ready

## 4. 天气 / 绕飞短语

- ID: PH-021
  Phrase Hint: request deviation
  Target Format: request deviation
  Related Hotwords: deviation
  Notes: 不补全原因
  Status: ready

- ID: PH-022
  Phrase Hint: request weather deviation
  Target Format: request weather deviation
  Related Hotwords: deviation, weather
  Notes: 天气绕飞
  Status: ready

- ID: PH-023
  Phrase Hint: due to thunderstorm
  Target Format: due to thunderstorm
  Related Hotwords: thunderstorm
  Notes: 不自动补到句子里
  Status: ready

- ID: PH-024
  Phrase Hint: due to turbulence
  Target Format: due to turbulence
  Related Hotwords: turbulence
  Notes: 不自动补到句子里
  Status: ready

- ID: PH-025
  Phrase Hint: due to windshear
  Target Format: due to windshear
  Related Hotwords: windshear
  Notes: 保持用户原表达
  Status: ready

- ID: PH-026
  Phrase Hint: poor visibility
  Target Format: poor visibility
  Related Hotwords: visibility
  Notes: 能见度低
  Status: ready

- ID: PH-027
  Phrase Hint: severe turbulence
  Target Format: severe turbulence
  Related Hotwords: turbulence
  Notes: 严重颠簸
  Status: ready

- ID: PH-028
  Phrase Hint: avoid thunderstorm
  Target Format: avoid thunderstorm
  Related Hotwords: thunderstorm
  Notes: 避让雷暴
  Status: ready

## 5. 进近 / 复飞 / 等待短语

- ID: PH-029
  Phrase Hint: continue approach
  Target Format: continue approach
  Related Hotwords: approach
  Notes: 继续进近
  Status: ready

- ID: PH-030
  Phrase Hint: runway in sight
  Target Format: runway in sight
  Related Hotwords: runway
  Notes: 看到跑道
  Status: ready

- ID: PH-031
  Phrase Hint: go around
  Target Format: go around
  Related Hotwords: go around
  Notes: 复飞
  Status: ready

- ID: PH-032
  Phrase Hint: missed approach
  Target Format: missed approach
  Related Hotwords: approach
  Notes: 复飞程序
  Status: ready

- ID: PH-033
  Phrase Hint: enter holding
  Target Format: enter holding
  Related Hotwords: holding
  Notes: 进入等待
  Status: ready

- ID: PH-034
  Phrase Hint: holding pattern
  Target Format: holding pattern
  Related Hotwords: holding
  Notes: 等待程序
  Status: ready

## 6. 紧急情况短语

- ID: PH-035
  Phrase Hint: mayday mayday mayday
  Target Format: mayday mayday mayday
  Related Hotwords: mayday
  Notes: 遇险呼叫，通常重复三次
  Status: ready

- ID: PH-036
  Phrase Hint: pan-pan pan-pan pan-pan
  Target Format: pan-pan pan-pan pan-pan
  Related Hotwords: pan-pan
  Notes: 紧急呼叫，通常重复三次
  Status: ready

- ID: PH-037
  Phrase Hint: engine failure
  Target Format: engine failure
  Related Hotwords: engine failure
  Notes: 发动机失效
  Status: ready

- ID: PH-038
  Phrase Hint: emergency descent
  Target Format: emergency descent
  Related Hotwords: emergency descent
  Notes: 紧急下降
  Status: ready

- ID: PH-039
  Phrase Hint: loss of communication
  Target Format: loss of communication
  Related Hotwords: communication
  Notes: 通信失效
  Status: ready

- ID: PH-040
  Phrase Hint: medical emergency
  Target Format: medical emergency
  Related Hotwords: medical emergency
  Notes: 医疗紧急情况
  Status: ready

## 7. Polish 可参考表达样本

- ID: PP-001
  User Intent: 告诉管制
  Preferred Aviation Expression: advise ATC
  Notes: 比 tell ATC 更贴近民航口语
  Status: ready

- ID: PP-002
  User Intent: 绕飞天气
  Preferred Aviation Expression: request deviation
  Notes: 简洁常用
  Status: ready

- ID: PP-003
  User Intent: 保持飞机控制
  Preferred Aviation Expression: maintain aircraft control
  Notes: 紧急处置常用
  Status: ready

- ID: PP-004
  User Intent: 恶劣天气
  Preferred Aviation Expression: adverse weather
  Notes: 比 bad weather 更正式
  Status: ready
