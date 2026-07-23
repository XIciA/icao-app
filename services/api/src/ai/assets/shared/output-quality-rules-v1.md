# Word Lookup Output Rules v1

本文档仅管理 `word-lookup` 的运行时输出规则。语法复核和 OPI 表达润色使用服务端固定 Prompt 与严格 Zod Schema，不加载领域资产或本文件。

- ID: OQ-001
  Applies To: word-lookup
  Rule Type: schema
  Pass Condition: 返回严格 JSON object，不带 markdown 或额外说明
  Severity: fail
  Status: ready

- ID: OQ-002
  Applies To: word-lookup
  Rule Type: schema
  Pass Condition: 只返回 `definition` 和 `contextExplanationZh`
  Severity: fail
  Status: ready

- ID: WL-OQ-002
  Applies To: word-lookup
  Rule Type: boundary
  Pass Condition: `definition` 包含词性、通用释义和民航释义
  Severity: fail
  Status: ready

- ID: WL-OQ-003
  Applies To: word-lookup
  Rule Type: boundary
  Pass Condition: 查询短语时优先解释短语整体含义
  Severity: fail
  Status: ready
