# 单词资源

`dataset.json` 是 React Native 单词学习模块的正式内容源，只包含 App 使用的三本词书和必要字段。

- 来源参考：`/Users/zhouyide/Desktop/icao项目/feizhuicu/public/data/vocab`
- 生成：`pnpm vocabulary:extract`
- 校验：`pnpm vocabulary:check`
- 当前数量：360 + 372 + 106 = 838

不得手工混入 `*_例句替换.json`、题库内容、空音标或空音频字段。需要更新时先修改已确认来源，再重新生成并检查差异。
