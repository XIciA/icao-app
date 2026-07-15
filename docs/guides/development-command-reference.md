# ICAO App 常用命令速查

> 归类：开发指南。总导航见 `docs/README.md`。

所有命令默认在项目根目录运行：

```bash
cd /Users/zhouyide/Desktop/icao-app
```


当前错误变成了 Xcode 签名团队未选择。
下一步先只执行：
open ios/ICAO.xcworkspace
然后在 Xcode 中：
左侧点击蓝色的 ICAO 项目。
选择 TARGETS → ICAO。
打开 Signing & Capabilities。
勾选 Automatically manage signing。
在 Team 中选择 益德 周 (Personal Team)，团队编号为 4DPKHJKP5V。
保持手机解锁，再回到终端运行：
pnpm ios:standalone

pnpm ios:standalone
会重新：
用最新代码生成 Release 包；
注入当前公网 HTTPS 地址；
覆盖安装到同一个 iPhone；
自动启动新版 App。

## 最常用

| 使用场景 | 命令 |
| --- | --- |
| 模拟器连接云端服务器 | `pnpm ios:phase2a` |
| iPhone 首次安装或原生重编译 | `pnpm exec expo run:ios --device` |
| iPhone 日常调试，仅启动 Metro | `pnpm start` |
| 完整项目检查 | `pnpm check` |

杀进程
lsof -tiTCP:8081 -sTCP:LISTEN | xargs kill
pnpm ios:phase2a

## iOS 模拟器

首次运行，或修改了原生依赖、权限、`app.json` 后：

```bash
pnpm ios
```

连接云端 API、Supabase 和云端音频进行测试：

```bash
pnpm ios:phase2a
```

连接云端服务器，同时重新编译 Development Build：

```bash
pnpm ios:phase2a:build
```

## iPhone 真机

用数据线连接并解锁 iPhone，首次安装或需要原生重编译时：

```bash
pnpm exec expo run:ios --device
```

按提示选择已连接的 iPhone。也可以直接指定设备名，例如：

```bash
pnpm exec expo run:ios --device "OOMG"
```

Development Build 已安装后，日常修改页面、样式或 TypeScript 代码只需：

```bash
pnpm start
```

在 iPhone 上打开“飞猪 ICAO”。如果没有自动发现 Metro，点击 **Enter URL manually**，输入：

```text
http://Mac的局域网IP:8081
```

查看 Mac 当前局域网 IP：

```bash
ipconfig getifaddr en0
```

真机需要访问云端 API、账号、同步或云端音频时：

```bash
pnpm ios:phase2a
```

脚本可能同时打开模拟器，不影响真机使用；在 iPhone 上打开已安装的 Development Build，连接终端显示的 Metro 地址即可。

## 本地音频备用方式

不连接云端服务器、只使用设计仓库中的本地音频时，打开两个终端：

终端 1：

```bash
pnpm assets:serve
```

终端 2：

```bash
pnpm start
```

## Android

启动 Android 模拟器：

```bash
pnpm android:emulator
```

编译、安装并运行 Android Development Build：

```bash
pnpm android
```

当前日常开发与真机验收以 iOS 为主，Android 保留构建和必要的冒烟检查。

## 检查与诊断

完整检查：

```bash
pnpm check
```

仅检查 App：

```bash
pnpm check:app
```

仅运行 TypeScript 检查：

```bash
pnpm typecheck
```

检查 Expo 环境和依赖：

```bash
pnpm doctor
```

## 何时需要重新编译

以下变化需要重新运行 `pnpm ios` 或真机安装命令：

- 修改 `app.json` 或 Expo 插件；
- 新增或升级包含原生代码的依赖；
- 修改权限、图标、启动屏或 `ios/` 原生配置。

只修改页面、样式、TypeScript 或业务逻辑时，通常只需运行 `pnpm start`。
