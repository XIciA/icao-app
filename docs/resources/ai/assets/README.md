# 当前 ASR 优化资产

本轮唯一维护入口是 `tencent-asr/`，普通英文引擎为 `16k_en`。

| 材料 | 用途 |
| --- | --- |
| `tencent-asr/hotwords.json` | 225 项热词、权重、筛选理由、题库出处与排除项；航空缩写 69 项、通话/技术术语 46 项、名称与导航点 110 项。 |
| `tencent-asr/hotwords.txt` | 与 JSON 完全一致的腾讯上传文件，`词语|权重`，不是第二份独立维护词表。 |
| `tencent-asr/aviation-training-900.txt` | 原题库全部 900 句，逐句原文，不混入参考答案纠错或额外陆空语料。 |
| `services/api/src/ai/aviation-transcript-normalization.ts`（仓库根目录下） | 唯一运行时航空写法实现；只做明确的等价格式转换，保留原文和转换轨迹。 |

新增热词来自五个题库的 audioText/referenceText，逐项保留上下文；计数是包含词条的卡片数，不等同独立音频样本数。初始 18 项沿用差异分析依据，其余为本轮人工审查的领域候选，主要采用权重 2/3，尚未进行音频效果复测。短导航代码采用低权重，不加入任意呼号数字、角色标签或可疑拼写。

`pnpm ai:asr:assets:check` 离线校验词表、证据、上传文件和 900 句原文；`pnpm ai:asr:candidates` 仅在 `.generated/tencent-asr/` 输出缩写候选统计，不自动更改正式词表。

已按用户要求删除被替代的 Fun-ASR 空词表、候选库、部署快照及旧数字/拼读资产；必要的保守边界已收敛到当前实现及其反例测试。旧云端部署命令保留报错入口，不能再修改服务器。历史版本可由 Git 回溯，本轮原始转写与差异证据仍保留。语法纠错、表达优化、查词和 TTS 的独立运行时资产不属于清理范围。

云端资源与接入状态见 `docs/records/workstreams/tencent-asr-accuracy-20260920/task.md`（仓库根目录下）。配置上线和离线校验不代表识别准确率已经达标。
