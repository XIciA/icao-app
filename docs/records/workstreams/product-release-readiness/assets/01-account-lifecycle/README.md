# 账户核心页面视觉候选

状态：用户已明确选择「A 的登录＋B 的资料和设置」作为视觉方向；非实际运行截图，细部仍受模块要求与下述偏差说明约束。使用内置 image_gen 生成，品牌参考为 assets/images/icon.png；未修改应用代码。

## 已确认的组合

| 页面 | 采用的参考 | 视觉重点 |
| --- | --- | --- |
| 登录 | A 左侧页面 | 左对齐品牌与标题、圆角输入、清晰主按钮、圆形第三方入口 |
| 个人资料 | B 中间页面 | 居中头像、平面资料列表、细线分隔与留白 |
| 设置 | B 右侧页面 | 平面列表、无底色线性图标、细线分隔、克制的退出按钮 |

引用实际生成图而非提示词中未被图像采用的描述。三页共享现有品牌色、字体角色和组件尺度，保持整套一致；不将 A 的卡片分组套回资料/设置。不采用 B 的登录、A 的资料/设置或 C 的整套方案。业务入口及异常行为以模块文档为准，选择参考图不新增业务能力，也不授权应用实施。

- [A 经典轻卡片](concept-a.png)
- [B 极简留白](concept-b.png)
- [C 紧凑清晰](concept-c.png)

每套从左到右为登录、个人资料、设置。仅比较布局与视觉，业务要求仍以模块文档为准。

生成偏差检查：图中 +86 后下拉箭头不代表新增国家地区选择；A 的 Aviation English 为生成器额外文字，不纳入目标文案。按钮渐变、字体和 Logo 细部以正式组件与原始品牌资源为准，不直接提取生成图替代品牌资产。微信入口表示目标设计，不表示接入完成。界面状态与交互尚未实际验证。

## 完整生成提示词

### A

```text
Use case ui-mockup. Create a polished Chinese mobile app design comparison board: exactly THREE full portrait screens side by side, left 登录, middle 个人资料, right 设置. Each screen ~390x844 aspect ratio, equal scale, no perspective, no hands, no device hardware, all content readable, complete screens. Large high resolution board. Product 听你五个 aviation English app. Use attached existing icon as small unchanged brand insert on LOGIN only, do not redesign logo. Shared palette warm white #FBFAF7, white cards, text #11161F, blue #1F5ED9, secondary #5D636F, red only logout. Serif Chinese headings like Noto Serif SC, clean sans body, light linear icons. Very refined restrained quiet native UI.
MANDATORY same information on all alternatives. LOGIN: no back arrow, small logo and 听你五个, heading 登录 / 注册; 验证码登录 selected and 密码登录 switch; input +86 手机号; input 验证码 with 获取验证码 at right; main blue 登录 / 注册 button; unchecked consent 我已年满16周岁，并同意《用户协议》《隐私政策》 (links blue, legible two lines allowed); two round WeChat green and Apple black sign in buttons. No marketing slogans or extra explanatory copy. PROFILE: back chevron and 个人资料 header; editable avatar (neutral person silhouette, not app logo), change avatar accessible; only rows 昵称 飞行学员 >, 备考目标 ICAO 4 初考 >, 账号 ID c5d2b011 with copy icon. No phone, gender, region, bio, global save or edit button. SETTINGS: back and 设置 title; 账号安全 >, 隐私与数据 >; separate 语音识别 group with 腾讯 ASR 模型 16k_en >; separate 帮助中心 >; 退出登录 button; bottom 版本 1.0.0 and 蜀ICP备2026045996号-1A. NO profile card in settings, no about/update/rate/share/export/sync/feedback buttons. No bottom tabs on these screens. Same minimum touch sizes, balanced vertical whitespace, avoid oversized empty top. Distinct layout direction specified below. Outside screens title of option only.
Option title: A｜经典轻卡片. Visual direction: Closest to existing brand. Left-aligned serif login headline below compact brand row, broad soft 22px rounded filled inputs. Profile medium centered avatar, fields grouped within one rounded white card. Settings inset grouped white cards, subtle hairline borders, soft blue icon discs. Gentle spacing and tiny shadows, existing premium editorial look.
```

### B

```text
Use case ui-mockup. Create a polished Chinese mobile app design comparison board: exactly THREE full portrait screens side by side, left 登录, middle 个人资料, right 设置. Each screen ~390x844 aspect ratio, equal scale, no perspective, no hands, no device hardware, all content readable, complete screens. Large high resolution board. Product 听你五个 aviation English app. Use attached existing icon as small unchanged brand insert on LOGIN only, do not redesign logo. Shared palette warm white #FBFAF7, white cards, text #11161F, blue #1F5ED9, secondary #5D636F, red only logout. Serif Chinese headings like Noto Serif SC, clean sans body, light linear icons. Very refined restrained quiet native UI.
MANDATORY same information on all alternatives. LOGIN: no back arrow, small logo and 听你五个, heading 登录 / 注册; 验证码登录 selected and 密码登录 switch; input +86 手机号; input 验证码 with 获取验证码 at right; main blue 登录 / 注册 button; unchecked consent 我已年满16周岁，并同意《用户协议》《隐私政策》 (links blue, legible two lines allowed); two round WeChat green and Apple black sign in buttons. No marketing slogans or extra explanatory copy. PROFILE: back chevron and 个人资料 header; editable avatar (neutral person silhouette, not app logo), change avatar accessible; only rows 昵称 飞行学员 >, 备考目标 ICAO 4 初考 >, 账号 ID c5d2b011 with copy icon. No phone, gender, region, bio, global save or edit button. SETTINGS: back and 设置 title; 账号安全 >, 隐私与数据 >; separate 语音识别 group with 腾讯 ASR 模型 16k_en >; separate 帮助中心 >; 退出登录 button; bottom 版本 1.0.0 and 蜀ICP备2026045996号-1A. NO profile card in settings, no about/update/rate/share/export/sync/feedback buttons. No bottom tabs on these screens. Same minimum touch sizes, balanced vertical whitespace, avoid oversized empty top. Distinct layout direction specified below. Outside screens title of option only.
Option title: B｜极简留白. Visual direction: Noticeably flatter and more spare. Centered login brand/header with smaller elegant serif title, controls placed directly on warm white surface, subtle outlined inputs. Profile compact horizontal avatar treatment above flat edge-aligned rows separated by fine hairlines, NOT grouped floating cards. Settings fine separators and small unboxed blue line icons, no card shadows, calm airy margins. Preserve serif headings and blue identity.
```

### C

```text
Use case ui-mockup. Create a polished Chinese mobile app design comparison board: exactly THREE full portrait screens side by side, left 登录, middle 个人资料, right 设置. Each screen ~390x844 aspect ratio, equal scale, no perspective, no hands, no device hardware, all content readable, complete screens. Large high resolution board. Product 听你五个 aviation English app. Use attached existing icon as small unchanged brand insert on LOGIN only, do not redesign logo. Shared palette warm white #FBFAF7, white cards, text #11161F, blue #1F5ED9, secondary #5D636F, red only logout. Serif Chinese headings like Noto Serif SC, clean sans body, light linear icons. Very refined restrained quiet native UI.
MANDATORY same information on all alternatives. LOGIN: no back arrow, small logo and 听你五个, heading 登录 / 注册; 验证码登录 selected and 密码登录 switch; input +86 手机号; input 验证码 with 获取验证码 at right; main blue 登录 / 注册 button; unchecked consent 我已年满16周岁，并同意《用户协议》《隐私政策》 (links blue, legible two lines allowed); two round WeChat green and Apple black sign in buttons. No marketing slogans or extra explanatory copy. PROFILE: back chevron and 个人资料 header; editable avatar (neutral person silhouette, not app logo), change avatar accessible; only rows 昵称 飞行学员 >, 备考目标 ICAO 4 初考 >, 账号 ID c5d2b011 with copy icon. No phone, gender, region, bio, global save or edit button. SETTINGS: back and 设置 title; 账号安全 >, 隐私与数据 >; separate 语音识别 group with 腾讯 ASR 模型 16k_en >; separate 帮助中心 >; 退出登录 button; bottom 版本 1.0.0 and 蜀ICP备2026045996号-1A. NO profile card in settings, no about/update/rate/share/export/sync/feedback buttons. No bottom tabs on these screens. Same minimum touch sizes, balanced vertical whitespace, avoid oversized empty top. Distinct layout direction specified below. Outside screens title of option only.
Option title: C｜紧凑清晰. Visual direction: Content-forward compact hierarchy but never crowded. Left-aligned strong serif page titles under compact back bar. Login compact brand/title with a narrow underline login-mode tab switch, soft filled inputs and clear action grouping. Profile large left aligned title then horizontal avatar, nickname and target appear as independent softly tinted rounded rows with generous touch zones. Settings 16px radius compact grouped rows, subdued tiny uppercase-free section labels 账号 / 偏好 / 支持. Less ornamental whitespace, everything easy to scan. No new fields or controls.
```
