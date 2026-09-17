# Vercel 下载页与包过班价格更新

日期：2026-09-17。用户明确授权这两项网页改动及 Vercel 生产部署。

## 交付内容

- 发现页资源区按顺序显示「听你五个 APP」「OPI 热点」「资源分享」，保留原有入口。
- 新入口打开 A 版下载页，复用已有品牌 Logo 与页面组件；手机上下排列，宽屏左右排列。
- 苹果按钮直达 https://apps.apple.com/cn/app/id6800583111 。安卓版显示「筹备中／敬请期待」，禁用下载，不提供 APK。
- 初考包过班 5999 → 6999；复考包过班 4999 → 5999；ICAO 5 包过班 7999 → 8999。
- 课程列表和详情共用数据，保留其他价格、课程文字和 UI；同步独立 `/promo` 页面。旧静态 bundle 的文件名随内容更新，避免一年 immutable 缓存返回旧价。
- 不修改 Native、EdgeOne、API 或题库。本次不发布 App，不更改 App 版本。

## 检查与发布路径

- 价格矩阵测试、TypeScript、静态宣传页资源引用检查，以及 Web 冻结门禁。
- Web 冻结清单仅更新本次授权路径；原来的 Native 隔离证明与其他保护内容保留。
- 本地浏览器验证宽屏及 390px 窄屏下载布局、苹果链接、安卓禁用状态、发现页返回及三项资源顺序；课程列表和详情新价核对。
- 本地预览使用仅绑定 localhost 的临时会话 fixture，文件在 `.generated`，不进入提交或部署。
- `pnpm check` 已尝试；本机未保留历史完整媒体源，止于 `resource_file_missing:audio/listening/main/001.mp3`，不修改或跳过该校验。源数据由 `check:ci` 检验，生产构建仍按既有脚本下载并校验远程资源。
- 必须经 PR 检查后合入 origin/main；在干净 main 工作目录部署，避免上传用户本机未跟踪的 `output/`。
- 部署完成检查 Ready、正式域名、资源入口、下载按钮及两套课程页面的三个价格。精确提交、生产 URL、检查结果写入 annotated release tag。

## 已确认的回滚目标

生产域名 `feizhuicao.com` 在更新前指向 Vercel 部署：

- ID：`dpl_GEweA1JZkrhyDssynLHnjk3Fd1PF`
- URL：https://feizhuicao-website-ae8dvwl15-xixi-s-projects6.vercel.app
- 创建：2026-09-10 16:24:44（北京时间），Ready。

若新部署验证失败，将正式域名恢复此不可变部署。
