# 阶段 5 验收证据

## 自动检查

- `pnpm check`：TypeScript、ESLint、4 个 Jest 套件 / 6 个测试全部通过。
- `pnpm doctor`：19/19 通过。
- `expo export --platform all`：Android、iOS、Web 打包成功，18 条静态路由。
- Android 深链巡检 26 条阶段 5 路由，全部可进入，无 `Render Error`。

## 截图

- `android/settings.png`：设置页及账户、状态、帮助入口。
- `android/login.png`：认证演示边界、输入与协议入口。
- `android/microphone.png`：Android 真实麦克风授权读取结果。
- `ios/settings.png`：iOS 设置页。
- `ios/login.png`：iOS 登录演示页。
- `ios/microphone.png`：iOS 真实麦克风授权读取结果。
- `ios/system-settings.png`：iOS 模拟器系统设置 App 启动结果。

截图右上角齿轮为 Expo Development Build 的开发工具悬浮入口，不属于产品 UI。
