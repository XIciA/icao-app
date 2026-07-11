# UI 风格规范（可量化版）

> 本文是本项目 UI 设计的**唯一风格基准和 Codex 强制执行规范**，目标是让不同人/工具做出的界面风格一致、可复刻。
> **除非用户明确要求改变整体风格方向，否则不得另起一套视觉语言，不得替换品牌配色、字体体系、圆角体系、导航模式、卡片气质或图标体系。**
> **令牌（颜色/圆角/字体/间距/阴影）是硬约束，必须遵循**；**配方是已验证的复刻起点**，应从原配方开始实现，只能为内容长度、页面状态和移动端适配做受控调整。
>
> 定位：面向 React Native App 1:1 还原的**移动端学习产品设计稿**。感觉关键词——精致、干净、轻盈、暖白、克制、有学习工具的专业感。它是一个"可以认真学习的 App"，不是营销官网、不是后台系统。
>
> `app/globals.css` 是令牌数值的代码实现源，本文档是设计方向、语义和使用规则的判断源。两者发生冲突时，不得自行创造第三种方案：令牌数值以 `app/globals.css` 为准，设计语义与风格方向以本文档为准，并在同一任务中同步冲突项。

---

## A. Codex 执行契约（开始 UI 工作前必须完整阅读）

### A.1 不可改变的设计方向

以下内容是项目的视觉身份，属于**最高级硬约束**：

- 产品始终是移动端 ICAO 学习工具，不得做成营销落地页、后台系统、通用 SaaS 或娱乐化产品。
- 视觉气质固定为：**精致、干净、轻盈、暖白、克制、专业、有学习内容质感**。
- 品牌体系固定为：**暖白背景 + 墨蓝中性 + 钴蓝主色 + 少量琥珀强调 + destructive 错误红**。
- 字体体系固定为：Noto Serif SC 承担内容标题，Geist 承担正文与 UI，Geist Mono 只承担编号、时间、音标和纯数据。
- 组件气质固定为：较大圆角、轻边框、轻阴影、顶部细高光、克制的半透明和模糊。
- 移动端核心学习流程优先，页面必须让用户清楚知道“学到哪、现在做什么、完成后去哪”。
- 当前只设计浅色主题；不得顺手补深色模式，也不得引用现有 `.dark` 灰阶作为新页面依据。

### A.2 规则等级

| 等级 | 含义 | Codex 执行方式 |
|---|---|---|
| **硬约束** | 设计方向、语义令牌、颜色分工、字体体系、移动优先、浅色阶段、品牌名、图标体系 | 必须执行；不得凭审美改写 |
| **标准配方** | 本文第 3–6 章的字号、间距、阴影、卡片、导航、按钮、Sheet、状态组件配方 | 默认从原配方直接复用；只做与内容、状态、尺寸有关的受控调整 |
| **结构约定** | 共享原子件、模块目录、Flow、预览路由、AppShell 接入方式 | 按第 8 章先判断任务类型，再选择对应结构 |
| **受控例外** | 安全区、设备画布、精确字号、透明度、动画比例、最大高度、3D 翻卡等标准令牌无法准确表达的值 | 只能复用本文或已验收页面中已经出现的值，不得随意发明新值 |

“合理判断”不等于自由发挥。合理判断只允许在以下范围内发生：

- 选择本文已经定义的令牌、配方或共享组件；
- 根据内容多少调整排版密度，但不改变颜色、字体、圆角和层次语言；
- 根据默认、选中、禁用、加载、空、错误、权限失败等状态组合已有模式；
- 为 360–430px 手机宽度和安全区解决溢出、遮挡、裁切问题；
- React Native 复现时用等价的原生实现表达同一视觉结果，而不是重新设计。

### A.3 冲突处理优先级

遇到不一致时，按以下顺序判断：

1. 用户当前明确的任务范围与明确决策；
2. 本文 A.1 的设计方向和各章硬约束；
3. `app/globals.css` 中的令牌数值；
4. 第 7 章共享原子件和第 6 章标准配方；
5. 已验收的同类标杆页面，优先 OPI 卡片、单词学习页和同模块现有页面；
6. 普通旧页面代码。

旧代码中的偶然写法不自动成为新规范。若旧页面与本文冲突，只处理当前任务明确涉及的范围，不得把冲突样式复制到新页面，也不得顺手重设计无关页面。

如果完成任务必须新增品牌色、字体、圆角体系、导航模式、卡片语言或大范围动效，说明任务已经超出当前规范。除非用户明确授权改变风格方向，否则 Codex 必须停止这部分扩展，保留现有风格并说明需要新的设计决策。

### A.4 UI 任务的强制起手顺序

每次新增或修改 UI，Codex 必须按顺序执行：

1. 读完本文，不只读取颜色章节或单个组件配方；
2. 明确用户本次只要求修改哪些页面、组件和状态；
3. 查看最接近的现有页面与第 7 章共享原子件；
4. 判断任务属于“已有页面优化、单屏功能、多屏 Flow、主应用详情页、状态页”中的哪一类；
5. 列出将复用的令牌、组件和配方后再开始实现；
6. 完成后按第 15 章执行验收，不得只以“能运行”作为完成标准。

### A.5 Web 设计稿与 React Native 复现的一致性

本文中的 Tailwind class 是当前可运行设计稿的精确实现证据，不代表 React Native 可以重新解释视觉方向。React Native 开发时必须保留相同的语义、层级、比例和状态表现：

| Web 设计稿依据 | React Native 执行要求 |
|---|---|
| `background` / `card` / `primary` 等语义令牌 | 建立对应的 TypeScript 主题令牌，不在组件内散写颜色 |
| `font-serif` / `font-sans` / `font-mono` | 建立对应文本样式，保持标题、正文、数据的职责分工 |
| `rounded-*` 圆角梯度 | 建立统一圆角常量，按组件语义映射，不逐页面猜圆角 |
| 轻边框 + 轻阴影 + `ring-hairline` | 用 `View`、边框和阴影复现同一层次，不改成厚重默认卡片 |
| `px-5` / `px-4` / `gap-*` | 建立统一 spacing 常量，保持页面密度和组件节奏 |
| 安全区与悬浮底部导航 | 使用 `react-native-safe-area-context`、窗口尺寸与原生布局能力，但视觉位置和内容避让必须与设计稿一致 |
| Bottom Sheet、状态页、表单状态 | 使用 React Native 原生交互能力实现，但外观、信息顺序和状态语义按本文复现 |

React Native 可以为系统返回手势、键盘避让、安全区和性能采用原生实现；这类平台适配不能成为更换导航结构、组件气质或视觉语言的理由。复现判断以 375 × 812 设计稿和本文令牌/配方为共同依据。

---

## 0. 使用原则

1. **优先用语义令牌，不写死颜色**：用 `bg-background` / `text-foreground` / `text-primary` 等，禁止 `bg-white` `text-black` `#xxxxxx` 等硬编码。
   - `PhoneFrame` 的黑色物理边框、透明遮罩和阴影属于预览基础设施，不属于 App 内部配色，不得把这些写法带入实际页面内容。
2. **优先用令牌梯度**：圆角用 `rounded-xl/2xl/3xl`，常规间距用 Tailwind 间距刻度（`gap-2.5` `px-5`），不要用 `p-[16px]` 重新表达已有标准值。
   - 为精确还原设计稿，字号允许使用本文已定义的任意值，如 `text-[1.7rem]`、`text-[1.05rem]`、`text-[11px]`。
   - 安全区、设备画布、最大视口高度、透明度、按压比例、图片比例和 3D 翻卡等场景，可以使用**本文或已验收页面中已经存在**的任意值，如 `max-h-[92vh]`、`active:scale-[0.98]`、`bg-primary/[0.08]`。
   - 颜色、常规圆角、常规间距和阴影不得为了“看起来差不多”新增任意值；先找现有令牌和配方。
3. **移动优先**：所有页面以 375px 宽度为视觉定稿基准，先在手机壳里好看、好截图，再检查 360px、390px、430px 宽度下不溢出、不遮挡、不裁切。
4. **克制**：主色点到为止，只用于强调进度、当前选择、主要行动、关键状态；光晕和玻璃只是氛围，不能抢内容。
5. **只做浅色主题**：深色模式暂不设计，现有 `.dark` 不作参考（详见第 13 章）。
6. **只改任务范围**：优化某个页面时，不得顺手更换全局导航、重做其它模块、增加无关功能或扩大产品范围。

---

## 1. 颜色系统

主题为"暖白 + 墨蓝文字 + 钴蓝主色 + 琥珀 accent"。全部使用 oklch，定义在 `:root`。

### 1.1 核心令牌

| 令牌 | 值 (oklch) | 用途 | class |
|---|---|---|---|
| `--background` | `0.985 0.004 90` | 暖白页面底色 | `bg-background` |
| `--foreground` | `0.2 0.02 264` | 墨蓝近黑，主文字 | `text-foreground` |
| `--card` | `1 0 0` | 纯白卡片面 | `bg-card` |
| `--card-foreground` | `0.2 0.02 264` | 卡片内文字 | `text-card-foreground` |
| `--primary` | `0.52 0.2 262` | **钴蓝主色**（品牌、行动、进度、选中） | `bg-primary` / `text-primary` |
| `--primary-foreground` | `0.99 0.005 90` | 主色上的文字 | `text-primary-foreground` |
| `--secondary` | `0.96 0.008 90` | 暖灰次级面（安静背景） | `bg-secondary` |
| `--muted` | `0.96 0.008 90` | 弱化背景 | `bg-muted` |
| `--muted-foreground` | `0.5 0.02 264` | 次级/辅助文字 | `text-muted-foreground` |
| `--accent` | `0.62 0.13 70` | **琥珀点缀**（少量强调，如高亮标签） | `bg-accent` / `text-accent` |
| `--accent-foreground` | `0.99 0.005 90` | accent 上的文字 | `text-accent-foreground` |
| `--destructive` | `0.58 0.21 25` | 危险/错误 | `text-destructive` |
| `--border` | `0.2 0.02 264 / 9%` | 细边框（墨蓝 9% 透明） | `border-border` |
| `--input` | `0.2 0.02 264 / 12%` | 输入框边框 | — |
| `--ring` | `0.52 0.2 262` | 聚焦环（同主色） | `ring-ring` |

### 1.2 使用规则

- **主色 primary**：是唯一的"品牌强调色"。多用低透明度形式营造轻盈感，常见档位：
  - `bg-primary/[0.06]`、`bg-primary/[0.08]`、`bg-primary/10` —— 图标底、选中态、标签底
  - `text-primary`、`text-primary/80` —— 强调文字、元信息
  - `shadow-primary/5`、`shadow-primary/10` —— 柔和彩色阴影
  - `border-primary/20` —— 强调描边
- **accent 琥珀**：只在极少数需要区别于主色的高亮处使用，不要成片使用。语义分工上，琥珀代表**等待 / 维护 / 中性警示**（如"服务维护中"页、内容高亮标签），区别于代表行动的钴蓝。
- **destructive 红**：代表**错误 / 危险 / 不可逆操作**（如加载失败、退出登录确认按钮、注销账号危险区）。危险操作按钮用 `bg-destructive text-destructive-foreground`。
- **中性灰**：`secondary` / `muted` 承担安静背景，`muted-foreground` 承担辅助文字。
- **禁止**：紫色/violet 为主色；超过"钴蓝 + 暖白/墨蓝中性 + 琥珀"这套配色引入第 4 个强调色。

语义色必须按下表选择，不得只凭视觉喜好换色：

| 语义 | 使用颜色 | 禁止做法 |
|---|---|---|
| 品牌、主要行动、选中、进度、普通成功结果 | `primary` | 不新增绿色或紫色作为新的主强调色 |
| 等待、维护、中性提醒、内容高亮 | `accent` | 不把琥珀用于大面积品牌主视觉 |
| 错误、危险、不可逆操作 | `destructive` | 不用 primary 弱化危险操作 |
| 次要信息、禁用、安静背景 | `secondary` / `muted` / `muted-foreground` | 不用随机灰色或硬编码透明黑 |

状态含义不能只依赖颜色表达；选中、错误、等待、禁用等状态同时使用文字、图标、形状、描边或透明度中的至少一种辅助信号。

### 1.3 氛围工具类（globals.css 已定义）

- `.bg-glow` —— hero/区块顶部的柔和径向主色光晕（装饰用）。
- `.ring-hairline` —— 卡片顶部内高光（`inset 0 1px 0 rgba(白,0.7)`），玻璃卡片的标配。
- 环境光斑写法：`absolute h-64 w-64 rounded-full bg-primary/[0.10] blur-3xl`（`aria-hidden`、`pointer-events-none`）。

---

## 2. 圆角系统

基准 `--radius: 1rem`，派生梯度（在 `@theme inline` 中）：

| class | 计算 | 实际值 | 典型用途 |
|---|---|---|---|
| `rounded-sm` | `radius * 0.6` | 0.6rem | 小标签、小控件 |
| `rounded-md` | `radius * 0.8` | 0.8rem | 输入、次级按钮 |
| `rounded-lg` | `radius * 1.0` | 1rem | 默认按钮 |
| `rounded-xl` | `radius * 1.4` | 1.4rem | 图标容器、小卡片 |
| `rounded-2xl` | `radius * 1.8` | 1.8rem | **主力卡片/列表项** |
| `rounded-3xl` | `radius * 2.2` | 2.2rem | 大卡片、弹层 |
| `rounded-4xl` | `radius * 2.6` | 2.6rem | 超大容器 |
| `rounded-full` | — | 胶囊 | 按钮、导航、标签、头像 |

原则：**卡片用 `rounded-2xl`，可点击的胶囊控件用 `rounded-full`**，图标底盒用 `rounded-xl`。

---

## 3. 字体与文字层级

在 `app/layout.tsx` 通过 `next/font` 引入，class 应用于代码：

- **`font-serif`（标题）**：`Noto Serif SC`，字重 500/600/700/900。用于标题、模块名、课程名、重点数据 —— 给学习内容"内容质感"。
- **`font-sans`（正文/UI）**：`Geist`。用于正文、按钮、说明、辅助信息。
- **`font-mono`**：`Geist Mono`。用于音标、编号、时间、纯数据。

> 全局默认 `html { font-sans }`；标题处**显式**加 `font-serif`。Noto Serif SC 与 Geist 是两套主字体；Geist Mono 仅是编号、时间、音标和纯数据使用的功能字体，不得扩展为第三套品牌字体。不得再引入其它字体。

### 3.1 文字配方（来自现有页面）

| 场景 | 配方 |
|---|---|
| 页面主标题 (h1) | `font-serif text-[1.7rem] font-semibold leading-tight tracking-tight text-foreground` + `text-balance` |
| 卡片标题 (h3) | `font-serif text-[1.05rem] font-semibold tracking-tight text-foreground` |
| 正文/说明 | `text-sm leading-relaxed text-muted-foreground` + 长文加 `text-pretty` |
| 次级说明 | `text-xs leading-relaxed text-muted-foreground` |
| 元信息强调 | `text-[11px] font-medium text-primary/80` |
| 微标签 | `text-[0.625rem] font-medium`（配合胶囊底色） |
| 正文行高 | 统一 `leading-relaxed`（≈1.6），正文字号不小于 `text-xs`(12px) |

---

## 4. 间距与布局

- **布局方式优先级**：Flexbox 优先（`flex items-center gap-3`）→ 复杂二维再用 Grid → 浮层、底部抽屉、悬浮导航、手机壳和装饰光斑可使用 fixed/absolute → 其它内容布局避免依赖绝对定位。
- **兄弟元素间距用 gap**：同一组兄弟元素不要同时用 `gap`、`space-*` 和子元素 margin 重复控制相同方向的间距。容器 `padding` 控制内边距，可以且通常需要与 `gap` 同时使用；禁止 `space-*`。
- **页面水平内边距**：默认基准 `px-5`；内容密集页（表单、设置分组、法律条款、状态页等）可用 `px-4` 以换取更多内容宽度。同一页面内保持一致，不要混用。
- **列表项间距**：`flex flex-col gap-2.5`。
- **底部留白**：有底部导航时内容区 `pb-24`（给悬浮导航让位）。
- **安全区**：
  - 顶部 header：`pt-[max(1.75rem,calc(env(safe-area-inset-top)+0.6rem))]`，或用工具类 `pt-safe`。
  - 底部：`pb-[max(1rem,env(safe-area-inset-bottom))]`，或用工具类 `pb-safe`。

---

## 5. 阴影与层次

轻阴影 + 细边框 + 顶部高光，构成柔和的"浮起"感，禁止厚重阴影。

| 场景 | 配方 |
|---|---|
| 普通卡片 | `shadow-sm ring-hairline` |
| 主力浮起卡片 | `shadow-lg shadow-primary/5 ring-hairline` |
| 弹层/下拉 | `shadow-xl shadow-primary/10 ring-hairline` |
| 悬浮导航 | `shadow-lg shadow-black/5 ring-hairline` |

玻璃质感组合：`bg-card/80 backdrop-blur-xl ring-hairline`（半透明 + 模糊 + 顶部高光）。适度使用，别全屏堆。

### 5.1 动效令牌（globals.css 已定义）

- `animate-breathe` —— 品牌标的呼吸缩放，用于启动页、全局加载页的品牌视觉。
- 加载态标准：品牌标 `animate-breathe` + 环形 spinner（`animate-spin` 的圆环，`border-primary/20` 底 + `border-t-primary` 高亮）。
- 3D 翻卡：`perspective-1200` / `preserve-3d` / `backface-hidden` / `rotate-y-180`（见第 12 章 OPI 卡片）。

### 5.2 动效使用边界

- 动效只用于解释状态变化、提供按压反馈、表达加载过程或支持学习动作，不用于制造与任务无关的炫技效果。
- 新页面优先复用 `transition-all`、`transition-colors`、`active:scale-*`、`animate-spin`、`animate-breathe` 和现有 3D 翻卡，不得自行引入另一套动画语言。
- 同一屏避免多个持续循环动效同时争夺注意力；`animate-breathe` 主要用于品牌启动和全局加载场景。
- 为连续动效保留减少动态效果的降级空间；关闭动效后不得影响信息理解和核心操作。

---

## 6. 组件配方

以下配方摘自现有页面，是复刻的起点。Codex 必须先复制最接近的配方，再根据内容长度、页面状态和屏幕宽度做最小调整；不得从空白样式开始重新设计同类组件。

允许调整：文本换行、内容区高度、滚动区域、状态文案、图标语义、360–430px 适配。不得调整：品牌配色、字体分工、圆角体系、阴影气质、图标体系和主要导航模式。

### 6.1 模块 / 列表项卡片（可点击）

```
group flex min-h-[5rem] items-center gap-3.5 rounded-2xl border border-border/70
bg-card/80 px-4 py-3 text-left shadow-lg shadow-primary/5 ring-hairline
backdrop-blur-xl transition-all active:scale-[0.98]
```
- 图标底盒：`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary`，图标 `h-5 w-5`。
- 禁用态：`cursor-not-allowed opacity-65`（去掉 `active:scale`）。
- 右侧箭头：`ChevronRight h-5 w-5 text-muted-foreground`，hover 位移 `group-hover:translate-x-0.5`。

### 6.2 状态标签（胶囊）

- 启用：`rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-medium text-primary`
- 禁用：`rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground`

### 6.3 悬浮底部导航（BottomNav）

- 外层：`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))]`
- 药丸容器：`pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1.5 shadow-lg shadow-black/5 ring-hairline backdrop-blur-xl`
- Tab 项：`rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95`
  - 选中：`bg-primary/10 text-primary`
  - 未选：`text-muted-foreground hover:text-foreground`
  - 图标 `h-5 w-5`

### 6.4 紧凑胶囊按钮（如课程选择器）

```
flex items-center gap-1.5 rounded-full border border-primary/20 bg-card/80
py-1.5 pl-3 pr-2 shadow-sm ring-hairline backdrop-blur-xl transition-all active:scale-[0.97]
```
- 内含 `font-serif text-xs font-semibold` 标签 + `text-primary` 图标。

### 6.5 下拉/弹层列表

- 容器：`absolute z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-xl shadow-primary/10 ring-hairline backdrop-blur-xl`
- 选项：`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors`，选中 `bg-primary/[0.06]`，hover `hover:bg-secondary/60`，选中项右侧 `Check h-4 w-4 text-primary`。
- 需配一层透明遮罩 `fixed inset-0 z-10` 处理点击外部关闭。

### 6.6 圆形图标按钮（如头像/登录入口）

```
flex h-10 w-10 items-center justify-center rounded-full bg-secondary
text-muted-foreground ring-hairline transition-all active:scale-95
```

### 6.7 shadcn Button（`components/ui/button.tsx`）

基于 Base UI 封装的 `Button` 已内置以下 variant/size，通用表单/操作按钮**优先用它**而非手写：
- variant：`default`（主色实心）、`outline`、`secondary`、`ghost`、`destructive`、`link`
- size：`default`(h-8)、`xs`、`sm`、`lg`(h-9)、`icon`/`icon-xs`/`icon-sm`/`icon-lg`
- 交互态已内置：`focus-visible` 环、`active:translate-y-px`、`disabled:opacity-50`

> 强品牌感的胶囊控件（导航、卡片、选择器）可按 6.1–6.6 手写；标准操作按钮用 shadcn Button。

### 6.8 交互反馈约定

- 可点击元素统一加轻微按压：`active:scale-95` 或 `active:scale-[0.98]` / `[0.97]`。
- 过渡统一 `transition-all` / `transition-colors`。
- 聚焦可见：交互元素保留 `ring` 焦点态，不要 `outline-none` 后不补焦点样式。

### 6.9 顶部返回栏 / 居中标题栏

子页统一顶栏：左侧返回 `ChevronLeft` 圆形按钮，标题 `font-serif` 居中，右侧可留操作位（对称占位以保证标题真正居中）。返回按钮复用 6.6 的圆形图标按钮。已封装为 `AuthTopBar` / `AccountTopBar`（见第 7 章），新页面直接复用。

### 6.10 底部抽屉 / Bottom Sheet（移动 App 感核心）

从底部升起的面板，用于详情、确认、选择：
- 遮罩：`fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm`（点击关闭）。
- 面板：`absolute inset-x-0 bottom-0 rounded-t-3xl bg-card shadow-xl ring-hairline` + `max-h-[92vh]`，内部内容区 `overflow-y-auto`，底部按钮区固定。
- 顶部拖拽指示条：`mx-auto h-1.5 w-10 rounded-full bg-border`。
- 详情类（OPI 热点、文章、模考）与确认类都用它。

### 6.11 确认弹窗（危险操作）

底部抽屉形态承载确认：标题 + 说明 + 主/次按钮竖排。危险确认（退出登录、删除）主按钮用 `bg-destructive text-destructive-foreground`，次按钮为取消（`outline` 胶囊）。

### 6.12 空 / 异常状态页

垂直居中：图标徽标（`StateHero`）→ 标题（`font-serif`）→ 说明（`text-sm text-muted-foreground`）→ 主/次按钮。用于无网络、加载失败、维护中、权限说明/被拒。已封装为 `CenteredState`（见第 7 章）。
- 图标徽标：大号圆角盒 + 光晕，语义色跟随状态（普通=primary，错误/危险=destructive，等待/维护=accent）。

### 6.13 危险区（Danger Zone）

不可逆操作页：用 `destructive` 语义色的警告卡说明后果，配一个"我已知晓"确认勾选框 gating 底部危险按钮（**默认禁用，勾选后才启用**）。见注销账号页。

### 6.14 结果态（成功 / 失败）

一个屏幕内用状态切换 `idle → success → error`：提交类页面成功显示庆祝态（primary 图标 + 感谢文案 + 后续按钮），失败显示错误态（destructive 图标 + 重试/取消）。复用 6.12 的居中布局。

### 6.15 表单原子件（见第 7 章已封装组件，优先复用）

- 带标签输入 `AuthField`（可带前缀如 `+86`、可带图标，**二者不同时用**，见第 9 避坑）。
- 密码输入 `PasswordField`（右侧显隐切换）。
- 6 格验证码 `CodeField`（`aspect-square` 单元格，激活格描边高亮）。
- 带字数统计的多行 `TextArea`（右下角 `x/max`）。
- 胶囊多选 `ChipSelect`（选中 `bg-primary text-primary-foreground`，未选 `bg-secondary`）。
- 可含链接的勾选框 `Checkbox`（协议同意，注意按钮嵌套问题，见第 9 避坑）。

### 6.16 分段控件 / Tab 与筛选 chip

- 分段控件（如"标签｜高亮｜笔记"、模考培训模式）：`rounded-full bg-secondary p-1` 容器 + 选中项 `bg-card shadow-sm text-foreground`、未选 `text-muted-foreground`。
- 颜色筛选 chip：小圆点 + 文案胶囊，选中加 `ring-2 ring-primary/30`。

### 6.17 带序号的分区标题

用于结构化内容（模考板块、法律条款）：`font-mono` 序号（`01` / `02`）或圆角序号徽标 + 中文标题（`font-serif`）+ 可选英文小标（`text-[11px] uppercase tracking-wide text-muted-foreground`）。

### 6.18 内容卡（图在上）

区别于 6.1 的横向列表卡：图片在上的竖版卡片，`overflow-hidden rounded-2xl`，图片 `aspect-[16/10] object-cover`，下方 `p-4` 放标题/说明/标签。用于 OPI 热点、文章、图片题样板。

---

## 7. 共享原子件索引（先复用，不要重写）

已沉淀为具名组件的模式集中在各模块的 `*-ui.tsx`，**新页面必须先在这里找，不要重复造轮子**（否则会造出样式略偏的版本）。

### 7.1 `components/auth/auth-ui.tsx`
`BrandMark`（品牌标 飞猪 ICAO）、`AuthScreen` / `AuthTopBar` / `AuthHeading`、`AuthField`（带标签输入，支持 `prefix` / `icon`）、`PasswordField`（显隐切换）、`CodeField`（6 格验证码）、`PillButton`（48px 品牌胶囊，`variant="primary|outline"`）、`TextLink`、`Checkbox`、`Divider`。

### 7.2 `components/account/account-ui.tsx`
`AccountScreen` / `AccountTopBar`（居中标题 + 返回）、`SectionLabel`、`RowGroup` / `Row`（iOS 式设置分组卡，`Row` 支持左图标、右值/箭头/开关）、`Avatar`。

### 7.3 `components/info/info-ui.tsx`
`DocHeader` / `DocBody` / `Clause`（法律条款编号排版）、`FieldLabel`、`TextArea`（带字数）、`ChipSelect`（胶囊多选）。

### 7.4 `components/state/state-ui.tsx`
`StateScreen` / `StateTopBar`（带关闭键）、`StateHero`（带光晕的图标徽标，语义色可配）、`CenteredState`（空/异常状态通用布局）、`ReasonItem`（权限说明要点行）。

> 跨模块复用是常态：account 的 `RowGroup/Row`、auth 的 `PillButton/BrandMark` 已被 info/state 反复借用。需要相似控件时优先 import 现有件。

---

## 8. 页面级架构模式

页面结构先按任务规模判断。成套多屏功能统一按以下骨架搭建；单屏功能和主应用详情页按 8.3 接入，但仍必须复用第 7 章原子件和第 6 章配方，保证产出的页面和现有模块“长一个样”。

### 8.1 模块目录约定
存在两个及以上屏幕、独立导航或状态流的成套模块，在 `components/<模块>/` 下使用：
- `<模块>-ui.tsx` —— 该模块共享原子件；
- 各屏幕组件 `xxx-screen.tsx`（一屏一个文件）；
- `<模块>-flow.tsx` —— 状态机，在多个屏幕间切换（承载"上一步/下一步/关闭"导航）。

只有一个屏幕、一个 Sheet 或一个主应用全屏详情的功能，不强制创建空的 `*-ui.tsx` 和 `*-flow.tsx`；应直接复用现有原子件，并按 8.3 接入。若同类局部组件开始重复，再抽取共享原子件。

### 8.2 预览路由约定
每个成组的设计稿配一个独立预览路由 `app/<模块>/page.tsx`：套 `PhoneFrame` 手机壳，内部用 hub/flow 把多屏串起来逐屏点看。现有：`/auth`、`/account`、`/info`、`/state`。**这些是设计稿预览入口，未接入主应用登录态/数据。**

### 8.3 主应用内全屏子页
接入主应用的功能页（如我的标注、随身听、模考、OPI 热点）通过 `AppShell` 的 `detail` 状态切换全屏视图 + 顶部返回栏挂载，**不走文件路由跳转**。标题在 `app-shell.tsx` 的 `detailTitles` 与发现页入口两处登记。

### 8.4 命名约定
- 文件名/组件名一律**英文**；
- 界面文案一律**中文**；
- 品牌名保留英文并固定为 **飞猪 ICAO**；
- 示例/占位数据可用，但标注清楚"设计稿、未接后端"。

示例文案不得把尚未实现的能力描述成已经真实可用。例如未接同步时，不得承诺“已跨设备同步”；模拟音频不得承诺“已支持后台播放”。可以展示目标体验，但必须用“设计稿示例、功能待接入、即将上线”等明确状态表达。

### 8.5 任务类型与结构选择

| 任务类型 | 采用结构 | 优先复用 |
|---|---|---|
| 修改已有页面 | 保持现有文件和导航结构 | 同页面现有组件 + 第 6 章配方 |
| 单屏功能 / 单个 Sheet | 单组件或当前模块内组件 | 第 6、7 章现有原子件 |
| 两屏以上成套流程 | `*-ui.tsx` + `*-screen.tsx` + `*-flow.tsx` | auth/account/info/state 的现有结构 |
| 独立预览设计稿 | `app/<模块>/page.tsx` + `PhoneFrame` + Flow | 8.1、8.2 |
| 主应用内全屏功能 | `AppShell` detail 状态 + 返回栏 | 8.3、6.9 |
| 空/异常/权限状态 | 现有状态原子件和状态 Flow | `CenteredState` / `StateHero` / `ReasonItem` |
| 标准提交或表单操作 | shadcn Button 和已有表单原子件 | 6.7、6.15 |

---

## 9. 避坑清单（已踩过的坑，务必规避）

1. **`className` 合并**：手写组件用 `{...props}` 展开时，外部传入的 `className` 会覆盖内部基础样式。必须显式合并：`` className={`基础类 ${styles} ${className}`} ``。（曾导致 `PillButton` 主色丢失。）
2. **按钮嵌套 hydration 报错**：`<button>` 内不能再嵌 `<button>`。带内嵌链接的勾选框，要让"勾选框本身"是唯一 button，文案/链接作它的**同级兄弟**，不要包在同一个 button 里。
3. **中文全角引号与字符串定界符冲突**：JS/TS 字符串里出现 `"…"` 会与 `"` 定界符冲突导致解析失败。中文强调统一用书名号 **「」**，不要用全角双引号。
4. **输入框 `icon` 与 `prefix` 二选一**：`AuthField` 同时传 `icon` 和 `prefix`（如 `+86`）会在左侧重叠。手机号这类带区号前缀的，去掉图标。
5. **Turbopack 陈旧报错**：改完文件后浏览器错误覆盖层可能残留旧报错——以 `snapshot` 读到的真实 DOM 为准，必要时切换路由/重开页面清除覆盖层，不要被过期截图误导。

---

## 10. 图标

- 统一使用 **lucide-react** 线性图标。
- 常用尺寸：正文内 `h-3.5 w-3.5`，卡片/导航 `h-5 w-5`，装饰性大图标另议。
- 图标默认 `shrink-0`，颜色跟随语义令牌（`text-primary` / `text-muted-foreground`）。
- **禁止**用 emoji 当图标；禁止手绘复杂 SVG 插画/地图。

---

## 11. 移动端预览与画布

- 通过 `components/phone-frame.tsx` 在桌面用 iPhone 手机壳 `<iframe>` 预览，屏幕尺寸 **375 × 812**。
- 手机壳只是查看工具；页面是否成功，看它在 **375px 宽**下是否精致、稳定、好截图、好复刻。
- `PhoneFrame` 外层钛金边框、黑色边框和桌面背景不属于 App UI；不得用手机壳自身的宽度、圆角和黑色作为页面设计依据。
- 375px 是视觉定稿基准；完成后至少检查 360px、390px、430px。允许更宽屏增加自然留白，但不得改变导航结构、信息优先级和组件气质。
- 实际 App 内容不得依赖固定手机壳宽度，不得出现横向滚动、右侧裁切、底部导航遮挡正文或安全区失效。
- 不要为桌面展示效果牺牲移动端 App 的紧凑感和沉浸感。

---

## 12. 学习页方向（最高优先级参考）

OPI 卡片、单词学习页是**风格标杆**，应更沉浸、更专注：

- 减少无关装饰，聚焦题目、音频、录音、答案、进度、下一步。
- 有清晰节奏：知道"学到哪 / 现在做什么 / 完成后去哪"。
- 工具按钮、辅助信息、状态提示不互相抢戏。
- OPI 卡片翻面用 3D 翻卡工具类（见 5.1）。

内容页（发现/资源/文章/课程）可比学习页更舒展，但仍是学习 App 的**补充内容**，不得倒回营销官网风格。

---

## 13. 深色模式（待定）

当前 `.dark` 仍是 shadcn 默认灰阶，**未按暖白钴蓝方向调校**。

- 现阶段**只交付浅色主题**，不要以现有 `.dark` 值作为设计参考。
- 若未来要做深色，应重新推导一套"暖白钴蓝"对应的深色映射，再回来补齐本节。

---

## 14. Codex 执行流程

### 14.1 实现前

- 写清本次任务范围：哪些页面、组件、状态需要改变，哪些明确不动。
- 在第 7 章和现有代码中查找可复用组件；不得先写一个视觉相近的新组件再寻找复用机会。
- 选择一个最接近的已验收页面作为结构和质感参考；学习页优先参考 OPI 卡片和单词学习页。
- 确认要使用的颜色语义、字体层级、圆角、页面内边距、卡片和按钮配方。
- 判断是否需要展示默认、选中、禁用、加载、空、错误、权限失败等状态。

### 14.2 实现中

- 先完成屏幕结构和信息层级，再放入装饰光晕、模糊和动效。
- 从现有配方复制 className，做最小必要调整，不得凭感觉重写同类组件。
- 每新增一种视觉写法，都先确认是否能由现有令牌、配方或原子件表达。
- Mock 数据只服务界面展示，不得为了假数据引入与真实产品逻辑冲突的文案或入口。
- 只处理用户要求的范围；发现其它页面存在旧样式时记录即可，不得顺手扩散修改。

### 14.3 实现后

- 在 375 × 812 下逐屏查看默认状态和关键交互状态，不能只看静态首屏。
- 补查 360px、390px、430px 下的溢出、遮挡、裁切、拥挤和安全区。
- 检查长中文、长英文、数字、空数据、禁用、加载、错误状态是否破坏布局。
- 检查返回路径、Sheet 关闭、选择状态、按钮按压和焦点反馈是否清楚。
- 运行可用的类型检查和构建验证；构建通过不代替移动端视觉验收。
- 查看最终差异，确认没有引入新品牌色、新字体、新导航、新卡片语言或无关页面变化。

### 14.4 完成定义

一项 UI 工作只有同时满足以下条件才算完成：

1. 用户要求的页面和状态已经覆盖；
2. 与本文设计方向一致，没有另起一套风格；
3. 优先复用了现有组件和配方；
4. 375px 视觉完成度达标，360–430px 无明显布局问题；
5. 示例数据和功能状态没有逻辑冲突；
6. 类型检查、构建或可用的工程验证没有新增错误；
7. Codex 的交付说明能够指出视觉变化、涉及文件和预览入口。

---

## 15. 自检清单（改动前后都问一遍）

- [ ] 是否只用了语义令牌，没有硬编码颜色？
- [ ] 配色是否仍在"钴蓝 + 暖白/墨蓝中性 + 琥珀"范围内，没引入紫色或第 4 强调色？
- [ ] 圆角/常规间距是否走令牌梯度，任意值是否仅复用了本文允许的受控例外？
- [ ] 标题是否 `font-serif`、正文是否 `font-sans`？
- [ ] 卡片是否是"轻边框 + 轻阴影 + ring-hairline"的柔和浮起，而非厚重阴影？
- [ ] 可点击元素是否有 `active:scale` 按压反馈和焦点态？
- [ ] 在 375px 宽下是否精致、好截图、好给 React Native 复刻？
- [ ] 在 360px、390px、430px 下是否没有溢出、遮挡、裁切或导航挤压？
- [ ] 是否让学习动作更清楚，而不是增加视觉噪音？
- [ ] 需要的控件/布局是否**先在第 7 章原子件索引里找过**，而不是重新手写？
- [ ] 是否先按第 8.5 节判断任务类型；多屏模块是否遵循 `*-ui.tsx` + 各屏幕 + `*-flow.tsx` + 预览路由骨架？
- [ ] 文件/组件名是否英文、文案是否中文、品牌名是否为"飞猪 ICAO" ？
- [ ] 示例数据和文案是否明确区分设计预览与真实已实现能力？
- [ ] 是否规避了第 9 章避坑项（className 合并 / 按钮嵌套 / 全角引号 / icon+prefix 重叠 / 陈旧报错）？
- [ ] 语义色是否用对（钴蓝=行动，琥珀=等待/维护，红=错误/危险）？
- [ ] 是否严格限制在用户要求的页面和状态范围内，没有顺手重设计其它模块？
- [ ] 是否没有引入新的品牌色、字体、圆角体系、导航模式、卡片语言或图标体系？
