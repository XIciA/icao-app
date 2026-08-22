# Web 手机端页面状态清单

基线：`icao设计稿` `e976cec9f90aa0d71a568a57923b7ec14ab6ba16`  
状态：阶段 1 已完成只读发现；阶段 2 已采用既有 74 张标准截图，不再重复采集

优先级：P0 核心闭环；P1 完整产品体验；P2 次要/异常/视觉补充。

## 1. AppShell 与主导航

- P1 `app.loading.global`
- P0 `app.home.default`
- P0 `app.home.course-picker.open`
- P0 `app.home.course.icao4-recert`
- P0 `app.home.course.icao4-first`
- P0 `app.home.course.icao5-first`
- P0 `app.nav.discover`
- P0 `app.nav.profile`
- P0 `app.nav.return-preserved`
- P1 `app.profile.records.loading`
- P1 `app.profile.records.empty`
- P1 `app.profile.records.populated`
- P1 `app.profile.annotations.tags.empty`
- P1 `app.profile.annotations.tags.populated`
- P1 `app.profile.annotations.highlights.empty`
- P1 `app.profile.annotations.highlights.populated`
- P1 `app.profile.annotations.notes.empty`
- P1 `app.profile.annotations.notes.populated`
- P1 `app.profile.annotations.bank-switched`
- P1 `app.profile.annotations.color-filtered`
- P0 `app.profile.annotations.card-return`

前置条件：主 App 的 auth、标注与学习记录依赖 localStorage；阶段 2 必须使用固定 fixture。

## 2. AuthFlow

- P0 `auth.splash.default`
- P0 `auth.login.default`
- P2 `auth.login.remember-off`
- P2 `auth.login.password-visible`
- P1 `auth.login.forgot`
- P1 `auth.login.phone-code`
- P0 `auth.login.success`
- P0 `auth.register.default`
- P2 `auth.register.agreement-checked`
- P2 `auth.register.password-visible`
- P1 `auth.register.agreement`
- P1 `auth.register.privacy`
- P0 `auth.register.success`
- P1 `auth.phone.default`
- P1 `auth.phone.code-entered`
- P1 `auth.phone.success`
- P1 `auth.forgot.default`
- P1 `auth.splash.agreement`
- P1 `auth.splash.privacy`

注意：独立 `/auth` 没有 `onAuthenticated`；成功状态必须从 `/` 的 AppShell 重放。

## 3. AccountFlow

- P1 `account.profile.default`
- P1 `account.profile.edit.default`
- P2 `account.profile.edit.gender-selected`
- P2 `account.profile.edit.level-selected`
- P0 `account.settings.default`
- P0 `account.settings.logout-dialog`
- P0 `account.settings.logout-cancel`
- P0 `account.settings.logout-confirm`
- P1 `account.sync.idle`
- P1 `account.sync.syncing`
- P1 `account.sync.success`
- P1 `account.sync.error-offline`
- P1 `account.security.default`
- P1 `account.security.phone`
- P1 `account.security.email`
- P1 `account.security.password`
- P2 `account.security.password-visible`
- P1 `account.security.delete.unchecked`
- P1 `account.security.delete.checked`
- P1 `account.settings.notification-return`
- P1 `account.settings.help-return`
- P1 `account.settings.about-return`

注意：通知、帮助、关于和退出确认的跨 Flow 结果必须从主 App `/` 进入设置后重放。

## 4. InfoFlow

- P1 `info.hub.default`
- P1 `info.help.default`
- P1 `info.feedback.idle`
- P1 `info.feedback.category-selected`
- P1 `info.feedback.success`
- P1 `info.feedback.error`
- P1 `info.about.default`
- P1 `info.agreement.from-hub`
- P1 `info.agreement.from-about`
- P1 `info.privacy.from-hub`
- P1 `info.privacy.from-about`

## 5. StateFlow

- P1 `state.hub.default`
- P0 `state.mic.explain`
- P0 `state.mic.allowing`
- P0 `state.mic.denied`
- P0 `state.mic-denied.default`
- P0 `state.mic-denied.retrying`
- P1 `state.notification.default`
- P1 `state.network.no-network`
- P1 `state.load-failed.default`
- P2 `state.maintenance.default`
- P1 `state.loading.global`

## 6. 五题库目录

- P0 `qb.listening.catalog`
- P0 `qb.sentences900.catalog`
- P0 `qb.radiotelephony.catalog`
- P0 `qb.opi.catalog`
- P0 `qb.storytelling.catalog`
- P0 `qb.catalog.module-switcher.open`
- P0 `qb.catalog.module-switcher.switched`
- P1 `qb.catalog.category.expanded`
- P1 `qb.catalog.category.collapsed`
- P0 `qb.catalog.topic.enter`
- P2 `qb.catalog.empty-dataset`
- P2 `qb.catalog.empty-topic`
- P2 `qb.catalog.invalid`
- P2 `qb.catalog.load-failed`

## 7. 学习页通用与 choices

- P0 `study.common.collapsed`
- P0 `study.common.revealed`
- P1 `study.common.auto-reveal-on`
- P1 `study.common.collapsed-after-reveal`
- P0 `study.choice.unanswered`
- P0 `study.choice.selected-correct`
- P0 `study.choice.selected-wrong`
- P1 `study.audio.loading`
- P0 `study.audio.ready`
- P0 `study.audio.playing`
- P0 `study.audio.paused`
- P1 `study.audio.speed-cycled`
- P1 `study.audio.error-retry`
- P0 `study.navigation.prev-disabled`
- P0 `study.navigation.next`
- P0 `study.navigation.last-finish`
- P0 `study.answer-card.open`
- P0 `study.answer-card.jump`
- P0 `study.exit-dialog.open`
- P0 `study.exit-dialog.cancel`
- P0 `study.exit-dialog.confirm`
- P0 `study.report.abort`
- P0 `study.report.complete`
- P1 `study.workbench.reference`
- P1 `study.workbench.mine`
- P1 `study.workbench.notes`
- P1 `study.workbench.swipe`
- P1 `study.dictionary.mode`
- P1 `study.dictionary.result-loading`
- P1 `study.dictionary.success`
- P1 `study.dictionary.error`
- P1 `study.highlight.mode`
- P1 `study.highlight.color-selected`
- P1 `study.highlight.created`
- P1 `study.highlight.applied`
- P1 `study.tag.panel`
- P1 `study.tag.selected`
- P1 `study.tag.created`
- P1 `study.note.edited`
- P1 `study.note.saved`
- P0 `study.permission.explain`
- P0 `study.permission.denied`

## 8. Speaking、retell、录音与 AI 示例 UI

- P0 `study.record.idle`
- P0 `study.record.preparing`
- P0 `study.record.recording`
- P1 `study.record.transcribing`
- P0 `study.record.error-too-short`
- P1 `study.record.error-unsupported`
- P0 `study.record.error-permission`
- P1 `study.answer-ai.validation`
- P1 `study.answer-ai.loading`
- P1 `study.answer-ai.success-saved`
- P1 `study.answer-ai.success-save-error`
- P1 `study.answer-ai.request-error`
- P0 `study.annotation.deep-link`
- P0 `study.annotation.return-to-annotations`

真实 AI 不在本阶段；以上 AI 状态只复刻完整 UI 和稳定示例结果。

## 9. 单词

- P0 `vocab.books.none-selected`
- P0 `vocab.books.selected`
- P0 `vocab.books.multi-selected`
- P1 `vocab.book.detail`
- P1 `vocab.book.detail.with-progress`
- P1 `vocab.book.detail.reset`
- P1 `vocab.words.default`
- P1 `vocab.words.filter-all`
- P1 `vocab.words.filter-new`
- P1 `vocab.words.filter-learning`
- P1 `vocab.words.filter-mastered`
- P1 `vocab.words.filter-favorite`
- P1 `vocab.words.searched`
- P1 `vocab.words.expanded`
- P1 `vocab.words.favorite-toggled`
- P0 `vocab.study.hidden`
- P0 `vocab.study.revealed-forgot`
- P0 `vocab.study.revealed-vague`
- P0 `vocab.study.revealed-known`
- P1 `vocab.study.favorite`
- P0 `vocab.complete.no-mistakes`
- P0 `vocab.complete.with-mistakes`

已确认逻辑差异：RN 当前新增 Web 不存在的“随堂测试”，且缺少 Web 的词书详情、筛选、翻卡和记忆等级，阶段 6 必须修正。

## 10. 随身听

- P0 `radio.default`
- P0 `radio.bank-picker.open`
- P0 `radio.bank-switched`
- P0 `radio.playing`
- P0 `radio.paused`
- P0 `radio.seeked`
- P0 `radio.prev`
- P0 `radio.next`
- P1 `radio.mode.order`
- P1 `radio.mode.shuffle`
- P1 `radio.mode.repeat`
- P1 `radio.speed.1`
- P1 `radio.speed.1.25`
- P1 `radio.speed.1.5`
- P1 `radio.speed.0.75`
- P1 `radio.subtitle.bi`
- P1 `radio.subtitle.en`
- P1 `radio.subtitle.off`
- P0 `radio.playlist.open`
- P0 `radio.playlist.track-selected`
- P0 `radio.playlist.dismissed`

## 11. 文章、资源、课程与热点

- P1 `articles.list`
- P1 `articles.detail`
- P1 `articles.detail-audio-playing`
- P1 `articles.detail-audio-seeked`
- P1 `resources.list.all`
- P1 `resources.filter-article`
- P1 `resources.filter-case`
- P1 `resources.detail`
- P2 `courses.list.top`
- P2 `courses.list.bottom`
- P1 `hotspot.list`
- P1 `hotspot.detail`
- P2 `report.ai-placeholder`

## 12. AI 模考

- P0 `mock.setup.default`
- P0 `mock.setup.type-icao4-recert`
- P0 `mock.setup.type-icao5-first`
- P0 `mock.setup.modules-partial`
- P0 `mock.setup.modules-none-disabled`
- P0 `mock.exam.section.start`
- P0 `mock.exam.question-states`
- P0 `mock.exam.section-advance`
- P0 `mock.exam.abort`
- P0 `mock.exam.complete-return`
- `baseline-pending` `mock.exam.demo-report`

Web 当前完成模考后直接返回设置页，没有演示报告；`mock.exam.demo-report` 不生成虚构 Web 截图，等待后续产品基线决定。

## 13. 不纳入状态

- `/curriculum`：桌面营销页，需求明确排除。
- `DetailContent` 中被 enabled 题库和随身听前置分支拦截的 ModulePlaceholder：真实流程不可达。
- 浏览器 PhoneFrame 外壳、浏览器控件和开发工具入口：只作为预览工具，不是 RN 产品 UI。
