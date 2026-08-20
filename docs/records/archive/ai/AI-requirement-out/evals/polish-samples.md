# 历史归档：Polish Eval Samples

本文档用于评审 `polish:v1` 是否把用户文本优化成更自然的民航英语口语，同时避免大幅扩写或标准答案化。

## 1. 正向样例

- ID: PO-E-001
  Input: `I will tell ATC and change route.`
  Expected Polish Direction: `I will advise ATC and request a route deviation.`
  Related Rules: PO-OQ-002, PO-OQ-004
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: PO-E-002
  Input: `I meet thunderstorm and want avoid it.`
  Expected Polish Direction: `I encountered a thunderstorm and would request deviation to avoid it.`
  Related Rules: PO-OQ-002, PO-OQ-003
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: PO-E-003
  Input: `We go around because runway not clear.`
  Expected Polish Direction: `We will go around because the runway is not clear.`
  Related Rules: PO-OQ-002, PO-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

## 2. 禁止样例

- ID: PO-N-001
  Input: `I will tell ATC.`
  Forbidden Output Pattern: 长篇解释 ATC 协调流程
  Expected Boundary: 只给简短润色文本
  Related Rules: OQ-006, PO-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: PO-N-002
  Input: `I meet thunderstorm.`
  Forbidden Output Pattern: 添加大量天气、航路、乘客信息
  Expected Boundary: 不加入用户没有表达的大量新信息
  Related Rules: OQ-005, PO-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: PO-N-003
  Input: `Request deviation.`
  Forbidden Output Pattern: 生成完整 OPI 标准答案
  Expected Boundary: 保持接近原文长度
  Related Rules: OQ-004, PO-OQ-003
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

## 3. 风格检查入口

- Check: 口语性
  Related Rules: PO-OQ-004

- Check: 长度
  Related Rules: PO-OQ-003

- Check: 语义
  Related Rules: OQ-007

- Check: 边界
  Related Rules: OQ-003, PO-OQ-001, PO-OQ-002
