# 2026-10-27 网页微信扫码支付上线

## 交付结果

- 网页：`https://readyoufife.com/account/membership`；EdgeOne Production deployment `dpe4o3d23q77`，项目 `makers-4khvzoj9ywnq`。未登录先展示会员介绍，登录入口携带原会员页目标。
- 网页源码及发布 runner：干净 main `c7cefc4078099f3c39b161e2f08ace47b513366c`。支付实现经 PR #219（f153b657）进入主线，严格恢复流程经 PR #284（c7cefc40）进入主线；两项云端检查均通过。
- API：`production-migration-c7cefc407809`，镜像 `sha256:b9eb14bc42e54723b708dc41f7d9f124cf5e43170d5b7c20207218b7a1f5ccdc`。实际运行时 payload source 是 `f153b6579fd2990ae98626e54673158f0264ab73`；从该提交到 runner，API 归档的所有 Git 对象和模式零差异。归档 SHA256 `cb3b17070cf583acd187da8539d0a7fa0a06a5b9ebe6d9ca7bb35dc7c202b8e4`。未把后续文档/工具提交冒充新的完整恢复演练。
- Annotated tags：`release/web-edgeone/20261027-c7cefc40`、`release/api-production/20261027-c7cefc40`，均绑定上述 runner。
- 仅交付网页与 API。三端源码展示元数据统一为 1.3.17，但本轮没有构建或上传 iOS/Android 安装包，没有修改 App Store、TestFlight 或 Android 更新渠道。

## 会员购买行为

网页对齐当前 Native 的会员权益网格、7/31/93 天套餐卡、默认 31 天、续费预期及购买须知。价格读取 Android 同一服务端目录，生产核对为 7天1200分、31天3800分、93天9800分；没有另造网页价格。

用户主动点击才创建 NATIVE 订单并在网页本地生成二维码，支持未付款订单恢复、查询、取消与服务器确认到账后的权益刷新。APP 请求不传渠道时保持 APP 行为；Apple IAP 链路保持原样。现有账户、计价、幂等、验签、权益和退款账本复用；历史订单迁移默认 APP。

本次是电脑网页微信扫一扫支付。H5 直接唤起和微信内 JSAPI 未接入；窄屏提示使用另一台设备扫码，不宣称可以长按或相册识别付款。

## 商户、迁移和启用证据

用户截图确认 Native 产品已开通，现有“听你五个”移动应用 AppID 已关联。发布前真实微信接口创建 Native 校验订单、响应验签、关闭未付款订单和查单均通过，没有扣款，也没有把校验二维码交给用户付款。

完整隔离恢复演练于 2026-10-27T06:29:58Z 完成：101张原有表参与指纹验证，缺表0、原有数据指纹差异0、未验证约束0，schema 合同及客户端隔离通过。原凭据：
`/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-f153b6579fd2-20261027T062958Z.txt`。

正式迁移在锁内重新核对 `57:1:0`，停服并排空请求后创建新的权威备份
`icao-20261027T070557Z-1919434.dump`，SHA256
`e04a9b71bce53887a6d7b860e2495e70f8236d150987b0c931fb4e6faa9473e6`。
之后应用 0057，结果为 `58:0:0`，新 API 启动、readiness、认证拒绝及清理核验通过。
正式成功凭据：
`/opt/icao/runtime/production-migrations/evidence/apply-c7cefc407809-20261027T070731Z-1e304aa006ec-succeeded.txt`。

Native 开关已开启。生产配置与同一商户/AppID 对齐，实际已编译服务同时确认 APP 和 NATIVE 目录可用且商品一致。开关变更前的环境字节副本保存在 root-only
`/opt/icao/backups/web-pay-enable-20261027-f153b657/runtime.env.before`，没有在仓库或日志记录环境值。

早期恢复准备因磁盘保护停止，生产未变更。两份未使用旧镜像先归档到本机受保护目录并验证32个内容块及两份镜像清单，才移除服务器副本，保留当前与近期回滚镜像及数据库备份。
归档为 `/Users/zhouyide/.config/icao-app/recovery-images/20261027-web-pay/unused-images.tar.gz`，SHA256
`9ac5a0d968374cdb78ef7bca37a3cf481c4438e5a22492dd10f9aa60c8cd42fe`。
后续主线文档更新触发源码保护后，通过严格零差异恢复入口保留原演练来源；短暂 SSH 关闭通过任务内连接复用恢复，没有放宽主机校验或修改 SSH 权限。

## 支付说明与验证

线上 app content 31→32，仅合并支付说明，原 hotspots/help 逐项一致。发布后校验摘要为
`04c8ac7daf137cdf4c45a7e5a534f35bd0e3c6bf07127f4a96e32f99a7a994ba`。
服务协议 v5.2、隐私政策 v5.4、第三方清单 v5.3，保留原 consentVersion。

本地 check:ci 通过：前端258套/1775项、API74文件/732项；数据库约束67项，恢复与迁移专项64项通过。支付后端28项和网页订单恢复、取消、未知结果重试、跨账号隔离、默认31天选择等专项通过。云端仓库及 EdgeOne 导出通过。没有用缺失的本机媒体源冒充完整媒体校验，没有重建原生包。

桌面与390px预览检查通过；正式浏览器会员入口及返回登录路径正常、无控制台错误。正式脚本
`/_expo/static/js/web/index-d5be8519cf3b7a7446b12d4bb4f3f9c7.js`
与本地构建逐字节一致，SHA256
`dd3c4e0076a602585423fb13a26b2b54a047dc3126d8aabd54abbbe06998ac84`。
匿名访问支付目录返回401，API公网版本与上述 release ID一致。

## 验收与回退

已提醒负责人用 APP 同一账号登录网页、选择套餐、用手机微信扫码。**真实付款到账、跨端会员权益同步尚待人工验收，未标记实付成功。**

功能回退先关闭 `WECHAT_PAY_NATIVE_ENABLED` 停止新的网页扫码下单，保留已有订单查单、验签回调和退款处理；不删除订单或新增字段。网页可恢复上一已验证 deployment `dpvzkuuok4wq`，其上线前脚本SHA256实查为
`a849eb52cf4e49521bb1b35735e802a734a4f4900796d1cd755b3822dddfa300`。
数据库变更后的 API 问题按正式迁移的向前修复流程处理，不将旧数据库备份直接覆盖后续用户数据。
