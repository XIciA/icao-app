# 听你五个 App Store 1.0.0 首轮材料

状态：首轮草案，未登录或写入 App Store Connect，不可直接提交。

适用范围：中国大陆 iOS App Store，简体中文，用户可见版本 `1.0.0`

## 固定口径

- App 名称：听你五个；副标题：航空英语练习工具。
- App Store 主要分类为教育，次要分类为工具；App 备案服务分类继续使用工具。
- 全端及公开材料统一为 16+，不选择儿童分类。
- 五档商品均为非自动续期订阅，固定使用 7、15、31、62、93 天名称。
- 1.0.0 不展示体系课程、课程销售、咨询购买、通过率、包过、内部题库或真实考题宣传。
- 题库及配套内容按公司具有合法使用权准备；公开材料只写“由团队整理、制作并持续维护”，不宣称全部原创。
- DeepSeek 的数据保留、训练和处理地区仍需用合同、控制台设置或正式技术文件核验。本轮仅记录风险，
  不阻塞材料草拟；任何材料均不作“绝不训练”“零留存”或“绝不出境”等绝对承诺。

## 文件清单

| 文件 | 用途 |
| --- | --- |
| `facts-and-open-items.md` | 已冻结事实、仓库观察和送审前仍需补齐的事实 |
| `app-store-zh-cn-metadata.md` | App Store 简体中文元数据草案 |
| `review-notes-bilingual.md` | App 审核备注中英文模板 |
| `review-accounts-template.md` | 两个 Production 审核账号的无凭据模板 |
| `iap-products.md` | 五档非自动续期商品配置与审核材料 |
| `age-rating.md` | 16+ 年龄分级建议及问卷基线 |
| `app-privacy-fact-sheet.md` | App 隐私标签事实采集表与最终复核门禁 |
| `screenshots.md` | 简中产品页截图顺序、场景和规格清单 |
| `urls-and-filing-checklist.md` | App 备案、支持、隐私及联系信息检查表 |

## 使用规则

1. 占位符统一使用 `【待……】`，负责人核实后才可替换。
2. 审核账号的手机号和密码只填入 App Store Connect 的受保护审核字段，不得回填仓库。
3. 截图、隐私标签和审核路径必须用最终候选 Build 复核；本目录不能替代最终归档包审计。
4. 首次提交时，将 1.0.0 与五档非自动续期商品放入同一审核提交。
5. 审核通过后选择自动发布；本轮不执行上传、提交或发布。

## 依据

- 仓库长期决策：`docs/rules/decisions/d1-launch-platforms.md`、`d2-login-methods.md`、
  `d4-membership-and-pricing.md`、`d5-ai-cost-and-abuse-policy.md`、
  `d6-content-delivery-and-offline.md`、`d7-data-privacy-and-retention.md`、
  `d9-release-channels.md`。
- Apple 官方字段参考：
  - <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
  - <https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/>
  - <https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information>
  - <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
