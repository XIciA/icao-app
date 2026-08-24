# 五档非自动续期商品材料

状态：首轮草案，未创建 App Store Connect 商品。

## 统一配置

- 类型：非自动续期订阅（Non-Renewing Subscription）。
- 首次随 iOS App 1.0.0 一并送审；不创建自动续期订阅组。
- 无免费试用、自动续费、自动扣款、年度套餐或独立 AI 加量包。
- App Store 用户可见名称使用固定天数，不写“月”。商品说明只表达会员内容可用时长，不写 AI 点数。
- 商品 ID 是永久技术标识，不包含价格或 AI 点数，保存后不得复用。
- 会员页按 7、15、31、62、93 天排序，默认选择 31 天且仅标记“推荐”。
- App 内价格全部来自 StoreKit，不在客户端、截图或帮助材料写死。
- 统一提示：“一次购买，到期不自动续费。重复购买将从当前会员最终到期时间继续顺延”。

## 商品字段

| 时长 | 参考名称（内部） | Product ID | 简中显示名称 | 简中说明 | 中国大陆目标价 | 服务端权益键 |
| ---: | --- | --- | --- | --- | ---: | --- |
| 7天 | `Membership 7 Days v1` | `com.readyoufife.ios.membership.7d.v1` | 7天会员 | 解锁会员内容7天 | ¥68 | `membership_7d_v1` |
| 15天 | `Membership 15 Days v1` | `com.readyoufife.ios.membership.15d.v1` | 15天会员 | 解锁会员内容15天 | ¥108 | `membership_15d_v1` |
| 31天 | `Membership 31 Days v1` | `com.readyoufife.ios.membership.31d.v1` | 31天会员 | 解锁会员内容31天 | ¥168 | `membership_31d_v1` |
| 62天 | `Membership 62 Days v1` | `com.readyoufife.ios.membership.62d.v1` | 62天会员 | 解锁会员内容62天 | ¥298 | `membership_62d_v1` |
| 93天 | `Membership 93 Days v1` | `com.readyoufife.ios.membership.93d.v1` | 93天会员 | 解锁会员内容93天 | ¥398 | `membership_93d_v1` |

显示名称均低于 Apple 的 30 字符上限，说明均低于 45 字符上限。

## 价格填写规则

1. 基准地区选择中国大陆。
2. 优先选择与目标价完全相同的 Apple 官方价格点。
3. 若没有精确价格点，选择最接近且不高于目标价的价格点；距离相同选择较低价。
4. 其他国家或地区使用 Apple 由中国大陆基准价生成的当地价格，首发不逐国手工定价。
5. 将最终选择的五个价格点、币种、生效日期和截图记录到发布证据；本文件中的目标价不是平台已确认价。

## 每个商品的审核截图

每项商品都上传一张来自最终候选 Build 的审核截图，不得使用设计稿：

| Product ID 后缀 | 建议文件名 | 截图状态 |
| --- | --- | --- |
| `7d.v1` | `iap-review-membership-7d.png` | 会员页已选中7天，显示 StoreKit 实际价格和购买按钮 |
| `15d.v1` | `iap-review-membership-15d.png` | 会员页已选中15天，显示 StoreKit 实际价格和购买按钮 |
| `31d.v1` | `iap-review-membership-31d.png` | 会员页已选中31天，显示“推荐”、实际价格和购买按钮 |
| `62d.v1` | `iap-review-membership-62d.png` | 会员页已选中62天，显示 StoreKit 实际价格和购买按钮 |
| `93d.v1` | `iap-review-membership-93d.png` | 会员页已选中93天，显示 StoreKit 实际价格和购买按钮 |

截图不得出现真实手机号、订单号、测试密码、硬编码价格、倒计时、虚构原价或折扣比例。

## 单商品审核备注模板

中文：

```text
路径：【待最终包确认：我的 → 会员中心】。选择“【7/15/31/62/93】天会员”后点击购买。该商品为非自动续期订阅，一次购买提供固定【7/15/31/62/93】天会员内容访问，不会自动续费。重复购买从当前会员最终到期时间继续顺延。价格由 StoreKit 返回，交易由服务端验证后授予权益。恢复购买入口位于同一会员页面。
```

English:

```text
Path: [VERIFY IN FINAL BUILD: Me > Membership]. Select the [7/15/31/62/93]-day membership and tap Purchase. This is a non-renewing subscription that provides a fixed [7/15/31/62/93] days of member-content access and does not renew automatically. A repeat purchase extends the current final expiration date. The localized price is returned by StoreKit, and entitlement is granted only after server-side transaction verification. Restore Purchases is available on the same page.
```

## 创建与送审清单

- [ ] 付费协议、税务和银行信息有效。
- [ ] 五个 Product ID 与代码及服务端映射逐字一致。
- [ ] 类型均为非自动续期订阅，不存在自动续期订阅组。
- [ ] 简中显示名称、说明和审核截图已录入。
- [ ] 中国大陆最终价格点按回退规则记录，App 真机显示一致。
- [ ] 商品可用地区与 App 首发地区一致。
- [ ] StoreKit 购买、取消、失败、待处理、退款、恢复和重复购买均经服务端验签。
- [ ] 五项商品与 1.0.0 位于同一首次审核提交。
- [ ] 未启用“推广的 App 内购买项目”。
