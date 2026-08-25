# 听你五个 App Store 1.0.0 商店材料

状态：Stage 3 唯一字段结构已收口，隐私自助能力已进入主线，五个正式公开页面已从干净主线发布；
生产 API/Ops、中国大陆合规、支持联系信息、Apple 付费商务、审核账号、最终候选包和截图门禁尚未
全部通过，不可直接提交；未登录或写入 App Store Connect。

适用范围：iOS App Store 简体中文、用户可见版本 `1.0.0`；App 与五档 IAP 使用当前全部可用 App Store
国家或地区，中国大陆是价格基准地区并继续满足工具类备案合规。

## 唯一录入入口

- [`app-store-connect-final-fields.md`](app-store-connect-final-fields.md) 是名称、副标题、关键词、描述、
  分类、年龄分级、隐私标签、审核信息、发布方式及五档 IAP 字段的唯一最终字段包。
- [`evidence-and-owner-actions.md`](evidence-and-owner-actions.md) 只保存反向核对证据、最终门禁和仍需
  负责人提供的最小事实，不定义竞争性字段值。
- [`screenshots.md`](screenshots.md) 只管理最终 TestFlight 候选包的截图拍摄与验收，不定义元数据。
- [`validate-final-fields.mjs`](validate-final-fields.mjs) 只做确定性字数、字节、Native 身份、Product ID、
  审核路径和固定口径校验，不生成或覆盖字段。

此前按主题拆分的首轮草案已删除，避免同一个平台字段存在多个版本。后续字段调整只改
`app-store-connect-final-fields.md`，并同步通过校验。

## 使用边界

1. 可直接录入的固定字段以最终字段包为准；`<ASC_ONLY_...>` 只允许在 App Store Connect 当场替换，
   不得把真实联系人、审核账号、密码或电话回填仓库。
2. Apple 的平台版本字段说明要求 Support URL 指向实际联系信息（如法定地址、邮箱和电话），并说明
   具体展示受适用法律影响；审核指南 1.5 另要求 App 与 Support URL 提供准确、最新且易用的联系途径。
   本项目提交前采用更保守的门禁：真实公司注册地址和公开支持电话须经负责人核实、发布并完成可达性
   验证。当前地址只是仓库候选，且不得编造电话；这不是对所有地区展示格式的一概断言，也只是多项
   提交门禁之一。
3. App Store Connect 受保护审核联系人电话只用于审核联系，不能替代 Support URL 的公开支持电话。
   负责人尚未确认的版权主体、备案号和邮箱可达性也不得写成已验证事实。
4. 隐私自助的 Native/API 源码已完成，五个正式公开页面也已从干净主线发布并逐页核对；对应生产
   API 仍待部署。隐私答案是 D7 批准的唯一申报基线。最终 iOS 归档、生产配置、公开页面或第三方
   数据流不一致时，必须阻止提交并修正字段，不能用审核备注解释差异。
5. 五档商品首次与 App 1.0.0 一并送审；商品类型均为非自动续期订阅，价格以 Apple 实际价格点和
   StoreKit 返回值为准。
6. 最终候选包 TestFlight 验收后再补截图、Build、审核账号状态和归档证据，并在版本页复核自动发布
   仍保持选中且没有最早发布日期；审核通过后由 App Store Connect 自动发布。
