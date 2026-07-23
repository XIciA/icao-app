# 体系课程宣传内容原生同步收口

收口状态：课程范围完成

收口日期：2026-07-23

## 交付结果

App「发现 → 体系课程」已由旧的三个示例课程替换为宣传页当前完整快照。原生页面包含四个分类、九个课程、价格、课时、周期、完整课纲、核心优势、暑期班、包过班特殊权限、宣传承诺、页尾寄语与两个咨询微信号。

页面继续使用 `/content/courses`，不使用 WebView、不运行时联网解析宣传页、不新增 API、支付、报名、Clipboard 或原生配置。

## 数据所有权

- 宣传来源与审计基线：`https://feizhuicao.com/promo`，SHA-256 为 `823694bda130d2c067cbf2f65cbda2c54b7a8decb16331bc15a94ffa3b3b9246`。
- App 唯一运行时课程数据源：`src/features/content/courses/course-promo-catalog.ts`。
- `public/promo` 保持独立营销站构建产物角色，不被 App 运行时导入。
- 后续同步必须同时更新课程内容、`syncedAt` 和 `sha256`，并复跑数据、交互与视觉验收。

## 复用与边界确认

- 复用现有路由、发现入口、TopBar、Screen、Card、Button、Tag、BottomSheet、主题与字体系统。
- 未引入第二套资源解析、状态生命周期或课程数据所有者。
- 未修改 API、数据库、原生依赖、权限、音频生命周期或只读设计仓库。
- 无 ECS 部署、数据库迁移、Prebuild 或 Development Build 重建发布需求。

## 验收结论

课程专项自动化、类型检查、范围 ESLint、Web 视觉与交互验收、Android Debug 和 iOS Simulator Debug 构建通过。仓库全量门禁中的任务外既有阻塞已记录于 `phase-log.md`，不影响本次课程范围结论。

最终 App 展示版本在所有仓库编辑结束后单独刷新并记入交付报告。
