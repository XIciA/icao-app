# 历史归档：Transcribe Eval Samples

本文档用于评审 `transcribe` 和 `transcribe-hints:v1` 的输出边界。这里的 `Expected` 只代表 ASR 转写 / normalization 层可接受的结果，不代表 grammar-review 或 polish 结果。

审核结论：本文件样本全部作为 transcribe normalization / negative eval 参考，不进入普通 LLM few-shot；运行时代码只应在场景明确时保守启用 normalization。

## 1. 允许样例

- ID: TR-E-001
  Input: `qnh one zero one three`
  Expected: `QNH 1013`
  Reason: QNH 大写，四位数字明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-002
  Input: `fl two niner zero`
  Expected: `FL290`
  Reason: FL 场景明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-003
  Input: `flight level two niner zero`
  Expected: `FL290`
  Reason: flight level 场景明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-004
  Input: `runway two seven`
  Expected: `runway 27`
  Reason: 跑道号明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-005
  Input: `heading one eight zero`
  Expected: `heading 180`
  Reason: 航向三位数字明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-006
  Input: `squawk seven five zero zero`
  Expected: `squawk 7500`
  Reason: squawk 四位编码明确
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-007
  Input: `atc cleared us to land`
  Expected: `ATC cleared us to land`
  Reason: 只统一 ATC 大写
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-008
  Input: `pan pan we have engine failure`
  Expected: `pan-pan we have engine failure`
  Reason: 只统一紧急呼叫格式
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

- ID: TR-E-009
  Input: `  QNH   1013  `
  Expected: `QNH 1013`
  Reason: 空格清理
  Related Rules: TR-OQ-004
  Few-shot Candidate: no
  Status: ready

## 2. 禁止样例

- ID: TR-N-001
  Input: `I has turbulence`
  Forbidden Output: `I have turbulence`
  Expected: `I has turbulence`
  Related Rules: TR-OQ-001
  Few-shot Candidate: no
  Status: ready

- ID: TR-N-002
  Input: `I meet thunderstorm`
  Forbidden Output: `I encountered a thunderstorm`
  Expected: `I meet thunderstorm`
  Related Rules: TR-OQ-002
  Few-shot Candidate: no
  Status: ready

- ID: TR-N-003
  Input: `request deviation`
  Forbidden Output: `request deviation due to thunderstorm`
  Expected: `request deviation`
  Related Rules: TR-OQ-003
  Few-shot Candidate: no
  Status: ready

- ID: TR-N-004
  Input: `We go around because runway not clear`
  Forbidden Output: `We are going around because the runway is not clear`
  Expected: `We go around because runway not clear`
  Related Rules: TR-OQ-001, TR-OQ-002
  Few-shot Candidate: no
  Status: ready

- ID: TR-N-005
  Input: `mayday engine failure`
  Forbidden Output: `Mayday, mayday, mayday, we have an engine failure.`
  Expected: `mayday engine failure`
  Related Rules: OQ-004, TR-OQ-003
  Few-shot Candidate: no
  Status: ready

## 3. 新样本记录模板

- Field: module
  Example: OPI

- Field: rawAudioContext
  Example: weather answer

- Field: rawTranscript
  Example: `q and h one zero one three`

- Field: expectedTranscript
  Example: `QNH 1013`

- Field: shouldNormalize
  Example: yes

- Field: relatedRules
  Example: `TR-OQ-004`

- Field: fewShotCandidate
  Example: no

- Field: riskLevel
  Example: collapse-if-clear

- Field: status
  Example: candidate
