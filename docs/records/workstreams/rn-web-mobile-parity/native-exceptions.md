# 原生允许差异清单

只有系统平台无法由 App 控制的表现可以进入本清单。普通布局、文案、图标、颜色、弹层和返回差异不得登记为原生例外。

| ID | 范围 | 允许差异 | App 自有 UI 验收要求 | 状态 |
| --- | --- | --- | --- | --- |
| native.status-bar | iOS / Android | 系统状态栏图标、时间与系统字体 | 内容安全区、背景衔接与顶部留白符合 Web 视觉 | 已确认 |
| native.home-indicator | iOS | 系统手势条和底部安全区 | 悬浮导航位置及内容避让与 Web 一致 | 已确认 |
| native.keyboard | iOS / Android | 系统键盘皮肤和高度 | 输入、按钮、协议、错误提示不被遮挡 | 已确认 |
| native.permission-dialog | iOS / Android | 麦克风、通知等系统权限弹窗 | 弹窗前说明页及选择后的 App 状态与 Web 一致 | 已确认 |
| native.back-gesture | iOS / Android | 系统边缘/实体返回反馈 | 返回目标、退出确认与状态恢复与 Web 一致 | 已确认 |
| native.text-raster | iOS / Android | 字体抗锯齿的系统级细微像素差异 | 字体、字号、字重、行高、换行和几何位置一致 | 已确认 |
| native.audio-lifecycle | iOS / Android | 音频焦点、路由和后台系统行为 | App 播放、暂停、失败、恢复等可见状态与 Web 语义一致 | 已确认 |
