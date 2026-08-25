# 听你五个 App Store 1.0.0 商店材料

状态：Stage 3 唯一字段结构已收口，但生产、隐私自助权利、中国大陆合规、支持联系信息、Apple
付费商务、审核账号、最终候选包和截图门禁尚未全部通过，不可直接提交；未登录或写入 App Store
Connect。

适用范围：中国大陆 iOS App Store、简体中文、用户可见版本 `1.0.0`。

## 唯一录入入口

- [`app-store-connect-final-fields.md`](app-store-connect-final-fields.md) 是名称、副标题、关键词、描述、
  分类、年龄分级、隐私标签、审核信息、发布方式及五档 IAP 字段的唯一最终字段包。
- [`evidence-and-owner-actions.md`](evidence-and-owner-actions.md) 只保存反向核对证据、最终门禁和仍需
  负责人提供的最小事实，不定义竞争性字段值。
- [`screenshots.md`](screenshots.md) 只管理最终 TestFlight 候选包的截图拍摄与验收，不定义元数据。
- [`validate-final-fields.mjs`](validate-final-fields.mjs) 只做确定性字数、字节、Product ID 和固定口径
  校验，不生成或覆盖字段。

此前按主题拆分的首轮草案已删除，避免同一个平台字段存在多个版本。后续字段调整只改
`app-store-connect-final-fields.md`，并同步通过校验。

## 使用边界

1. 可直接录入的固定字段以最终字段包为准；`<ASC_ONLY_...>` 只允许在 App Store Connect 当场替换，
   不得把真实联系人、审核账号、密码或电话回填仓库。
2. Support URL 只有在真实公司注册地址和公开支持电话经负责人核实、发布到页面并完成可达性验证后
   才能通过提交门禁。当前已知注册地址只是仓库候选，必须与营业执照核实；不得编造电话。这只是
   多项提交门禁之一，不能把材料状态简化为仅受该项阻塞。
3. App Store Connect 受保护审核联系人电话只用于审核联系，不能替代 Support URL 的公开支持电话。
   负责人尚未确认的版权主体、备案号和邮箱可达性也不得写成已验证事实。
4. 隐私答案是 D7 批准的唯一申报基线；最终 iOS 归档、生产配置或第三方数据流不一致时，必须阻止
   提交并修正字段，不能用审核备注解释差异。
5. 五档商品首次与 App 1.0.0 一并送审；商品类型均为非自动续期订阅，价格以 Apple 实际价格点和
   StoreKit 返回值为准。
6. 最终候选包 TestFlight 验收后再补截图、Build、审核账号状态和归档证据，并在版本页保存自动发布；
   审核通过后由 App Store Connect 自动发布。
