# Grammar Review Eval Samples

本文档用于评审 `grammar-review:v1` 是否只做语法纠错，不做 polish、不生成标准答案。

## 1. 正向样例

- ID: GR-E-001
  Input: `I is ready.`
  Expected Issue Direction: `I is` -> `I am`
  Expected Corrected Text: `I am ready.`
  Related Rules: GR-OQ-002, GR-OQ-003
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: GR-E-002
  Input: `I fly to Beijing yesterday.`
  Expected Issue Direction: 过去时间应使用过去式
  Expected Corrected Text: `I flew to Beijing yesterday.`
  Related Rules: GR-OQ-002, GR-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: GR-E-003
  Input: `We go around because runway not clear.`
  Expected Issue Direction: 缺少冠词和 be 动词
  Expected Corrected Text: `We go around because the runway is not clear.`
  Related Rules: GR-OQ-002, GR-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: GR-E-004
  Input: `I has turbulence.`
  Expected Issue Direction: 主谓一致错误
  Expected Corrected Text: `I have turbulence.`
  Related Rules: GR-OQ-002, GR-OQ-003
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

## 2. 无明显错误样例

- ID: GR-OK-001
  Input: `I will advise ATC and request deviation.`
  Expected Issues: `[]`
  Expected Corrected Text: `I will advise ATC and request deviation.`
  Related Rules: GR-OQ-004
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval

- ID: GR-OK-002
  Input: `We are maintaining FL290.`
  Expected Issues: `[]`
  Expected Corrected Text: `We are maintaining FL290.`
  Related Rules: GR-OQ-004
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

## 3. 禁止样例

- ID: GR-N-001
  Input: `I meet thunderstorm.`
  Forbidden Behavior: 直接润色成 `I encountered a thunderstorm.`
  Expected Behavior: 不做 polish；如 v1 不判为硬语法错误，issues 可为空，correctedText 保持原文
  Related Rules: GR-OQ-002, GR-OQ-004
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: GR-N-002
  Input: `I will tell ATC.`
  Forbidden Behavior: 改成一整段标准答案
  Expected Behavior: 不扩写；如无硬语法错误，尽量保持原文
  Related Rules: OQ-004, GR-OQ-004
  Few-shot Candidate: no
  Status: ready
  Review Decision: eval-only

- ID: GR-N-003
  Input: `Request deviation.`
  Forbidden Behavior: 补全为 `Request deviation due to thunderstorm.`
  Expected Behavior: 不补充用户没有表达的原因
  Related Rules: OQ-005, GR-OQ-003
  Few-shot Candidate: yes
  Status: ready
  Review Decision: few-shot + eval
