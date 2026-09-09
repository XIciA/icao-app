# 学习记录列表 v2｜卡片视觉草案

2026-09-09。状态：待用户确认；通过内置image_gen生成，未修改应用代码或已确认业务范围。

[查看v2候选](list-concept-v2.png) · [用户旧页面视觉参考](user-old-history-style-reference.png)

## 用户反馈与本稿变化

用户否定v1设置式平面列表，认为原页面视觉更有质感。原截图只参考视觉，不能沿用旧功能、冗余文字和历史实现限制。本稿采用暖白底、大圆角白卡、浅蓝圆角图标底、衬线标题、轻分隔线与克制阴影。卡片上部为名称、来源和必要结束状态；下部为题量、用时与时间。日期分组、整条进入、左滑删除及空态无按钮保持功能方案。

## 视觉核查与偏差

有记录四条覆盖三种来源与提前结束，空态为轻量纸卡图形及已定文案；未恢复搜索、同步、导出或常驻删除。所有内容和数值为示例。生成图第三张卡9分钟旁图标误呈闪电，实施应统一使用既有时钟图标；不是新增功能或语义。准确字体、颜色、圆角、长标题换行和触摸区域以后按正式组件与主题令牌验证，不能把生成像素当作实现数值。

v1保留追溯，已被否定；v2尚未选定，不标记视觉完成。此局部变化不推翻已选账户页面A/B组合。

用户进一步确认：必须严格参考既有视觉MD与当前App的设计，保持简洁、高端、大气；允许根据新功能调整内容和布局，不允许大幅改变风格。该要求同时约束生成稿和后续代码实现，详见 [专题共同原则](../../requirements.md)。这是视觉约束确认，不是v2选稿确认。下一次设计或实施应先核对真实页面与主题组件，修正参考稿偏差，不能原样照搬生成图。

## 完整生成提示词

```text
Use case ui-mockup. Create ONE polished high fidelity design board, exactly TWO full portrait mobile app UI screens side by side, equal scale about 390x844 each, high resolution sharp typography. Left populated learning history, right empty learning history. This is a REVISED design responding to user dislike of a flat settings-like list. Use attached OLD DESKTOP screenshot ONLY as VISUAL STYLE reference, not content or features: generous rounded white record cards, warm ivory page background, delicate gray borders, faint shadows, pale blue rounded-square icon containers with blue thin history icons, editorial Chinese serif card headings, hairline internal divider, concise metadata footer. Recompose beautifully for mobile, not a shrunk desktop screenshot. Keep sophisticated and airy, smooth well-proportioned large cards without wasted internal space. No flat settings rows. Palette #FBFAF7 warm ivory, white #FFFFFF cards, dark #11161F titles, blue #1F5ED9 accents, muted #5D636F, pale amber #B77610 tint for early-ending status only.
Board outside screen: small elegant title 学习记录｜卡片方案. Screen mockups no hardware, no perspective, no excessive device frame; complete status bar 9:41 and home indicator. Warm ivory screen distinct from white cards. Each screen top compact back chevron then large left-aligned serif heading 学习记录 below navigation, no repeated centered title, no marketing subtitle, no English overline or technical explanations.
LEFT screen:
small group label 今天.
THREE beautiful cards stacked with ~14px gaps and ~20px outer margin, ~24px corner radius; each card header around icon+title+subtitle, internal thin divider, compact metadata footer. No cards nested within cards. Icons ~40px square pale blue backing at left. Use right small chevron as click affordance. First card small pale amber badge 提前结束 positioned unobtrusively in subtitle area or top corner, NEVER squeeze/truncate title.
CARD1 title ICAO 4 初考 ; source subtitle 模拟考试 . small amber 提前结束 badge. Footer beneath divider: target icon 已答 18/52题 ; clock icon 23分钟 ; time 21:30 aligned right. Exactly these facts, no extra explanations.
CARD2 title 陆空通话 ; subtitle 题库学习 · 进近场景 . Footer book icon 已学 8题 ; clock icon 12分钟 ; time 18:20 right. No status badge needed.
CARD3 title 7月10日 · 绵阳考点 ; subtitle OPI 热点 . Footer book icon 已学 6题 ; clock icon 9分钟 ; time 12:05 right. No status badge needed.
small group label 昨天.
CARD4 title ICAO 4 复考 ; subtitle 模拟考试 · 已提交 . Footer target icon 已答 20/20题 ; clock icon 16分钟 ; time 20:10 right. Fit complete last card comfortably in screen without crowding bottom home indicator. Target 4 cards readable around 120-135 logical px each, compact clean footer 11-12px at mobile scale, larger title ~19-20px. Don't put entire exam type and source twice.
RIGHT screen:
Identical top navigation and left-aligned large 学习记录 heading, then calm generous empty space. Near upper-middle place a small decorative stack of TWO blank white rounded paper/card silhouettes with a pale blue rounded-square history icon at front, soft almost invisible shadow, elegant minimal motif based on record cards not colorful art, no text on the motif. Below centered heading 还没有学习记录 in restrained dark serif and centered two-line muted sentence 完成或结束一次练习后 / 会显示在这里. No button or action link.
Critical constraints: User screenshot content obsolete. Do NOT copy LOCAL HISTORY, 最近学习, AI模考, 本地保存同步说明, 自选板块 counts, 此记录未保存逐题详情, full timestamps with seconds, or old claims. No search/filter/tabs/statistics/dashboard, sync button, export, report, share, footer hint, purchase banner, floating action, deletion icon or persistent delete controls. No bottom tab bar. No labels inside UI other than specified. Normal rows reveal deletion only on swipe, do not render swipe state. Brand visual design should be much more refined and feel like the original soft rounded history cards, not a generic settings page. Render precise readable Chinese, balanced whitespace, consistent alignment and information hierarchy. Two states of ONE design.
```
