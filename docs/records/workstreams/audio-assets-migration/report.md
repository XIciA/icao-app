# 音频资源迁移报告

生成时间：2026-07-09T04:41:26.865Z

## 资源库

- 源目录：`/Users/zhouyide/Desktop/icao项目/feizhuicu/public/question-bank`
- 目标目录：`public/question-bank-assets/audio`
- 索引文件：`lib/question-banks/assets/audio-index.json`
- 当前保留本地音频：3894 个
- 当前本地音频大小：552.3 MB
- OPI 问题音频已删除，默认使用自动生成音频。
- `listening-main-595` 因源文本仅为失真备注，已按用户要求彻底删除；其当前设计稿挂载音频 `listening/main/454.mp3` 也已同步移除。

## 当前设计稿挂载结果

| 题库 | 卡片数 | 本地音频挂载 | 音频模式 |
| --- | ---: | ---: | --- |
| listening | 631 | 631 | 本地音频 |
| sentences900 | 900 | 900 | 本地音频 |
| radiotelephony | 1851 | 1851 | 本地音频 |
| opi | 1269 | 0 | 自动生成音频 |
| storytelling | 296 | 296 | 本地音频 |

## 挂载规则

- 当前设计稿卡片、分类、顺序为准，不使用 feizhuicu 的题目 ID 覆盖当前卡片 ID。
- 听力：按当前卡片顺序挂载 `listening/main`。
- 900句：按当前卡片顺序挂载 `sentence900/main`。
- 陆空通话：按当前卡片顺序挂载 `radiotelephony/main`，多余资源保留在索引中。
- 故事复诵：`飞行ICAO` 按 `storytelling/wing` 后接 `storytelling/koala`，`管制ICAO` 按 `storytelling/kongguan`。
- OPI：不挂载本地问题音频，播放器按文本自动生成音频。

## React Native 迁移提示

- React Native 可将 `public/question-bank-assets/audio` 的模块化目录作为开发期资源与后续对象存储路径规划的蓝本。
- `audio-index.json` 可作为 React Native 资源索引、资源校验和后续远程资源映射的输入。
- React Native 端 OPI 问题音频不需要打包本地 MP3，可按题目文本使用系统 TTS 或后续生成策略。
