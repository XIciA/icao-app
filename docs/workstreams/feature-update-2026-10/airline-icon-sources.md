# 陆空通话航徽依据 · 方案 C

2026-10-18 用户选择方案 C，替代旧细线草案。此次仅保留本地代码，不构建、不上传 TestFlight；发布并入后续任务。

## 实现与处理

唯一运行时实现：`src/features/question-bank/components/AirlineMark.tsx`。

- 使用单色实心路径保留航徽轮廓与负空间，取消把实心轮廓统一改为空心描边的旧实现。
- 沿用 `colors.primary`、现有浅蓝圆底与默认 26px 尺寸。支持现有 `code`、`size`、`color` 调用方式。
- 不加飞机垂尾或装饰外框；航徽原生圆环（加航、西北航空）和地球方形裁切（美联航）属于标志自身，予以保留。
- 南航、国航、荷航按本轮获选 C 样板落地；其余标志沿用同一实心转译方法。
- [实现预览](samples/airline-solid-icons-20261018.png)由本组件路径生成，含放大与 26px 实际尺寸。

## 每家固定的视觉依据

官方视觉依据与矢量中间材料分开记录，不把第三方矢量库描述为航司授权文件。

| 代码 | 固定视觉依据 | 图形与处理 |
| --- | --- | --- |
| QFA | [澳航官方标志历史：2016—present](https://www.qantas.com/en-fr/about-us/logos) | 袋鼠；从原复合路径移除尾翼区域，闭合袋鼠轮廓，光学放大居中 |
| SIA | [新航官网](https://www.singaporeair.com/en_UK/us/home/) | 鸟形；官网页头含内联 SVG，保留羽翼负空间，去除字标 |
| AFR | [法航官方品牌说明](https://corporate.airfrance.com/en/news/air-france-presents-its-new-brand-video) | accent 品牌符号；实心曲面，不添加海马或外框 |
| BAW | [英航官网](https://www.britishairways.com/) | Speedmarque；保留两段曲面及中间负空间，统一单色 |
| UAL | [美联航官方新闻室](https://united.mediaroom.com/2026-06-15-United-Celebrates-America-with-Custom-250th-Anniversary-Livery-and-Military-Pilot-Hiring-Program-Milestone) | Globe；用矢量经纬网替换旧手绘弧线，保留原生方形裁切 |
| KLM | [荷航官方媒体素材](https://news.klm.com/asset/678099/logoklm-427773) | 皇冠；采用获选 C 样板的十字、四圆与底座，不保留 KLM 字标 |
| JAL | [日航官方页面页头现行标志](https://www.jal.com/en/jal-int-70th/history/) | 鹤丸；保留鹤形和环形羽翼，删除内部 JAL 字标路径；不使用页面中的早期历史版本 |
| ACA | [加拿大航空官网](https://www.aircanada.com/) | 枫叶及原生圆环，保持开口与叶柄结构 |
| CCA | [国航官方标志说明](https://webresource.airchina.com.cn/zh-CN/content/about_us/civilization/logo/) | 凤凰；采用获选 C 样板，保留粗细与留白，去除参考图阴影 |
| CES | [东航官方页面](https://uk.ceair.com/newCMS/uk/en/content/en_Footer/Support/201904/t20190404_5763.html) | 飞燕；保留燕尾曲线与负空间，红蓝转为统一蓝色 |
| CSN | [南航集团 VI 寓意](https://www.csairgroup.cn/cn/gywm3/qywh92/viyy47/index.html) | 木棉花；采用获选 C 样板，提取内部实心花瓣和花蕊，去除尾翼及反白边界后重新居中 |
| NWA | [西北航空历史中心品牌资料，2015 年 12 月刊，第 3—4 页](https://northwestairlineshistory.org/wp-content/uploads/2018/05/1512-newsletter.pdf) | 1989 年 Landor 版 NW 圆形航徽；保留原标志组合关系，移除 NORTHWEST AIRLINES 字标，不混入 2003 年版 |

历史中心是历史资料来源，不是现营航司官网。NWA 的年代、实物应用与图形已对照该资料；第三方矢量仅作几何转录。

## 矢量几何出处

- QFA、SIA、AFR、BAW、JAL、ACA、CCA、CES、CSN：复用项目原先采用的 [Simple Icons](https://github.com/simple-icons/simple-icons) CC0 几何，按上表提取或去除字标，不新增运行时图标包。
- UAL：2026-10-18 读取 [Simple Icons unitedairlines.svg](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/unitedairlines.svg)，将路径内嵌到组件。原文件 SHA-256：f60563bbc7c47f1bd2d3df5d9f48af46f4a6db978ec9393d1e2c8e48398cec85。
- KLM：根据官方媒体素材重建的获选 C 样板，圆形转为 SVG 圆弧闭合路径；与预览同一几何。
- NWA：提取 [Northwest Airlines 1989 Logo.svg](https://commons.wikimedia.org/wiki/File:Northwest_Airlines_1989_Logo.svg) 中 `path7000`，该路径为独立圆形航徽；对照 [1989—2003 档案矢量](https://commons.wikimedia.org/wiki/File:Northwest_Airlines_1989-2003.svg) 的同形版本及历史中心资料。原提取文件 SHA-256：473ed93dd1131c0541111a91b958bd3e1f2d600d77c16906b0d34eb02f440213。归一化尺寸并翻转原文件向上的 Y 坐标，未采用旧手绘 NW 字母。

这些是 App 内的单色识别图标，不是官方标准标识交付，也不表示官方合作。

## 检查与交付状态

- `pnpm exec tsc --noEmit`：通过。
- 12 枚路径渲染检查：放大图及 26px 小图；检查裁切、实心填充与负空间。
- 原 `airline-line-icon-style.png` 已由当前实现预览替代并删除，需求文档同步更新。
- 未修改版本号、未构建、未上传、未部署。用户已选择设计方向；真机最终效果留待后续 TestFlight 验收。
