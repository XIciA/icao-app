# 听你五个 App Store 1.0.0 商店材料

状态：唯一字段结构、隐私自助和生产 API 已收口；Build `3493761` 仅作历史录音候选保留。首页课程入口移除、AI 持续标识、模型备案与微信登录披露 v4.2 公开页面源码、新 Build `3493764`、中国大陆合规、
Apple 付费商务、唯一审核账号、IAP验收和截图门禁尚未全部通过，不可直接提交。可视化 Ops 延后到
上架后且不是提交、审核或发布门禁；当前平台地区设置仍须收缩为仅中国大陆。

适用范围：iOS App Store 简体中文、用户可见版本 `1.0.0`；App 与五档 IAP 只在中国大陆销售，关闭
自动在新增地区供应，备案类别继续保持工具。

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
2. Support URL 已提供 App 内反馈路径和产品支持邮箱；提交前仍须验证邮箱真实可投递、收件和回复。
   本次 App 与五档 IAP 只在中国大陆销售，欧盟不在范围，DSA 不适用；以后扩展欧盟前重新审查。
3. App Store Connect 受保护审核联系人只用于审核沟通，不能替代 Support URL 的产品支持渠道。
   审核只使用一个正常 Production 账号，顺序固定为完整体验→购买→恢复→最后注销。
4. 隐私自助的 Native/API 源码已完成，五个正式公开页面的上一版已从干净主线发布并逐页核对；本轮 AI 标识、模型备案与微信登录披露 v4.2 源码须待合入后重新发布。对应生产
   API 已部署并通过未认证安全探针。隐私答案是 D7 批准的唯一申报基线。最终 iOS 归档、生产配置、
   公开页面或第三方数据流不一致时，必须阻止提交并修正字段，不能用审核备注解释差异。
5. 五档商品首次与 App 1.0.0 一并送审；商品类型均为非自动续期订阅，价格以 Apple 实际价格点和
   StoreKit 返回值为准。
6. 本轮代码合入后，只从干净 `origin/main` 归档并上传 Build `3493764`；该 Build 通过 TestFlight 验收后再补截图、唯一审核账号状态和归档证据，并在版本页复核自动发布
   仍保持选中且没有最早发布日期；审核通过后由 App Store Connect 自动发布。
