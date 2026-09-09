# 学习记录列表｜视觉候选

日期：2026-09-09。当前状态：v1平面列表已被用户否定；改按用户旧页面的圆角卡片视觉生成v2，待确认。两稿均非运行截图，未修改应用代码。

当前候选与反馈见 [v2卡片方案](v2-design-notes.md)，当前图片为 [list-concept-v2.png](list-concept-v2.png)。下文仅保留v1的追溯说明，不再作为推荐方向。

[查看视觉稿](list-concept-v1.png)

## 设计方向

沿用已选B资料/设置的平面列表、轻分隔线与留白，暖白背景、蓝色线性图标、衬线标题。左侧为有记录，右侧为空状态；不是两套候选风格。标题、来源与时间、数量/时长/提前结束状态分层展示；模考标题不重复来源。数值为示例，不更改组卷规则。

整行点击进入历史；左滑才出现删除，正常状态不常驻工具栏。空态仅提示，不加跳转按钮。没有搜索、筛选、统计、手动同步或导出入口。

## 核查与待确认

已目视检查正常态四条示例、日期分组、三种来源和空态文案；移除了第一稿模考标题中的重复来源。图片中的字体、蓝色和微小尺寸用于风格预览，实施以主题令牌及已确认组件为准；不从生成图提取图标替换既有图标。长文本、较大字号及真实触摸/滑动行为尚未运行验证，后续实施验收覆盖。

用户待确认：整体平面列表方向、每行信息层级、疏密及空态位置。本稿获确认前不替代最终功能方案，也不标记为视觉已验收。

## 生成方式与提示词

使用内置image_gen，B方案为风格参考；先生成两状态整板，再定向去除重复标题。最新候选已保存在本目录。

### 初稿

```text
Use case: ui-mockup. Generate ONE high resolution design review board with exactly TWO complete flat portrait mobile app screens side by side, each approximately 390x844 proportions, equal size, straight on, no device hardware, no perspective. Chinese aviation English learning app 听你五个. This is a new 学习记录 list design, not a recreation of the reference pages. Use the attached B concept ONLY as style reference: middle profile and right settings flat lists, generous whitespace, fine horizontal rules, serif Chinese headings, clean sans-serif body. Do NOT include any login/profile/settings fields or logo. At top OUTSIDE the screens label the board 学习记录｜视觉草案, label left 有记录 and right 暂无记录. Warm background #FBFAF7; near white surfaces, foreground #11161F, primary #1F5ED9, muted #5D636F. Avoid card piles, giant rounded cards, colored status badges, heavy shadows, decorative gradients. Flat editorial list, readable native mobile scale, restrained premium aesthetic. Thin gray separators, generous 20px margins, centered navigation title 学习记录 with back chevron at left. Both screens have 9:41 status bar and bottom home indicator. No bottom app tabbar.
LEFT screen:
Navigation header then scrollable list grouped by 今天, 昨天. Each row one coherent generous touch area, title dark medium weight; small simple blue outline source icon on left WITHOUT filled circle or tile; quiet right chevron; source+time small secondary text; detail line even lighter. Make the titles readable and prevent clipped text. Today three rows, yesterday one row. Exact content:
group 今天
row1 title ICAO 4 初考 · 模拟练习 ; secondary 模拟考试 · 21:30 ; detail 提前结束 · 已答 18/52 题 · 23 分钟
row2 title 陆空通话 · 进近场景 ; secondary 题库学习 · 18:20 ; detail 本次学习 8 题 · 12 分钟
row3 title 7月10日 · 绵阳考点 ; secondary OPI 热点 · 12:05 ; detail 本次学习 6 题 · 9 分钟
group 昨天
row4 title ICAO 4 复考 · 模拟练习 ; secondary 模拟考试 · 20:10 ; detail 已提交 · 已答 20/20 题 · 16 分钟
Do not show scores or levels, not part of list. All rows use same hierarchy/spacing and understated line icons, perhaps clipboard for exams, book for bank, flame for hotspot. The screen should feel beautifully designed, not a dense database. Plenty of space below four rows; no fake endless content.
RIGHT screen:
Same exact navigation header and background. A very small delicate outline history/book icon, muted blue-gray, placed near upper-middle body around 35% screen height. Below it title 还没有学习记录 in modest dark serif, then centered two-line muted body 完成或结束一次练习后 / 会显示在这里. Plenty of whitespace. No CTA buttons or links, no illustration/mascot.
Both screens strictly NO search, tabs, filters, statistics, share/export, sync/refresh button, delete toolbar, floating buttons, upgrade/purchase banner, instructional footers or extra slogans. Swipe delete exists conceptually but do not display it in these normal states. Render polished crisp Chinese typography accurately, no annotations within the actual UI. This is a single recommended design with two states, not two competing designs.
```

### 定向修订

```text
Edit only the text of two record titles in this Chinese mobile UI mockup board. Preserve ALL layout, typography, spacing, icons, exact screen size, separators, all other text and empty state unchanged. LEFT screen first row current title 'ICAO 4 初考 · 模拟练习' must become exactly 'ICAO 4 初考'. LEFT screen fourth row current title 'ICAO 4 复考 · 模拟练习' must become exactly 'ICAO 4 复考'. Keep the smaller second line '模拟考试 · 21:30' and '模拟考试 · 20:10' respectively unchanged. The purpose is removing redundant source labels in titles. Do not introduce any other changes.
```
