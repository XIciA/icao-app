# 历史归档：Aviation Number And Letter Readings

本文档管理 ICAO / 民航英语中的数字和字母读法。通用维护规则见 `README.md`，状态定义见 `../shared/content-asset-structure-v1.md`。

## 1. Scope

- 项目: 主要用途
  说明: 为 ASR hints 和转写后 normalization 提供数字和字母读法参考

- 项目: 优先场景
  说明: FL、runway、heading、QNH、QFE、squawk、taxiway、ATIS information、registration、navaid identifier、airspace class

- 项目: v1 边界
  说明: 不处理所有高度、速度、频率场景；不把无明确上下文的普通单词强行转换成字母

## 2. 单个数字读法

- Digit: 0
  Common Learner Reading: zero
  ICAO / Aviation Variant: zero
  Normalized Digit: 0
  Notes: QNH / squawk / heading 常见

- Digit: 1
  Common Learner Reading: one
  ICAO / Aviation Variant: wun / one
  Normalized Digit: 1
  Notes: 当前先记录 one

- Digit: 2
  Common Learner Reading: two
  ICAO / Aviation Variant: too / two
  Normalized Digit: 2
  Notes: 当前先记录 two

- Digit: 3
  Common Learner Reading: three
  ICAO / Aviation Variant: tree
  Normalized Digit: 3
  Notes: ASR 应接受两种

- Digit: 4
  Common Learner Reading: four
  ICAO / Aviation Variant: fower
  Normalized Digit: 4
  Notes: ASR 应接受两种

- Digit: 5
  Common Learner Reading: five
  ICAO / Aviation Variant: fife
  Normalized Digit: 5
  Notes: ASR 应接受两种

- Digit: 6
  Common Learner Reading: six
  ICAO / Aviation Variant: six
  Normalized Digit: 6
  Notes:

- Digit: 7
  Common Learner Reading: seven
  ICAO / Aviation Variant: seven
  Normalized Digit: 7
  Notes:

- Digit: 8
  Common Learner Reading: eight
  ICAO / Aviation Variant: ait / eight
  Normalized Digit: 8
  Notes: 当前先记录 eight

- Digit: 9
  Common Learner Reading: nine
  ICAO / Aviation Variant: niner
  Normalized Digit: 9
  Notes: FL 场景常见 niner

## 3. 重点数字场景

- ID: NR-001
  Type: flight-level
  Written Form: FL290
  Spoken Form: flight level two niner zero
  Normalized Form: FL290
  v1 Action: normalize-if-clear
  Notes: 高度层三位数字

- ID: NR-002
  Type: flight-level
  Written Form: FL290
  Spoken Form: FL two niner zero
  Normalized Form: FL290
  v1 Action: normalize-if-clear
  Notes: ASR 可能直接输出 FL

- ID: NR-003
  Type: runway
  Written Form: runway 27
  Spoken Form: runway two seven
  Normalized Form: runway 27
  v1 Action: normalize-if-clear
  Notes: 两位跑道号

- ID: NR-004
  Type: runway
  Written Form: runway 27L
  Spoken Form: runway two seven left
  Normalized Form: runway 27L
  v1 Action: normalize-if-clear
  Notes: 左跑道后缀

- ID: NR-005
  Type: runway
  Written Form: runway 09
  Spoken Form: runway zero niner
  Normalized Form: runway 09
  v1 Action: hint-only
  Notes: 是否保留前导 0 后续再定

- ID: NR-006
  Type: heading
  Written Form: heading 180
  Spoken Form: heading one eight zero
  Normalized Form: heading 180
  v1 Action: normalize-if-clear
  Notes: 三位航向

- ID: NR-007
  Type: heading
  Written Form: heading 090
  Spoken Form: heading zero niner zero
  Normalized Form: heading 090
  v1 Action: hint-only
  Notes: 前导 0 后续再定

- ID: NR-008
  Type: qnh
  Written Form: QNH 1013
  Spoken Form: QNH one zero one three
  Normalized Form: QNH 1013
  v1 Action: normalize-if-clear
  Notes: 四位气压

- ID: NR-009
  Type: qfe
  Written Form: QFE 1013
  Spoken Form: QFE one zero one three
  Normalized Form: QFE 1013
  v1 Action: normalize-if-clear
  Notes: 四位气压

- ID: NR-010
  Type: squawk
  Written Form: squawk 7500
  Spoken Form: squawk seven five zero zero
  Normalized Form: squawk 7500
  v1 Action: normalize-if-clear
  Notes: 四位应答机编码

- ID: NR-011
  Type: altitude
  Written Form: altitude 3000 feet
  Spoken Form: altitude three thousand feet
  Normalized Form: altitude 3000 feet
  v1 Action: hint-only
  Notes: 暂不自动转换普通高度

- ID: NR-012
  Type: speed
  Written Form: speed 250 knots
  Spoken Form: speed two five zero knots
  Normalized Form: speed 250 knots
  v1 Action: normalize-if-clear
  Notes: 仅在 speed / knots 场景明确时转换

## 4. 待扩展场景样本

- ID: NRX-001
  Type: frequency
  Spoken Form: one two one decimal five
  Possible Written Form: 121.5
  Status: ready

- ID: NRX-002
  Type: altitude
  Spoken Form: one zero thousand feet
  Possible Written Form: 10000 feet
  Status: ready

- ID: NRX-003
  Type: wind
  Spoken Form: wind two seven zero at one five knots
  Possible Written Form: wind 270 at 15 knots
  Status: ready

## 5. 单个字母读法

- Letter: A
  Common Learner Reading: A / alpha
  ICAO / Aviation Variant: Alfa / Alpha
  Normalized Letter: A
  Notes: 标准拼写优先记录 Alfa；ASR 应接受 Alpha

- Letter: B
  Common Learner Reading: B / bravo
  ICAO / Aviation Variant: Bravo
  Normalized Letter: B
  Notes:

- Letter: C
  Common Learner Reading: C / charlie
  ICAO / Aviation Variant: Charlie
  Normalized Letter: C
  Notes:

- Letter: D
  Common Learner Reading: D / delta
  ICAO / Aviation Variant: Delta
  Normalized Letter: D
  Notes:

- Letter: E
  Common Learner Reading: E / echo
  ICAO / Aviation Variant: Echo
  Normalized Letter: E
  Notes:

- Letter: F
  Common Learner Reading: F / foxtrot
  ICAO / Aviation Variant: Foxtrot
  Normalized Letter: F
  Notes:

- Letter: G
  Common Learner Reading: G / golf
  ICAO / Aviation Variant: Golf
  Normalized Letter: G
  Notes: golf 也可能是普通词，需上下文明确

- Letter: H
  Common Learner Reading: H / hotel
  ICAO / Aviation Variant: Hotel
  Normalized Letter: H
  Notes: hotel 也可能是普通词，需上下文明确

- Letter: I
  Common Learner Reading: I / india
  ICAO / Aviation Variant: India
  Normalized Letter: I
  Notes: India 也可能是地名，需上下文明确

- Letter: J
  Common Learner Reading: J / juliet
  ICAO / Aviation Variant: Juliett / Juliet
  Normalized Letter: J
  Notes: 标准拼写优先记录 Juliett；ASR 应接受 Juliet

- Letter: K
  Common Learner Reading: K / kilo
  ICAO / Aviation Variant: Kilo
  Normalized Letter: K
  Notes:

- Letter: L
  Common Learner Reading: L / lima
  ICAO / Aviation Variant: Lima
  Normalized Letter: L
  Notes: runway 27L 这类后缀通常读 left，不按 Lima 处理

- Letter: M
  Common Learner Reading: M / mike
  ICAO / Aviation Variant: Mike
  Normalized Letter: M
  Notes: Mike 也可能是人名，需上下文明确

- Letter: N
  Common Learner Reading: N / november
  ICAO / Aviation Variant: November
  Normalized Letter: N
  Notes: November 也可能是月份，需上下文明确

- Letter: O
  Common Learner Reading: O / oscar
  ICAO / Aviation Variant: Oscar
  Normalized Letter: O
  Notes: Oscar 也可能是人名，需上下文明确

- Letter: P
  Common Learner Reading: P / papa
  ICAO / Aviation Variant: Papa
  Normalized Letter: P
  Notes:

- Letter: Q
  Common Learner Reading: Q / quebec
  ICAO / Aviation Variant: Quebec
  Normalized Letter: Q
  Notes: Quebec 也可能是地名，需上下文明确

- Letter: R
  Common Learner Reading: R / romeo
  ICAO / Aviation Variant: Romeo
  Normalized Letter: R
  Notes:

- Letter: S
  Common Learner Reading: S / sierra
  ICAO / Aviation Variant: Sierra
  Normalized Letter: S
  Notes:

- Letter: T
  Common Learner Reading: T / tango
  ICAO / Aviation Variant: Tango
  Normalized Letter: T
  Notes:

- Letter: U
  Common Learner Reading: U / uniform
  ICAO / Aviation Variant: Uniform
  Normalized Letter: U
  Notes: uniform 也可能是普通词，需上下文明确

- Letter: V
  Common Learner Reading: V / victor
  ICAO / Aviation Variant: Victor
  Normalized Letter: V
  Notes: Victor 也可能是人名，需上下文明确

- Letter: W
  Common Learner Reading: W / whiskey
  ICAO / Aviation Variant: Whiskey
  Normalized Letter: W
  Notes:

- Letter: X
  Common Learner Reading: X / x-ray
  ICAO / Aviation Variant: X-ray / X ray
  Normalized Letter: X
  Notes: 标准拼写优先记录 X-ray；ASR 应接受 X ray

- Letter: Y
  Common Learner Reading: Y / yankee
  ICAO / Aviation Variant: Yankee
  Normalized Letter: Y
  Notes:

- Letter: Z
  Common Learner Reading: Z / zulu
  ICAO / Aviation Variant: Zulu
  Normalized Letter: Z
  Notes: Zulu 也可能表示 UTC 时间，需上下文明确

## 6. 重点字母场景

- ID: LR-001
  Type: taxiway
  Written Form: taxiway A
  Spoken Form: taxiway Alfa
  Normalized Form: taxiway A
  v1 Action: normalize-if-clear
  Notes: 滑行道字母上下文明确

- ID: LR-002
  Type: taxiway
  Written Form: taxiway B2
  Spoken Form: taxiway Bravo two
  Normalized Form: taxiway B2
  v1 Action: normalize-if-clear
  Notes: 字母加数字的滑行道编号

- ID: LR-003
  Type: taxiway
  Written Form: taxiway C and D
  Spoken Form: taxiway Charlie and Delta
  Normalized Form: taxiway C and D
  v1 Action: normalize-if-clear
  Notes: 多个滑行道字母连续出现时可逐个转换

- ID: LR-004
  Type: atis-information
  Written Form: ATIS information A
  Spoken Form: ATIS information Alfa
  Normalized Form: ATIS information A
  v1 Action: normalize-if-clear
  Notes: ATIS information 后的字母上下文明确

- ID: LR-005
  Type: registration
  Written Form: B-1234
  Spoken Form: Bravo one two three four
  Normalized Form: B-1234
  v1 Action: normalize-if-clear
  Notes: 仅在 registration / aircraft registration / tail number 语境明确时转换

- ID: LR-006
  Type: airspace-class
  Written Form: class C
  Spoken Form: class Charlie
  Normalized Form: class C
  v1 Action: normalize-if-clear
  Notes: 空域等级上下文明确

- ID: LR-007
  Type: navaid-identifier
  Written Form: ABC VOR
  Spoken Form: Alfa Bravo Charlie VOR
  Normalized Form: ABC VOR
  v1 Action: normalize-if-clear
  Notes: VOR / NDB / ILS 等导航台识别码上下文明确

- ID: LR-008
  Type: holding-point
  Written Form: holding point A
  Spoken Form: holding point Alfa
  Normalized Form: holding point A
  v1 Action: normalize-if-clear
  Notes: 等待点字母上下文明确

## 7. 字母 normalization 边界

- ID: LRB-001
  Rule: clear-context-only
  Description: 只有在 taxiway、holding point、ATIS information、airspace class、registration、tail number、navaid identifier 等上下文明确时，才把 ICAO 字母读法转换为单个字母。
  v1 Action: normalize-if-clear

- ID: LRB-002
  Rule: ordinary-word-protection
  Description: 不把无明确上下文的 hotel、golf、india、oscar、mike、november、victor、uniform、zulu 等普通词强行转换为字母。
  v1 Action: forbidden

- ID: LRB-003
  Rule: hint-before-normalization
  Description: 当上下文不够明确但可能属于民航拼读时，先作为 ASR hint，不自动改写转写结果。
  v1 Action: hint-only

- ID: LRB-004
  Rule: preserve-existing-meaning
  Description: runway 27L / 27R / 27C 中的 L / R / C 后缀按 left / right / center 处理，不按 Lima / Romeo / Charlie 反推。
  v1 Action: forbidden
