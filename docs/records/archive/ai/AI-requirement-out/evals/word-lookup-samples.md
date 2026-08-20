# 历史归档：Word Lookup Eval Samples

本文档用于评审 `word-lookup:v1` 是否能结合当前句子解释单词或短语，并避免普通词典化、长篇化或输出无关例句。

## 1. 正向样例

- ID: WL-001
  Input Word: deviation
  Context: We requested deviation due to thunderstorm.
  Expected Direction: 解释为航路 / 航向偏离或天气绕飞请求，不只解释普通“偏差”
  Related Rules: WL-OQ-002, OQ-008
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: WL-002
  Input Word: maintain
  Context: Maintain FL290.
  Expected Direction: 解释为管制指令中的“保持”，结合高度层语境
  Related Rules: WL-OQ-002, OQ-008
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

## 2. 边界样例

- ID: WL-N-001
  Input Word: go around
  Context: We decided to go around.
  Forbidden Behavior: 逐词硬拆为 `go` + `around`
  Expected Direction: 按短语整体解释为复飞
  Related Rules: WL-OQ-003
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: WL-N-002
  Input Word: approach
  Context: Continue approach.
  Forbidden Behavior: 只解释为普通“靠近”
  Expected Direction: 结合民航语境解释为继续进近
  Related Rules: WL-OQ-002
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: WL-N-003
  Input Word: maintain
  Context: Maintain FL290.
  Forbidden Behavior: 输出例句、词源、评分或无关义项
  Expected Direction: 只返回该词在本句里的解释方向
  Related Rules: WL-OQ-001, WL-OQ-004, OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

## 3. 待补充样例类型

- Type: 更多短语整体解释
  Purpose: 验证 `line up and wait` 等短语不被逐词硬拆
  Status: ready
  Review Decision: backlog-only

- Type: 易普通词典化术语
  Purpose: 验证 `clearance`、`squawk` 等术语能结合民航语境解释
  Status: ready
  Review Decision: backlog-only

- Type: 输出字段边界
  Purpose: 验证不输出额外字段
  Status: ready
  Review Decision: backlog-only
