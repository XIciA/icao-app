# 阶段 6 验收证据

- `android-fresh-build.png`、`ios-fresh-build.png`：本轮 Debug 原生构建重新安装后的听力目录。
- `android-keyboard-login.png`：登录页键盘开启时输入框、主按钮与协议仍可见。
- `android-bottom-sheet.png`：退出确认 Bottom Sheet 的遮罩、安全区、确认与取消操作。
- `android-audio-resume.png`：真实音频播放并返回随身听页面。
- `widths/settings-{360,375,390,430}.png`：四种逻辑宽度的设置页。

Android 全量原生构建期间模拟器 System UI 曾因资源压力出现 ANR；重启模拟器后 App 正常启动，听力目录无 Render Error。无效 ANR 截图已被重新运行结果覆盖，不计入产品缺陷。
