# 民航录音转写与首个五轮优化收口

状态：已交付并上线（2026-07-22）

## 当前工作流

```text
用户录音
→ App multipart 上传
→ API 私有临时音频
→ fun-asr-2025-11-07（aviation-hotwords:v2，无热词）
→ 供应商原始文本（仅服务端内部）
→ aviation-normalization:v7
→ { transcript }
→ App 答案区展示
```

线上真实请求、内部与公网健康检查、认证/同步回归、临时音频删除和结果契约均已验证。

## 唯一维护入口

| 内容 | 唯一入口 |
| --- | --- |
| 热词候选数据库 | `docs/ai/assets/asr-hotword-candidates.json` |
| 热词开发者总览 | `docs/ai/assets/asr-hotword-inventory.md` |
| ASR 正式热词 | `docs/ai/assets/asr-hotwords.json` |
| 候选生成与子集校验 | `tools/asr-hotwords.mjs` |
| 隔离供应商资源 | `tools/asr-vocabulary.mjs`、`scripts/prepare-aviation-asr-vocabulary.sh` |
| Fun-ASR 协议 | `services/api/src/ai/fun-asr.service.ts` |
| 临时音频 | `services/api/src/ai/asr-audio-storage.service.ts` |
| 民航规范化 | `services/api/src/ai/aviation-transcript-normalization.ts` |
| 评测与分类 | `services/api/scripts/aviation-asr-optimization.ts` |
| 线上真实验收 | `services/api/scripts/verify-asr-live.mjs` |

不得建立平行题库、热词表、规范化器、音频映射或录音生命周期所有者。

## 首个优化活动结果

- 候选：239 条；正式和线上热词：0 条，仓库与线上同步；
- 五轮开发/盲测：420 条互不重复样本，420/420 人工分类；
- 评测调用：453 次，单轮最大 100 次；
- 累计精确匹配：145→169；WER：17.76%→15.46%；
- 规范化：v2→v7；
- ICAO/RVR、VOR、PANPAN/TCAS 三批热词候选均被拒绝。

完整证据见 [活动 01 收口](./evidence/campaign-01/README.md)。

## 后续更新规则

1. 从新的 30+30+3 开发集建立基线，逐条区分 ASR、规范化和源数据问题。
2. 热词必须先在候选数据库中存在，再用隔离资源对目标与保护样本做前后对照。
3. 规范化只修改已听对且上下文明确的写法，并添加正例、反例和幂等性测试。
4. 候选冻结后使用新的 10+10+1 盲测；不得查看后继续调优同一轮。
5. 正式发布前运行累计回归、检查关键实体硬门槛，再从明确文件集部署和真实验证。

数字与 ICAO 字母知识文档只提供规则依据，不整表同步为热词。

## 当前限制与遗留

- 仍为非实时整段录音转写，不提供流式结果。
- 运营人代码与话音呼号目标形式不一致，暂不做全局代码化。
- ASDA、MSA、EICAS、wind-shear 和部分短缩写仍需新的独立证据。
- 参考文本含合理变体、标签和少量真实错配，不能只用 WER 决策。
- 本活动没有更换模型、训练、微调或运行完整 900 句评测。

历史 v1 工作流交付和无语音修复证据保留在 [phase-log.md](./phase-log.md)。
