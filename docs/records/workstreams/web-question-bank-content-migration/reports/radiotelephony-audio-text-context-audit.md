# 陆空通话音频原文与场景语境审查

> 本报告是人工复核清单，不会自动修正题库，也不代表候选已被判定为错误。

## 审查边界

- 覆盖正式共享源 `content/question-banks/banks/radiotelephony` 的全部场景和卡片。
- 仅使用 `audioText`，并以航司分类、场景名和任务标题确定语境；不读取或展示参考答案、中文原文和音频文件内容。
- 对 `src/features/question-bank/data/question-bank.json` 仅比较上述审查输入的派生快照，确认学习页所用数据未漂移。

## 输入与覆盖

- 场景：186；卡片：3216；航司分类：11。
- 正式源审查输入 SHA-256：`674d5f49cd3977a8e7c92bb41969848ce3ed879c8f32a96a15405b8c976582d8`
- 内嵌题库审查输入 SHA-256：`674d5f49cd3977a8e7c92bb41969848ce3ed879c8f32a96a15405b8c976582d8`
- 候选卡：197（P0 0、P1 0、P2 188、P3 9）。

## 分级说明

- P0：场景呼号未出现，原文主呼号属于另一航司。
- P1：场景呼号未出现，原文为同航司的不同号码。
- P2：原文明确的事件与场景主题无交集；如存在，会附跨场景相似原文证据。
- P3：本场景呼号存在，但原文还提及其他航班；可能合理，保留高召回审查。

## P2 · 中优先级：场景主题与原文事件漂移

### atc-scenario-0002 · QFA 160 燃油续航 导航定位

#### QFA 160-8 · atc-scenario-0002-card-main-028

- 场景：`atc-scenario-0002` · QFA 160 燃油续航 导航定位
- 场景呼号：`QFA 160`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Now you find you don't have enough fuel to fly to Guangzhou and you decide to divert to Changsha Airport, notify Zhengzhou Control.

#### QFA 160-13 · atc-scenario-0002-card-main-033

- 场景：`atc-scenario-0002` · QFA 160 燃油续航 导航定位
- 场景呼号：`QFA 160`
- 原文识别到的呼号：`QFA 160`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: QFA 160, Wuhan Control, radar contact, I understand you have a navigation problem and fuel shortage, confirm you are diverting to Changsha.
> B: Tell Wuhan Control you are performing the checklist and tell Wuhan Control to stand by.

#### QFA 160-15 · atc-scenario-0002-card-main-035

- 场景：`atc-scenario-0002` · QFA 160 燃油续航 导航定位
- 场景呼号：`QFA 160`
- 原文识别到的呼号：`QFA 160`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: QFA 160, roger, divert to Wuhan approved, descend and maintain 4800 meters, contact Wuhan Approach on 120.45 when reaching.

#### QFA 160-18 · atc-scenario-0002-card-main-038

- 场景：`atc-scenario-0002` · QFA 160 燃油续航 导航定位
- 场景呼号：`QFA 160`
- 原文识别到的呼号：`QFA 160`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 燃油问题。；与 atc-scenario-0178（QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动）/atc-scenario-0178-card-main-3080 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: QFA 160, are you declaring fuel emergency?
> B: Inform the controller that you still have more than 2 hours fuel endurance and you are not declaring a fuel emergency.

### atc-scenario-0004 · QFA 029 转弯卡阻 PFD仪副驾

#### QFA 029-15 · atc-scenario-0004-card-main-072

- 场景：`atc-scenario-0004` · QFA 029 转弯卡阻 PFD仪副驾
- 场景呼号：`QFA 029`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 起落架问题。
- 人工结论：待判

**音频原文**

> B: You now find your nose wheel steering seems to be jammed, tell the controller.

### atc-scenario-0005 · QFA 358 天气 气象雷达失效

#### QFA 358-3 · atc-scenario-0005-card-main-082

- 场景：`atc-scenario-0005` · QFA 358 天气 气象雷达失效
- 场景呼号：`QFA 358`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0179（QFA 358 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0179-card-main-3083 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar indicates a large group of CBs, southwest of LKO, request turn right heading 050 to avoid the weather.

#### QFA 358-9 · atc-scenario-0005-card-main-088

- 场景：`atc-scenario-0005` · QFA 358 天气 气象雷达失效
- 场景呼号：`QFA 358`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0179（QFA 358 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0179-card-main-3089 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar has failed during descent, contact Wuhan Approach to request weather information along your route.

#### QFA 358-10 · atc-scenario-0005-card-main-089

- 场景：`atc-scenario-0005` · QFA 358 天气 气象雷达失效
- 场景呼号：`QFA 358`
- 原文识别到的呼号：`QFA 358`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0179（QFA 358 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0179-card-main-3090 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: QFA 358, roger, our weather radar shows cumulonimbus in the vicinity of DA.

#### QFA 358-14 · atc-scenario-0005-card-main-093

- 场景：`atc-scenario-0005` · QFA 358 天气 气象雷达失效
- 场景呼号：`QFA 358`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 复飞。；与 atc-scenario-0179（QFA 358 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0179-card-main-3094 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: You encountered the downdrafts on short final and executed a missed approach, informed Wuhan Tower.

### atc-scenario-0006 · QFA 701 前轮转向失效 PAPI灯暗

#### QFA 701-3 · atc-scenario-0006-card-main-097

- 场景：`atc-scenario-0006` · QFA 701 前轮转向失效 PAPI灯暗
- 场景呼号：`QFA 701`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0177（QFA 701 起落架问题 雷暴绕飞 TCAS机动）/atc-scenario-0177-card-main-3048 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: There is a thunderstorm buildup near LKO, asked how the preceding aircraft avoided the weather.

#### QFA 701-6 · atc-scenario-0006-card-main-100

- 场景：`atc-scenario-0006` · QFA 701 前轮转向失效 PAPI灯暗
- 场景呼号：`QFA 701`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0177（QFA 701 起落架问题 雷暴绕飞 TCAS机动）/atc-scenario-0177-card-main-3051 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: There are thunderstorms sources the south of the airport, arrival through LKO is difficult, ask Wuhan Control for an approach from the North and use ZF arrivals.

#### QFA 701-8 · atc-scenario-0006-card-main-102

- 场景：`atc-scenario-0006` · QFA 701 前轮转向失效 PAPI灯暗
- 场景呼号：`QFA 701`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0177（QFA 701 起落架问题 雷暴绕飞 TCAS机动）/atc-scenario-0177-card-main-3053 的原文词集相似度 94%
- 人工结论：待判

**音频原文**

> B: There is a small cumulonimbus in front of you, request maneuver to the right within 2 miles.

#### QFA 701-13 · atc-scenario-0006-card-main-107

- 场景：`atc-scenario-0006` · QFA 701 前轮转向失效 PAPI灯暗
- 场景呼号：`QFA 701`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> B: You executed missed approach because of poor visibility, inform Tower.

#### QFA 701-14 · atc-scenario-0006-card-main-108

- 场景：`atc-scenario-0006` · QFA 701 前轮转向失效 PAPI灯暗
- 场景呼号：`QFA 701`
- 原文识别到的呼号：`QFA 701`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: QFA 701, roger, follow the standard missed approach procedure.

### atc-scenario-0008 · SIA 123 拖把断了 鸟击 放油

#### SIA 123-9 · atc-scenario-0008-card-main-135

- 场景：`atc-scenario-0008` · SIA 123 拖把断了 鸟击 放油
- 场景呼号：`SIA 123`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> B: Tell the Tower you want to dump fuel and return to Wuhan Airport.

### atc-scenario-0009 · SIA 101 雷击 客舱起火

#### SIA 101-1 · atc-scenario-0009-card-main-143

- 场景：`atc-scenario-0009` · SIA 101 雷击 客舱起火
- 场景呼号：`SIA 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> B: You are encountering severe icing at FL390 and want lower.

#### SIA 101-8 · atc-scenario-0009-card-main-150

- 场景：`atc-scenario-0009` · SIA 101 雷击 客舱起火
- 场景呼号：`SIA 101`
- 原文识别到的呼号：`SIA 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: SIA 101, roger that.
> B: Now smoke is coming out of the floor in the aft cabin, so you decide immediately to divert to HongKong. Declare an emergency and make a Distress call.

#### SIA 101-11 · atc-scenario-0009-card-main-153

- 场景：`atc-scenario-0009` · SIA 101 雷击 客舱起火
- 场景呼号：`SIA 101`
- 原文识别到的呼号：`SIA 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: SIA 101, copy that, what kind of emergency services do you need?
> B: Tell ATC you need fire service and medical service to be attendance near the runway.

#### SIA 101-12 · atc-scenario-0009-card-main-154

- 场景：`atc-scenario-0009` · SIA 101 雷击 客舱起火
- 场景呼号：`SIA 101`
- 原文识别到的呼号：`SIA 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: SIA 101, fire and medical services, copy that.
> B: After having discharged the fire extinguisher and applied the smoke procedure, the smoke is stopped and is controlled. Tell ATC your situation and cancel the Distress.

### atc-scenario-0012 · SIA 615 空调系统烟雾

#### SIA 615-15 · atc-scenario-0012-card-main-211

- 场景：`atc-scenario-0012` · SIA 615 空调系统烟雾
- 场景呼号：`SIA 615`
- 原文识别到的呼号：`SIA 615`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: SIA 615, roger PAN, when able, say your further intention.
> B: The smoke is removed, you have turned off the air conditioning system, you want radar guidance to return to land at Wuhan Airport.

### atc-scenario-0013 · SIA 308 客舱烟雾 错过脱离滑行道

#### SIA 308-13 · atc-scenario-0013-card-main-227

- 场景：`atc-scenario-0013` · SIA 308 客舱烟雾 错过脱离滑行道
- 场景呼号：`SIA 308`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。；与 atc-scenario-0122（SIA 308 烟雾 TCAS机动 备降/返航）/atc-scenario-0122-card-main-2114 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: After completing the checklist, the smoke can't be removed and you decide to divert to Paris, inform the controller your situation and intention.

### atc-scenario-0014 · SIA 334 通讯失效 地面延误

#### SIA 334-8 · atc-scenario-0014-card-main-239

- 场景：`atc-scenario-0014` · SIA 334 通讯失效 地面延误
- 场景呼号：`SIA 334`
- 原文识别到的呼号：`SIA 334`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 通讯问题，但原文仅明确出现 舱门问题。
- 人工结论：待判

**音频原文**

> C: SIA 334, are you fully ready now? Your slot is 0310.
> B: You need to open the cabin door for the release documents, advise Ground you will need another 5 minutes.

### atc-scenario-0015 · AFR 113 左发失效 乘客中风

#### AFR 113-11 · atc-scenario-0015-card-main-252

- 场景：`atc-scenario-0015` · AFR 113 左发失效 乘客中风
- 场景呼号：`AFR 113`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: During the climb, your port engine fails, tell the controller this situation and you would like to return to land.

### atc-scenario-0016 · AFR 782 厕所冒烟 作PA 乘客烟熏

#### AFR 782-18 · atc-scenario-0016-card-main-278

- 场景：`atc-scenario-0016` · AFR 782 厕所冒烟 作PA 乘客烟熏
- 场景呼号：`AFR 782`
- 原文识别到的呼号：`AFR 782`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: AFR 782, taxi to Number 5 Apron via taxiway E3, A, A8, the fire services and medical teams are waiting for you on the Apron.
> B: You are required to read back the clearance and show your gratitude.

### atc-scenario-0018 · AFR 126 前轮转弯失效

#### AFR 126-11 · atc-scenario-0018-card-main-307

- 场景：`atc-scenario-0018` · AFR 126 前轮转弯失效
- 场景呼号：`AFR 126`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 襟翼问题。
- 人工结论：待判

**音频原文**

> B: Tell the controller that your flap has some problem.

### atc-scenario-0019 · AFR 101 携带爆炸物 伤2人

#### AFR 101-16 · atc-scenario-0019-card-main-334

- 场景：`atc-scenario-0019` · AFR 101 携带爆炸物 伤2人
- 场景呼号：`AFR 101`
- 原文识别到的呼号：`AFR 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: AFR 101, divert immediately to Tongzhou.
> B: Request radar vector to Tongzhou.

#### AFR 101-19 · atc-scenario-0019-card-main-337

- 场景：`atc-scenario-0019` · AFR 101 携带爆炸物 伤2人
- 场景呼号：`AFR 101`
- 原文识别到的呼号：`AFR 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: AFR 101, roger. Cleared Runway 18R, you are number 1. Police officers and medical services will be ready on arrival.

### atc-scenario-0020 · AFR 101 中度积冰 左发失效

#### AFR 101-15 · atc-scenario-0020-card-main-352

- 场景：`atc-scenario-0020` · AFR 101 中度积冰 左发失效
- 场景呼号：`AFR 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰，但原文仅明确出现 发动机问题。；与 atc-scenario-0120（AFR 101 发动机失效 积冰/防冰 TCAS机动）/atc-scenario-0120-card-main-2081 的原文词集相似度 83%
- 人工结论：待判

**音频原文**

> B: Suddenly, your left engine failed at 6000 meters, make an Urgency call to ATC and request descent and return to Wuhan Airport.

### atc-scenario-0021 · AFR 675 襟翼卡阻 滑出跑道 前轮陷地

#### AFR 675-3 · atc-scenario-0021-card-main-360

- 场景：`atc-scenario-0021` · AFR 675 襟翼卡阻 滑出跑道 前轮陷地
- 场景呼号：`AFR 675`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、襟翼问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0164（AFR 675 起落架问题 襟翼问题 雷暴绕飞）/atc-scenario-0164-card-main-2832 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar indicates there is a cumulonimbus ahead, report the situation to Wuhan Control and ask for 20 miles deviation to the west.

#### AFR 675-7 · atc-scenario-0021-card-main-364

- 场景：`atc-scenario-0021` · AFR 675 襟翼卡阻 滑出跑道 前轮陷地
- 场景呼号：`AFR 675`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、襟翼问题，但原文仅明确出现 雷暴绕飞、备降返航。；与 atc-scenario-0164（AFR 675 起落架问题 襟翼问题 雷暴绕飞）/atc-scenario-0164-card-main-2836 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar has failed, tell Wuhan Control you'd like to divert to Wuhan Airport.

### atc-scenario-0022 · AFR 896 皮托管加温,GPS高度地速失效

#### AFR 896-9 · atc-scenario-0022-card-main-383

- 场景：`atc-scenario-0022` · AFR 896 皮托管加温,GPS高度地速失效
- 场景呼号：`AFR 896`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> B: Ask to climb to 11600 meters due icing.

#### AFR 896-13 · atc-scenario-0022-card-main-387

- 场景：`atc-scenario-0022` · AFR 896 皮托管加温,GPS高度地速失效
- 场景呼号：`AFR 896`
- 原文识别到的呼号：`AFR 896`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0161（AFR 896 颠簸 积冰/防冰 TCAS机动）/atc-scenario-0161-card-main-2785 的原文词集相似度 90%
- 人工结论：待判

**音频原文**

> C: AFR 896, advise your intention.
> B: Tell controller that your GPS altitude and groundspeed is not accurate compared to barometric indications, but you can still maintain a stable flight, request descend to leave icing area.

#### AFR 896-16 · atc-scenario-0022-card-main-390

- 场景：`atc-scenario-0022` · AFR 896 皮托管加温,GPS高度地速失效
- 场景呼号：`AFR 896`
- 原文识别到的呼号：`AFR 896`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0161（AFR 896 颠簸 积冰/防冰 TCAS机动）/atc-scenario-0161-card-main-2788 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: AFR 896, another aircraft has information with regards to the differences between his barometric and GPS altitude, I have him on 3000 meters, his reported GPS is 3600 meters.
> B: Acknowledge the transmission request further descent and leave icing area.

#### AFR 896-18 · atc-scenario-0022-card-main-392

- 场景：`atc-scenario-0022` · AFR 896 皮托管加温,GPS高度地速失效
- 场景呼号：`AFR 896`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0161（AFR 896 颠簸 积冰/防冰 TCAS机动）/atc-scenario-0161-card-main-2790 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: You left the icing area and your instruments have returned to normal, report it to Wuhan Tower.

### atc-scenario-0026 · BAW 120 皮托管加温失效 空速不可信

#### BAW 120-5 · atc-scenario-0026-card-main-449

- 场景：`atc-scenario-0026` · BAW 120 皮托管加温失效 空速不可信
- 场景呼号：`BAW 120`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0125（BAW 120 鸟击 积冰/防冰 TCAS机动）/atc-scenario-0125-card-main-2157 的原文词集相似度 86%
- 人工结论：待判

**音频原文**

> B: Now you are maintaining 9200 meters in icing condition, the instrument shows your pitot tube heating system failed, your air speed indications appeared to be inaccurate, report it to Zhengzhou Control and request descent to lower level to avoid icing.

#### BAW 120-13 · atc-scenario-0026-card-main-457

- 场景：`atc-scenario-0026` · BAW 120 皮托管加温失效 空速不可信
- 场景呼号：`BAW 120`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞、复飞。
- 人工结论：待判

**音频原文**

> B: You encountered strong wind shear on short final, you made a missed approach, report it to Wuhan Tower.

#### BAW 120-14 · atc-scenario-0026-card-main-458

- 场景：`atc-scenario-0026` · BAW 120 皮托管加温失效 空速不可信
- 场景呼号：`BAW 120`
- 原文识别到的呼号：`BAW 120`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: BAW 120, follow standard missed approach procedure, climb to 1800 meters.

### atc-scenario-0027 · BAW 203 老人去世 复飞

#### BAW 203-6 · atc-scenario-0027-card-main-466

- 场景：`atc-scenario-0027` · BAW 203 老人去世 复飞
- 场景呼号：`BAW 203`
- 原文识别到的呼号：`BAW 203`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: BAW 203, Wuhan Control, is there any damage to the aircraft or are there any passengers injured?
> B: Tell the controller that there isn't any aircraft damage, and the purser told you that passengers are OK.

#### BAW 203-7 · atc-scenario-0027-card-main-467

- 场景：`atc-scenario-0027` · BAW 203 老人去世 复飞
- 场景呼号：`BAW 203`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: Inform Wuhan Control that you have just been told an old passenger has been seriously injured.

#### BAW 203-12 · atc-scenario-0027-card-main-472

- 场景：`atc-scenario-0027` · BAW 203 老人去世 复飞
- 场景呼号：`BAW 203`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: Make an initial contact with Wuhan Approach, inform the controller that you have an injured passenger on board.

### atc-scenario-0028 · BAW 931 乘客重病 引擎起火

#### BAW 931-6 · atc-scenario-0028-card-main-485

- 场景：`atc-scenario-0028` · BAW 931 乘客重病 引擎起火
- 场景呼号：`BAW 931`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。；与 atc-scenario-0123（BAW 931 鸟击 发动机起火 乘客医疗）/atc-scenario-0123-card-main-2124 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: This time, contact your Company to inform this situation, and also request medical assistance.

### atc-scenario-0029 · BAW 141 进云 雷击 领航

#### BAW 141-4 · atc-scenario-0029-card-main-498

- 场景：`atc-scenario-0029` · BAW 141 进云 雷击 领航
- 场景呼号：`BAW 141`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: There is CB ahead of you, request diversion 5 miles right of track.

#### BAW 141-6 · atc-scenario-0029-card-main-500

- 场景：`atc-scenario-0029` · BAW 141 进云 雷击 领航
- 场景呼号：`BAW 141`
- 原文识别到的呼号：`BAW 141`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 TCAS机动。
- 人工结论：待判

**音频原文**

> C: BAW 141, traffic information, detect primary radar signal at 1 o'clock, 50 kilometres, northwest bound, altitude unknown, we are unable to communicate with the aircraft.
> B: Tell the controller that your TCAS has no indication of that aircraft, and confirm whether the traffic is in conflict with you.

### atc-scenario-0030 · BAW 817 鸟击 左风挡裂

#### BAW 817-8 · atc-scenario-0030-card-main-519

- 场景：`atc-scenario-0030` · BAW 817 鸟击 左风挡裂
- 场景呼号：`BAW 817`
- 原文识别到的呼号：`BAW 817`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、风挡问题，但原文仅明确出现 燃油问题、备降返航。
- 人工结论：待判

**音频原文**

> C: BAW 817, roger PAN, say your intention.
> B: Tell the controller you want to dump fuel and return to land.

#### BAW 817-12 · atc-scenario-0030-card-main-523

- 场景：`atc-scenario-0030` · BAW 817 鸟击 左风挡裂
- 场景呼号：`BAW 817`
- 原文识别到的呼号：`BAW 817`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、风挡问题，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> C: BAW 817, how long do you need to dump fuel?
> B: Tell the controller you need approximately 25 minutes.

### atc-scenario-0031 · BAW 352 询问两地天气 复飞

#### BAW 352-4 · atc-scenario-0031-card-main-532

- 场景：`atc-scenario-0031` · BAW 352 询问两地天气 复飞
- 场景呼号：`BAW 352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2137 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar observed there was a cumulonimbus ahead, contact Wuhan Control and request offset 25 miles left of track for 30 minutes.

#### BAW 352-5 · atc-scenario-0031-card-main-533

- 场景：`atc-scenario-0031` · BAW 352 询问两地天气 复飞
- 场景呼号：`BAW 352`
- 原文识别到的呼号：`BAW 352`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2138 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: BAW 352, cleared offset 25 miles left of track for 30 minutes, report clear of CB.

#### BAW 352-6 · atc-scenario-0031-card-main-534

- 场景：`atc-scenario-0031` · BAW 352 询问两地天气 复飞
- 场景呼号：`BAW 352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2139 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are clear of CB, ask Wuhan Control to resume flight route.

#### BAW 352-8 · atc-scenario-0031-card-main-536

- 场景：`atc-scenario-0031` · BAW 352 询问两地天气 复飞
- 场景呼号：`BAW 352`
- 原文识别到的呼号：`BAW 352`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 备降返航。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2211 的原文词集相似度 91%
- 人工结论：待判

**音频原文**

> C: BAW 352, Hefei Airport is available, confirm you are diverting to Hefei?
> B: Tell the controller you are not diverting to Hefei at the moment, and you still want to fly to Wuhan.

### atc-scenario-0033 · UAL 221 乘客心脏病 乘客不舒服

#### UAL 221-8 · atc-scenario-0033-card-main-569

- 场景：`atc-scenario-0033` · UAL 221 乘客心脏病 乘客不舒服
- 场景呼号：`UAL 221`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。；与 atc-scenario-0174（UAL 221 颠簸 乘客医疗 TCAS机动）/atc-scenario-0174-card-main-3004 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Suddenly, 1 of the passengers suffered from heart attack, contact Wuhan Control and request descent to lower level.

### atc-scenario-0034 · UAL 403 防冰 因重量提前下降

#### UAL 403-14 · atc-scenario-0034-card-main-591

- 场景：`atc-scenario-0034` · UAL 403 防冰 因重量提前下降
- 场景呼号：`UAL 403`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0110（UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞）/atc-scenario-0110-card-main-1900 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: There is an indication of thunderstorm ahead, contact Guangzhou Control and request offset 10 miles right to avoid the weather.

### atc-scenario-0036 · UAL 182 火山灰 双发失效 一发重启不稳定

#### UAL 182-6 · atc-scenario-0036-card-main-617

- 场景：`atc-scenario-0036` · UAL 182 火山灰 双发失效 一发重启不稳定
- 场景呼号：`UAL 182`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 外来物体吸入。
- 人工结论：待判

**音频原文**

> B: Now you are in London Control area, FL350, you encountered volcanic ash, tell ATC the situation and request descent, call London Control.

#### UAL 182-8 · atc-scenario-0036-card-main-619

- 场景：`atc-scenario-0036` · UAL 182 火山灰 双发失效 一发重启不稳定
- 场景呼号：`UAL 182`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 外来物体吸入。
- 人工结论：待判

**音频原文**

> B: Tell ATC you are still in volcanic ash area, both engines are vibrating highly, but aircraft can still be controlled.

### atc-scenario-0038 · UAL 219 中度晴空颠簸

#### UAL 219-5 · atc-scenario-0038-card-main-650

- 场景：`atc-scenario-0038` · UAL 219 中度晴空颠簸
- 场景呼号：`UAL 219`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 TCAS机动。；与 atc-scenario-0170（UAL 219 颠簸 积冰/防冰 TCAS机动）/atc-scenario-0170-card-main-2938 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: TCAS shows a fast moving aircraft at 9 o'clock, check with Wuhan Control if it is a conflicting traffic.

### atc-scenario-0040 · UAL 811 转述增压问题

#### UAL 811-4 · atc-scenario-0040-card-main-681

- 场景：`atc-scenario-0040` · UAL 811 转述增压问题
- 场景呼号：`UAL 811`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 通讯问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0172（UAL 811 颠簸 雷暴绕飞 增压问题）/atc-scenario-0172-card-main-2969 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar indicates there is a cumulonimbus ahead, request Zhengzhou Control for 20 miles deviation right of track and state the reason.

### atc-scenario-0043 · JAL 602 老太太摔倒骨折 担架

#### JAL 602-2 · atc-scenario-0043-card-main-732

- 场景：`atc-scenario-0043` · JAL 602 老太太摔倒骨折 担架
- 场景呼号：`JAL 602`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0181（JAL 602 雷暴绕飞 乘客医疗 TCAS机动）/atc-scenario-0181-card-main-3117 的原文词集相似度 87%
- 人工结论：待判

**音频原文**

> B: You now have an indication of a thunderstorm on your radar screen, fifty kilometers ahead of you, request ATC clearance to offset 5 miles to the right.

#### JAL 602-4 · atc-scenario-0043-card-main-734

- 场景：`atc-scenario-0043` · JAL 602 老太太摔倒骨折 担架
- 场景呼号：`JAL 602`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0181（JAL 602 雷暴绕飞 乘客医疗 TCAS机动）/atc-scenario-0181-card-main-3119 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Later you find more thunderstorms ahead of you, request climb to 10700 meters.

#### JAL 602-7 · atc-scenario-0043-card-main-737

- 场景：`atc-scenario-0043` · JAL 602 老太太摔倒骨折 担架
- 场景呼号：`JAL 602`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0181（JAL 602 雷暴绕飞 乘客医疗 TCAS机动）/atc-scenario-0181-card-main-3122 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: To avoid thunderstorm, you request turn right heading 240 and maintain this heading for fifty miles.

### atc-scenario-0044 · JAL 220 转述接收机失效 吸入外来物体 右发超温

#### JAL 220-14 · atc-scenario-0044-card-main-760

- 场景：`atc-scenario-0044` · JAL 220 转述接收机失效 吸入外来物体 右发超温
- 场景呼号：`JAL 220`
- 原文识别到的呼号：`JAL 220`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 外来物体吸入、通讯问题、发动机问题，但原文仅明确出现 乘客医疗。；与 atc-scenario-0182（JAL 220 鸟击 积冰/防冰 乘客医疗）/atc-scenario-0182-card-main-3145 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: JAL 220, roger, do you need medical assistance at the ramp?
> B: Tell the controller you need medical assistance at the ramp.

### atc-scenario-0046 · ACA 219 询问天气 能见差复飞

#### ACA 219-4 · atc-scenario-0046-card-main-782

- 场景：`atc-scenario-0046` · ACA 219 询问天气 能见差复飞
- 场景呼号：`ACA 219`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 TCAS机动。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2208 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: During descent, your TCAS indicates there is a converging traffic at your 2 o'clock, below, climbing, confirm with Wuhan Control if it is in conflict with you.

#### ACA 219-7 · atc-scenario-0046-card-main-785

- 场景：`atc-scenario-0046` · ACA 219 询问天气 能见差复飞
- 场景呼号：`ACA 219`
- 原文识别到的呼号：`ACA 219`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 备降返航。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2211 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: ACA 219, Changsha Airport is available, confirm you are diverting to Changsha?
> B: Tell the controller you are not diverting to Changsha at the moment, and you still want to fly to Wuhan.

### atc-scenario-0048 · ACA 909 女客心脏病 听不到通播

#### ACA 909-5 · atc-scenario-0048-card-main-821

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Inform the controller that the weather radar shows a cumulonimbus on route ahead about 30 Kilometers, and your level is 3900 meters.

#### ACA 909-6 · atc-scenario-0048-card-main-822

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：`ACA 909`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: Roger, ACA 909, report your intentions.
> B: Tell the controller that you want radar guidance to go round the CB.

#### ACA 909-8 · atc-scenario-0048-card-main-824

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：`ACA 909`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: ACA 909, now you are cleared of the CB, climb to 4500 meters, turn right heading 030 to rejoin the ZF-1D departure.
> B: Acknowledge the controller's instruction and tell him you want to fly to ZF directly from present position.

#### ACA 909-13 · atc-scenario-0048-card-main-829

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: A flight attendant told you that there is a male passenger suffering a heart attack, inform the controller about that and tell him you want to go back to Wuhan. This is an Urgent call.

#### ACA 909-15 · atc-scenario-0048-card-main-831

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：`ACA 909`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: ACA 909, do you need any medical assistance?
> B: Tell the controller that you need a physician and an ambulance upon landing or after landing.

#### ACA 909-17 · atc-scenario-0048-card-main-833

- 场景：`atc-scenario-0048` · ACA 909 女客心脏病 听不到通播
- 场景呼号：`ACA 909`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: Inform Wuhan Approach that you have a passenger suffering heart attack and request landing priority.

### atc-scenario-0049 · ACA 452 偷渡犯 导航,自驾失效

#### ACA 452-16 · atc-scenario-0049-card-main-852

- 场景：`atc-scenario-0049` · ACA 452 偷渡犯 导航,自驾失效
- 场景呼号：`ACA 452`
- 原文识别到的呼号：`ACA 452`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: ACA 452, when able, advise your intention.
> B: Tell the control you will maintain 8100 meters and divert to Beijing.

### atc-scenario-0050 · ACA 517 左发失效 复飞

#### ACA 517-6 · atc-scenario-0050-card-main-859

- 场景：`atc-scenario-0050` · ACA 517 左发失效 复飞
- 场景呼号：`ACA 517`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 发动机问题。；与 atc-scenario-0130（ACA 517 发动机失效 颠簸 TCAS机动）/atc-scenario-0130-card-main-2246 的原文词集相似度 79%
- 人工结论：待判

**音频原文**

> B: When you are at 10700 meters, your left engine failed, make an Urgency call and request turn right and descend to 6300 meters.

#### ACA 517-8 · atc-scenario-0050-card-main-861

- 场景：`atc-scenario-0050` · ACA 517 左发失效 复飞
- 场景呼号：`ACA 517`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Advise Wuhan Control you want to divert to Wuhan and track direct to WHA and descend to lower levels.

### atc-scenario-0051 · ACA 521 滑行道障碍 机长心脏病

#### ACA 521-12 · atc-scenario-0051-card-main-881

- 场景：`atc-scenario-0051` · ACA 521 滑行道障碍 机长心脏病
- 场景呼号：`ACA 521`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 TCAS机动。；与 atc-scenario-0131（ACA 521 乘客医疗 TCAS机动）/atc-scenario-0131-card-main-2268 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your TCAS indicates there is a conflicting traffic at 2 o'clock, 300 meters above your level, confirm with Wuhan Control if it is in conflict with your aircraft.

#### ACA 521-14 · atc-scenario-0051-card-main-883

- 场景：`atc-scenario-0051` · ACA 521 滑行道障碍 机长心脏病
- 场景呼号：`ACA 521`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。；与 atc-scenario-0131（ACA 521 乘客医疗 TCAS机动）/atc-scenario-0131-card-main-2270 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: During cruise, the captain suddenly suffered from heart attack, make an Urgency call to Wuhan Control and request immediate return for priority landing.

### atc-scenario-0053 · CCA 105 装没听清许可 跑道入侵

#### CCA 105-15 · atc-scenario-0053-card-main-916

- 场景：`atc-scenario-0053` · CCA 105 装没听清许可 跑道入侵
- 场景呼号：`CCA 105`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> B: Inform the controller that you found out that there is something wrong with the nose gear, tell the controller you need to dump fuel before landing.

### atc-scenario-0054 · CCA 425 火山灰云 1发熄火

#### CCA 425-8 · atc-scenario-0054-card-main-933

- 场景：`atc-scenario-0054` · CCA 425 火山灰云 1发熄火
- 场景呼号：`CCA 425`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题，但原文仅明确出现 外来物体吸入。
- 人工结论：待判

**音频原文**

> B: You are now at cruising level 10100 meters, few minutes later, you find out you have flown into volcanic ash cloud, No.1 engine has stalled and then flamed out. Make an urgency call, state your situation and request return to Wuhan Airport.

### atc-scenario-0055 · CCA 878 乘客心脏病 一发脱离

#### CCA 878-5 · atc-scenario-0055-card-main-941

- 场景：`atc-scenario-0055` · CCA 878 乘客心脏病 一发脱离
- 场景呼号：`CCA 878`
- 原文识别到的呼号：`CCA 878`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: CCA 878, can you tell us the exact problem the passenger has.
> B: Tell air traffic control the passenger has suffered a heart attack and you were treating him with oxygen.

#### CCA 878-6 · atc-scenario-0055-card-main-942

- 场景：`atc-scenario-0055` · CCA 878 乘客心脏病 一发脱离
- 场景呼号：`CCA 878`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: It is now thirty minutes later in the day, the sick passenger has disembarked and you were at the holding point for Runway 08, tell the Tower you are ready for takeoff.

#### CCA 878-14 · atc-scenario-0055-card-main-950

- 场景：`atc-scenario-0055` · CCA 878 乘客心脏病 一发脱离
- 场景呼号：`CCA 878`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Suddenly, 1 of your engines separates, tell air traffic control this and say you would like to descend to 8100 meters and divert to Shanghai, this is a Distress call.

### atc-scenario-0056 · CCA 124 疑似起飞鸟击 右发熄火

#### CCA 124-8 · atc-scenario-0056-card-main-961

- 场景：`atc-scenario-0056` · CCA 124 疑似起飞鸟击 右发熄火
- 场景呼号：`CCA 124`
- 原文识别到的呼号：`CCA 124`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、发动机问题，但原文仅明确出现 乘客医疗、刹车问题。
- 人工结论：待判

**音频原文**

> C: CCA 124, yeah, it's an online vehicle, um just been informed that it was an ambulance attending an injured workman, is everything okay with your aircraft?
> B: Tell the controller that you applied maximum brake to stop the airplane, but the flight attendant has not given you any injury reports.

### atc-scenario-0057 · CCA 101 撞未知物体 风挡裂

#### CCA 101-17 · atc-scenario-0057-card-main-990

- 场景：`atc-scenario-0057` · CCA 101 撞未知物体 风挡裂
- 场景呼号：`CCA 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 TCAS机动。
- 人工结论：待判

**音频原文**

> B: Your TCAS is activated, and your aircraft is descending under TCAS control, report to ATC.

### atc-scenario-0058 · CCA 512 右发失效 重启失败

#### CCA 512-12 · atc-scenario-0058-card-main-1005

- 场景：`atc-scenario-0058` · CCA 512 右发失效 重启失败
- 场景呼号：`CCA 512`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0020（AFR 101 中度积冰 左发失效）/atc-scenario-0020-card-main-350 的原文词集相似度 88%
- 人工结论：待判

**音频原文**

> B: You are experiencing moderate icing while maintaining 6600 meters, request a higher level and state the reason.

#### CCA 512-14 · atc-scenario-0058-card-main-1007

- 场景：`atc-scenario-0058` · CCA 512 右发失效 重启失败
- 场景呼号：`CCA 512`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 发动机问题。；与 atc-scenario-0142（CCA 512 发动机失效 积冰/防冰 TCAS机动）/atc-scenario-0142-card-main-2458 的原文词集相似度 86%
- 人工结论：待判

**音频原文**

> B: Suddenly, your starboard engine failed at 7200 meters, make an Urgency call to ATC and request descent and return to Wuhan Airport.

### atc-scenario-0060 · CCA 725 一发启动失败 老太太心脏病 前轮转向失效

#### CCA 725-7 · atc-scenario-0060-card-main-1035

- 场景：`atc-scenario-0060` · CCA 725 一发启动失败 老太太心脏病 前轮转向失效
- 场景呼号：`CCA 725`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 乘客医疗。；与 atc-scenario-0143（CCA 725 起落架问题 积冰/防冰 乘客医疗）/atc-scenario-0143-card-main-2469 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: During initial climb, an old lady on board suffered from a heart attack, this is an Urgency call, tell the controller you want to return to the airport and request priority landing in medical assistance.

#### CCA 725-15 · atc-scenario-0060-card-main-1043

- 场景：`atc-scenario-0060` · CCA 725 一发启动失败 老太太心脏病 前轮转向失效
- 场景呼号：`CCA 725`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 乘客医疗。；与 atc-scenario-0143（CCA 725 起落架问题 积冰/防冰 乘客医疗）/atc-scenario-0143-card-main-2477 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now the lady's condition is deteriorating, you confirm with the controller if the medical service will be ready at the gate.

#### CCA 725-16 · atc-scenario-0060-card-main-1044

- 场景：`atc-scenario-0060` · CCA 725 一发启动失败 老太太心脏病 前轮转向失效
- 场景呼号：`CCA 725`
- 原文识别到的呼号：`CCA 725`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题，但原文仅明确出现 乘客医疗。；与 atc-scenario-0143（CCA 725 起落架问题 积冰/防冰 乘客医疗）/atc-scenario-0143-card-main-2478 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CCA 725, affirm, the ambulance and medical services have been ready at the gate.

### atc-scenario-0062 · CCA 976 烟雾警报 烟雾难以忍受

#### CCA 976-12 · atc-scenario-0062-card-main-1073

- 场景：`atc-scenario-0062` · CCA 976 烟雾警报 烟雾难以忍受
- 场景呼号：`CCA 976`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 襟翼问题。；与 atc-scenario-0146（CCA 976 起落架问题 襟翼问题 烟雾）/atc-scenario-0146-card-main-2525 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Tell Ground you are clear of Runway 04 at F, and that you had to abort takeoff because flap setting is incorrect.

### atc-scenario-0064 · CCA 321 机长心脏骤停失能 PCR ILS区域非空

#### CCA 321-4 · atc-scenario-0064-card-main-1102

- 场景：`atc-scenario-0064` · CCA 321 机长心脏骤停失能 PCR ILS区域非空
- 场景呼号：`CCA 321`
- 原文识别到的呼号：`CCA 321`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: CCA 321, when able, say your intention.
> B: Tell the controller that you'd like to divert to Wuhan and you need physician and first aid upon landing.

#### CCA 321-6 · atc-scenario-0064-card-main-1104

- 场景：`atc-scenario-0064` · CCA 321 机长心脏骤停失能 PCR ILS区域非空
- 场景呼号：`CCA 321`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。；与 atc-scenario-0150（CCA 321 积冰/防冰 乘客医疗 TCAS机动）/atc-scenario-0150-card-main-2595 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are over ZF, maintaining 6000 meters, inform your situation to Wuhan Approach and request priority landing and medical services.

#### CCA 321-14 · atc-scenario-0064-card-main-1112

- 场景：`atc-scenario-0064` · CCA 321 机长心脏骤停失能 PCR ILS区域非空
- 场景呼号：`CCA 321`
- 原文识别到的呼号：`CCA 321`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: CCA 321, my apologies for that, follow the standard missed approach procedure, climb to 1500 meters, contact Wuhan Approach on 119.35.

### atc-scenario-0065 · CCA 983 雷击 使用APU

#### CCA 983-6 · atc-scenario-0065-card-main-1121

- 场景：`atc-scenario-0065` · CCA 983 雷击 使用APU
- 场景呼号：`CCA 983`
- 原文识别到的呼号：`CCA 983`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CCA 983, what is the detailed ride condition?
> B: Tell the ATC, the turbulence is caused by cumulonimbus.

#### CCA 983-10 · atc-scenario-0065-card-main-1125

- 场景：`atc-scenario-0065` · CCA 983 雷击 使用APU
- 场景呼号：`CCA 983`
- 原文识别到的呼号：`CCA 983`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 风挡问题。
- 人工结论：待判

**音频原文**

> C: CCA 983, roger, where did the lightning strike you?
> B: Only the left hand windshield was struck, others are all normal.

#### CCA 983-15 · atc-scenario-0065-card-main-1130

- 场景：`atc-scenario-0065` · CCA 983 雷击 使用APU
- 场景呼号：`CCA 983`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: As a passenger was bruised on the head during the turbulence, request medical service on arrival.

#### CCA 983-16 · atc-scenario-0065-card-main-1131

- 场景：`atc-scenario-0065` · CCA 983 雷击 使用APU
- 场景呼号：`CCA 983`
- 原文识别到的呼号：`CCA 983`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: CCA 983, medical services will be ready on arrival.
> B: You have established localizer, contact Beijing Tower.

### atc-scenario-0066 · CCA 101 除冰 4号引擎灭火失败

#### CCA 101-1 · atc-scenario-0066-card-main-1134

- 场景：`atc-scenario-0066` · CCA 101 除冰 4号引擎灭火失败
- 场景呼号：`CCA 101`
- 原文识别到的呼号：`CCA 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> B: You are at Beijing Airport, your call sign is CCA 101, there's ice accumulated on your plane, you want to have the ice removed before start-up. Contact Beijing Ground to request de-icing service.

#### CCA 101-2 · atc-scenario-0066-card-main-1135

- 场景：`atc-scenario-0066` · CCA 101 除冰 4号引擎灭火失败
- 场景呼号：`CCA 101`
- 原文识别到的呼号：`CCA 101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> C: CCA 101, Beijing Ground, where do you want to de-ice?
> B: Tell Ground you want to de-ice on taxiway D7.

#### CCA 101-3 · atc-scenario-0066-card-main-1136

- 场景：`atc-scenario-0066` · CCA 101 除冰 4号引擎灭火失败
- 场景呼号：`CCA 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> B: Inform Ground de-icing completed on D7, ready to taxi.

#### CCA 101-5 · atc-scenario-0066-card-main-1138

- 场景：`atc-scenario-0066` · CCA 101 除冰 4号引擎灭火失败
- 场景呼号：`CCA 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> B: Your de-icing fluid is only effective for 30 minutes, tell Ground that you need to take off before 0900 and request an intersection departure from Z4.

### atc-scenario-0067 · CCA 1089 慢释压 有乘客昏迷

#### CCA 1089-17 · atc-scenario-0067-card-main-1160

- 场景：`atc-scenario-0067` · CCA 1089 慢释压 有乘客昏迷
- 场景呼号：`CCA 1089`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: You are now level of 3000 meters and are considering diverting to Hangzhou, ask for the weather at Hangzhou Airport.

### atc-scenario-0068 · CCA 301 刹车超温 一个前轮没气

#### CCA 301-14 · atc-scenario-0068-card-main-1174

- 场景：`atc-scenario-0068` · CCA 301 刹车超温 一个前轮没气
- 场景呼号：`CCA 301`
- 原文识别到的呼号：`CCA 301`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、刹车问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: CCA 301, the landing aircraft on the short final just made the go around.

### atc-scenario-0070 · CCA 368(印度口音)跑线 复飞

#### CCA 368-1 · atc-scenario-0070-card-main-1196

- 场景：`atc-scenario-0070` · CCA 368(印度口音)跑线 复飞
- 场景呼号：`CCA 368`
- 原文识别到的呼号：`CCA 368`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0151（CCA 1368 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0151-card-main-2607 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your call sign is CCA 368, a flight from Shenzhen to Beijing, your weather radar indicates a squall line near VYK, contact Beijing Approach and request parallel offset 10 miles right of track until PEK VOR.

### atc-scenario-0071 · CSN 542 撞气球 机翼,控制面损坏

#### CSN 542-15 · atc-scenario-0071-card-main-1226

- 场景：`atc-scenario-0071` · CSN 542 撞气球 机翼,控制面损坏
- 场景呼号：`CSN 542`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Before ATC replies, you suddenly hit another balloon you did not see, the aircraft becomes difficult to control and you want to return to land at Chengdu, tell ATC this. This is an Urgency call.

### atc-scenario-0072 · CSN 342 炸弹电话 复飞

#### CSN 342-12 · atc-scenario-0072-card-main-1243

- 场景：`atc-scenario-0072` · CSN 342 炸弹电话 复飞
- 场景呼号：`CSN 342`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Make an initial contact with Wuhan Approach, inform the controller that you have received an anonymous call saying there is a bomb on board your aircraft, and you are returning to Wuhan.

### atc-scenario-0073 · CSN 319 一套液压系统失效

#### CSN 319-16 · atc-scenario-0073-card-main-1266

- 场景：`atc-scenario-0073` · CSN 319 一套液压系统失效
- 场景呼号：`CSN 319`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 液压问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0154（CSN 319 液压问题 雷暴绕飞 TCAS机动）/atc-scenario-0154-card-main-2670 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: A thunderstorm was detected near LKO, report it to Wuhan Approach and ask to deviate 20 miles to the left.

### atc-scenario-0074 · CSN 817 强风切变 浓雾

#### CSN 817-6 · atc-scenario-0074-card-main-1272

- 场景：`atc-scenario-0074` · CSN 817 强风切变 浓雾
- 场景呼号：`CSN 817`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Just after liftoff, you encountered strong wind shear between 200 meters and 400 meters, report it to Wuhan Approach.

#### CSN 817-9 · atc-scenario-0074-card-main-1275

- 场景：`atc-scenario-0074` · CSN 817 强风切变 浓雾
- 场景呼号：`CSN 817`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 TCAS机动。
- 人工结论：待判

**音频原文**

> B: As you are descending to 4200 meters, you executed TCAS RA climbing maneuver, report the situation to the controller.

### atc-scenario-0075 · CSN 557 左主起落架未收回 液压系统漏油

#### CSN 557-17 · atc-scenario-0075-card-main-1298

- 场景：`atc-scenario-0075` · CSN 557 左主起落架未收回 液压系统漏油
- 场景呼号：`CSN 557`
- 原文识别到的呼号：`CSN 557`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、液压问题，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> C: CSN 557, roger PAN, climb to and maintain 3000 meters, turn left heading 310, radar vector to dump fuel, we will have emergency services ready and foam the runway slowly.

### atc-scenario-0076 · CSN 371 自动刹车警告 丢失几页飞行手册

#### CSN 371-12 · atc-scenario-0076-card-main-1311

- 场景：`atc-scenario-0076` · CSN 371 自动刹车警告 丢失几页飞行手册
- 场景呼号：`CSN 371`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 刹车问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: While communicating with mechanic and dispatcher, you discovered that some pages of onboard flight manuals were missing, it is against regulation to continue flight, report it to ATC and ask for returning to the gate.

### atc-scenario-0077 · CSN 102 因延误重新加油

#### CSN 102-13 · atc-scenario-0077-card-main-1330

- 场景：`atc-scenario-0077` · CSN 102 因延误重新加油
- 场景呼号：`CSN 102`
- 原文识别到的呼号：`CSN 102`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 102, hold short of Runway 36R, expect 15 minutes delay due thunderstorm approaching the upwind of Runway 36R.

### atc-scenario-0078 · CSN 109 冰雹风挡裂 自动降落许可

#### CSN 109-3 · atc-scenario-0078-card-main-1335

- 场景：`atc-scenario-0078` · CSN 109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0155（CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动）/atc-scenario-0155-card-main-2673 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar observed a thunderstorm ahead, request Beijing Control for a right turn to avoid the thunderstorm.

#### CSN 109-6 · atc-scenario-0078-card-main-1338

- 场景：`atc-scenario-0078` · CSN 109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0155（CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动）/atc-scenario-0155-card-main-2676 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now there is a strong E of thunderstorm, you are too close to the weather, request left turn to avoid it.

#### CSN 109-8 · atc-scenario-0078-card-main-1340

- 场景：`atc-scenario-0078` · CSN 109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Suddenly, you have suffered from hail strike, the wind shield is cracked on the outside, report it to Beijing Control and request return to land.

### atc-scenario-0079 · CSN 310 减跑道 地面延误加油

#### CSN 310-15 · atc-scenario-0079-card-main-1363

- 场景：`atc-scenario-0079` · CSN 310 减跑道 地面延误加油
- 场景呼号：`CSN 310`
- 原文识别到的呼号：`CSN 310`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0157（CSN 1310 雷暴绕飞 TCAS机动 延误/加油）/atc-scenario-0157-card-main-2717 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 310, hold short of Runway 36R, expect 15 minutes delay due thunderstorms in the vicinity of the airport.

### atc-scenario-0080 · CSN 202 前缘襟翼结冰

#### CSN 202-4 · atc-scenario-0080-card-main-1369

- 场景：`atc-scenario-0080` · CSN 202 前缘襟翼结冰
- 场景呼号：`CSN 202`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Inform the controller that your weather radar shows a build-up around YV, request direct to KAKAT.

#### CSN 202-7 · atc-scenario-0080-card-main-1372

- 场景：`atc-scenario-0080` · CSN 202 前缘襟翼结冰
- 场景呼号：`CSN 202`
- 原文识别到的呼号：`CSN 202`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 202, climb to and maintain 10700 meters due Air Force restriction, suggest heading 020.
> B: Because the CB is 2 large, you want heading 030.

#### CSN 202-10 · atc-scenario-0080-card-main-1375

- 场景：`atc-scenario-0080` · CSN 202 前缘襟翼结冰
- 场景呼号：`CSN 202`
- 原文识别到的呼号：`CSN 202`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> C: CSN 202, Beijing roger.
> B: Tell the controller that you are getting an ice build-up as a result of suspected de-icing equipment failure, request descent below freezing level.

### atc-scenario-0082 · CSN 311 跑线 宣布燃油紧急

#### CSN 311-1 · atc-scenario-0082-card-main-1403

- 场景：`atc-scenario-0082` · CSN 311 跑线 宣布燃油紧急
- 场景呼号：`CSN 311`
- 原文识别到的呼号：`CSN 311`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2735 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 311, a flight from Beijing to Guangzhou, the preceding aircraft reported a squall line 100 miles ahead on the weather radar, contact Beijing Control and request turn right to circumnavigate the weather.

#### CSN 311-2 · atc-scenario-0082-card-main-1404

- 场景：`atc-scenario-0082` · CSN 311 跑线 宣布燃油紧急
- 场景呼号：`CSN 311`
- 原文识别到的呼号：`CSN 311`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2736 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 311, Beijing Control, negative due prohibited area, turn left 30 degrees, track out 35 kilometers, report clear of CB.

#### CSN 311-3 · atc-scenario-0082-card-main-1405

- 场景：`atc-scenario-0082` · CSN 311 跑线 宣布燃油紧急
- 场景呼号：`CSN 311`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2737 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are clear of CB and closing back to the course, contact Beijing Control.

### atc-scenario-0085 · CSN 102 乘客被热咖啡烫伤

#### CSN 102-7 · atc-scenario-0085-card-main-1464

- 场景：`atc-scenario-0085` · CSN 102 乘客被热咖啡烫伤
- 场景呼号：`CSN 102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Weather forecast says the thunderstorm will not improve in about half an hour, you decide to taxi back to the apron for holding.

#### CSN 102-14 · atc-scenario-0085-card-main-1471

- 场景：`atc-scenario-0085` · CSN 102 乘客被热咖啡烫伤
- 场景呼号：`CSN 102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: During climb, 1 of the passengers was scalded by hot coffee, contact Guangzhou Departure and request return to land.

### atc-scenario-0086 · CSN 235 完全准备 强风切变

#### CSN 235-5 · atc-scenario-0086-card-main-1483

- 场景：`atc-scenario-0086` · CSN 235 完全准备 强风切变
- 场景呼号：`CSN 235`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 舱门问题。；与 atc-scenario-0158（CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题）/atc-scenario-0158-card-main-2724 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: All the passengers have boarded the aircraft, all cabin doors have been closed, you are fully ready.

#### CSN 235-12 · atc-scenario-0086-card-main-1490

- 场景：`atc-scenario-0086` · CSN 235 完全准备 强风切变
- 场景呼号：`CSN 235`
- 原文识别到的呼号：`CSN 235`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 235, line up Runway 08L and cleared for takeoff, caution strong wind shear at the departure end of the runway.

#### CSN 235-13 · atc-scenario-0086-card-main-1491

- 场景：`atc-scenario-0086` · CSN 235 完全准备 强风切变
- 场景呼号：`CSN 235`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Just after liftoff, you encountered strong wind shear between the surface and 200 meters, report it to Beijing Departure.

### atc-scenario-0088 · CSN 302 异物击中,疑似冰雹,仪表失真

#### CSN 302-2 · atc-scenario-0088-card-main-1512

- 场景：`atc-scenario-0088` · CSN 302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 302`
- 原文识别到的呼号：`CSN 302`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0160（CSN 302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2755 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 302, stand by, expect 20 minutes delay, thunderstorm is approaching the airport, numerous aircraft holding for weather improvement.

#### CSN 302-12 · atc-scenario-0088-card-main-1522

- 场景：`atc-scenario-0088` · CSN 302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 302`
- 原文识别到的呼号：`CSN 302`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0160（CSN 302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2765 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 302, line up and wait Runway 19, caution thunderstorm building up at the departure end of Runway 19.
> B: Read back ATC clearance and request right turn when airborne due weather.

#### CSN 302-16 · atc-scenario-0088-card-main-1526

- 场景：`atc-scenario-0088` · CSN 302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 302`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 备降返航。；与 atc-scenario-0160（CSN 302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2769 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: During climb, suddenly you have been struck by foreign object, possibly hail strike, your instruments are indicating incorrectly, report it to Guangzhou Approach and request return to land.

### atc-scenario-0089 · CES 556 醉客不理性乱秩序 氧气面罩 灭火器

#### CES 556-15 · atc-scenario-0089-card-main-1544

- 场景：`atc-scenario-0089` · CES 556 醉客不理性乱秩序 氧气面罩 灭火器
- 场景呼号：`CES 556`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0135（CES 556 颠簸 雷暴绕飞 积冰/防冰）/atc-scenario-0135-card-main-2339 的原文词集相似度 95%
- 人工结论：待判

**音频原文**

> B: Your weather radar observed a cumuliform clouds ahead, contact Wuhan Approach and request turn left and track direct to HG.

### atc-scenario-0091 · CES 529 右空调过热都失效 5乘客重伤

#### CES 529-9 · atc-scenario-0091-card-main-1573

- 场景：`atc-scenario-0091` · CES 529 右空调过热都失效 5乘客重伤
- 场景呼号：`CES 529`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: The cabin crew reports 5 passengers in the cabin are seriously injured during emergency descent, inform the situation to Shanghai Control and request diversion to Hangzhou.

#### CES 529-10 · atc-scenario-0091-card-main-1574

- 场景：`atc-scenario-0091` · CES 529 右空调过热都失效 5乘客重伤
- 场景呼号：`CES 529`
- 原文识别到的呼号：`CES 529`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。；与 atc-scenario-0139（CES 529 TCAS机动 备降/返航）/atc-scenario-0139-card-main-2408 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CES 529, divert to Hangzhou approved, what assistance do you need?
> B: Tell the controller you need ambulances upon arrival.

### atc-scenario-0092 · CES 565 高客舱高警报 缝翼卡阻

#### CES 565-10 · atc-scenario-0092-card-main-1589

- 场景：`atc-scenario-0092` · CES 565 高客舱高警报 缝翼卡阻
- 场景呼号：`CES 565`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0133（CES 565 缝翼问题 积冰/防冰 TCAS机动）/atc-scenario-0133-card-main-2298 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: You are cruising at 3300 meters, you are encountering moderate icing, contact Wuhan Control and ask for a higher level.

#### CES 565-15 · atc-scenario-0092-card-main-1594

- 场景：`atc-scenario-0092` · CES 565 高客舱高警报 缝翼卡阻
- 场景呼号：`CES 565`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 积冰防冰。；与 atc-scenario-0133（CES 565 缝翼问题 积冰/防冰 TCAS机动）/atc-scenario-0133-card-main-2303 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are reaching 3000 meters in icing condition, contact Wuhan Approach and ask for landing information.

### atc-scenario-0097 · CES 325 左翼撞击 三号熄火 冲出跑道

#### CES 325-3 · atc-scenario-0097-card-main-1666

- 场景：`atc-scenario-0097` · CES 325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 325`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题，但原文仅明确出现 TCAS机动。
- 人工结论：待判

**音频原文**

> B: You have just followed your TCAS RA instruction. You have stopped your descent at nearly 6800 meters and track out 9 kilometers right of the course, report to ATC.

### atc-scenario-0098 · CES 5118 加餐水 前机堵滑行道

#### CES 5118-7 · atc-scenario-0098-card-main-1693

- 场景：`atc-scenario-0098` · CES 5118 加餐水 前机堵滑行道
- 场景呼号：`CES 5118`
- 原文识别到的呼号：`CES 5118`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0137（CES 5118 雷暴绕飞 TCAS机动 舱门问题）/atc-scenario-0137-card-main-2366 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CES 5118, due to thunderstorm activity, flow control is now in effect, expect 8 minutes separation between each aircraft going the same direction.

#### CES 5118-8 · atc-scenario-0098-card-main-1694

- 场景：`atc-scenario-0098` · CES 5118 加餐水 前机堵滑行道
- 场景呼号：`CES 5118`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0137（CES 5118 雷暴绕飞 TCAS机动 舱门问题）/atc-scenario-0137-card-main-2367 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Heavy rain is starting to fall, accompanied with lightning and thunder.
> C: All the aircraft on my frequency, airport will temporarily close, thunderstorms on final, expect delay until the weather improves, squawk ident if you copy this message.

#### CES 5118-15 · atc-scenario-0098-card-main-1701

- 场景：`atc-scenario-0098` · CES 5118 加餐水 前机堵滑行道
- 场景呼号：`CES 5118`
- 原文识别到的呼号：`CES 5118`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 舱门问题。；与 atc-scenario-0137（CES 5118 雷暴绕飞 TCAS机动 舱门问题）/atc-scenario-0137-card-main-2374 的原文词集相似度 94%
- 人工结论：待判

**音频原文**

> C: CES 5118, are you fully ready now?we have a slot time for departure in 10 minutes.
> B: You need to open the cabin door to add passenger food and drinks due to the long delay, advise Ground you will need another 5 minutes for catering.

### atc-scenario-0100 · CCA 102 左发熄火 液压 起落架

#### CCA 102-4 · atc-scenario-0100-card-main-1729

- 场景：`atc-scenario-0100` · CCA 102 左发熄火 液压 起落架
- 场景呼号：`CCA 102`
- 原文识别到的呼号：`CCA 102`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、起落架问题、液压问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: Roger PAN, CCA 102, what is your intention?
> B: Tell controller you intend to return to land as soon as possible.

### atc-scenario-0104 · CSN 303 防冰坏 微动开关问题

#### CSN 303-6 · atc-scenario-0104-card-main-1788

- 场景：`atc-scenario-0104` · CSN 303 防冰坏 微动开关问题
- 场景呼号：`CSN 303`
- 原文识别到的呼号：`CSN 303`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰，但原文仅明确出现 燃油问题、备降返航。
- 人工结论：待判

**音频原文**

> C: Roger, CSN 303.
> B: Tell the controller you intend to dump fuel for 15 minutes then return to land.

### atc-scenario-0105 · CSN 230 滑行灯暗 右主轮滑出跑道

#### CSN 230-18 · atc-scenario-0105-card-main-1820

- 场景：`atc-scenario-0105` · CSN 230 滑行灯暗 右主轮滑出跑道
- 场景呼号：`CSN 230`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 起落架问题。
- 人工结论：待判

**音频原文**

> B: Your right main gear skidded off the taxiway. Ask for a tug.

### atc-scenario-0106 · ACA 412 请求绕飞 左发进水熄火

#### ACA 412-12 · atc-scenario-0106-card-main-1833

- 场景：`atc-scenario-0106` · ACA 412 请求绕飞 左发进水熄火
- 场景呼号：`ACA 412`
- 原文识别到的呼号：`ACA 412`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题，但原文仅明确出现 乘客医疗、雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: ACA 412, cleared to detour the thunderstorm from the left.
> B: You ran into severe turbulence in CBs, some persons injured.

#### ACA 412-13 · atc-scenario-0106-card-main-1834

- 场景：`atc-scenario-0106` · ACA 412 请求绕飞 左发进水熄火
- 场景呼号：`ACA 412`
- 原文识别到的呼号：`ACA 412`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: ACA 412, what's your intention?
> B: You want priority landing and medical assistance.

### atc-scenario-0107 · ACA 123 装载问题 右发漏油

#### ACA 123-5 · atc-scenario-0107-card-main-1842

- 场景：`atc-scenario-0107` · ACA 123 装载问题 右发漏油
- 场景呼号：`ACA 123`
- 原文识别到的呼号：`ACA 123`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: ACA 123, your flight plan has been amended, you’ll divert to COG to pick up some cargo and transit passengers, is that right?
> B: Tell the controller Yes.

### atc-scenario-0108 · AFR 113 发动机失效 乘客医疗 TCAS机动

#### AFR 113-11 · atc-scenario-0108-card-main-1862

- 场景：`atc-scenario-0108` · AFR 113 发动机失效 乘客医疗 TCAS机动
- 场景呼号：`AFR 113`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、乘客医疗、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: During the climb, your port engine fails, tell the controller this situation and you would like to return to land.

### atc-scenario-0109 · SIA 123 鸟击 发动机失效 积冰/防冰

#### SIA 123-9 · atc-scenario-0109-card-main-1879

- 场景：`atc-scenario-0109` · SIA 123 鸟击 发动机失效 积冰/防冰
- 场景呼号：`SIA 123`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、发动机问题、积冰防冰，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> tell Tower you want to dump fuel and return to Wuhan Airport.

### atc-scenario-0110 · UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞

#### UAL 403-2 · atc-scenario-0110-card-main-1888

- 场景：`atc-scenario-0110` · UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞
- 场景呼号：`UAL 403`
- 原文识别到的呼号：`UAL 403`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> C: UAL 403, where do you want to de-ice?
> B: Tell the controller you want to de-ice on taxiway Z4.
> P: Wuhan Ground, UAL 403, request de-icing on taxiway Z4.

#### UAL 403-3 · atc-scenario-0110-card-main-1889

- 场景：`atc-scenario-0110` · UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞
- 场景呼号：`UAL 403`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞，但原文仅明确出现 积冰防冰。；与 atc-scenario-0034（UAL 403 防冰 因重量提前下降）/atc-scenario-0034-card-main-580 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Tell the Ground controller you have completed de-icing and you are ready for taxi.

#### UAL 403-5 · atc-scenario-0110-card-main-1891

- 场景：`atc-scenario-0110` · UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞
- 场景呼号：`UAL 403`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞，但原文仅明确出现 积冰防冰。；与 atc-scenario-0034（UAL 403 防冰 因重量提前下降）/atc-scenario-0034-card-main-582 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: The de-icing fluid is only effective for 30 minutes, tell the Ground controller you need to takeoff before 0835, and request intersection departure from Z4.

### atc-scenario-0112 · CSN 557 液压问题 起落架问题 燃油泄漏

#### CSN 557-17 · atc-scenario-0112-card-main-1936

- 场景：`atc-scenario-0112` · CSN 557 液压问题 起落架问题 燃油泄漏
- 场景呼号：`CSN 557`
- 原文识别到的呼号：`CSN 557`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、液压问题，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> C: CSN 557, roger PAN, climb to and maintain 3000 meters, turn left heading 310, radar vector to dump fuel, we will have emergency services ready and foam the runway slowly.

### atc-scenario-0113 · CSN 542 撞气球 可疑炸弹/无人认领行李 机翼/控制面损坏

#### CSN 542-15 · atc-scenario-0113-card-main-1952

- 场景：`atc-scenario-0113` · CSN 542 撞气球 可疑炸弹/无人认领行李 机翼/控制面损坏
- 场景呼号：`CSN 542`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Before ATC replies, you suddenly hit another balloon you did not see, the aircraft becomes difficult to control and you want to return to land at Chengdu, tell ATC this. This is an Urgency call.

### atc-scenario-0114 · CSN 3102 雷暴绕飞 积冰/防冰 乘客医疗

#### CSN 3102-14 · atc-scenario-0114-card-main-1971

- 场景：`atc-scenario-0114` · CSN 3102 雷暴绕飞 积冰/防冰 乘客医疗
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、乘客医疗、雷暴绕飞，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: During climb, 1 of the passengers was scalded by hot coffee, contact Guangzhou Departure and request return to land.

### atc-scenario-0116 · CSN 3102 雷暴绕飞 TCAS机动 舱门问题

#### CSN 3102-16 · atc-scenario-0116-card-main-2012

- 场景：`atc-scenario-0116` · CSN 3102 雷暴绕飞 TCAS机动 舱门问题
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞、TCAS机动、舱门问题，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> After a long time delay, you find your fuel endurance is dropping fast, you have to taxi back for refueling the aircraft.

### atc-scenario-0118 · CSN 371 刹车问题 TCAS机动

#### CSN 371-12 · atc-scenario-0118-card-main-2042

- 场景：`atc-scenario-0118` · CSN 371 刹车问题 TCAS机动
- 场景呼号：`CSN 371`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、刹车问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: While communicating with mechanic and dispatcher, you discovered that some pages of onboard flight manuals were missing, it is against regulation to continue flight, report it to ATC and ask for returning to the gate.

### atc-scenario-0119 · SIA 615 鸟击 积冰/防冰 烟雾

#### SIA 615-15 · atc-scenario-0119-card-main-2063

- 场景：`atc-scenario-0119` · SIA 615 鸟击 积冰/防冰 烟雾
- 场景呼号：`SIA 615`
- 原文识别到的呼号：`SIA 615`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> SIA 615, say your further intention?
> the smoke is removed, you have turned off the air conditioning system, you want radar guidance to return to land at Wuhan Airport.

### atc-scenario-0120 · AFR 101 发动机失效 积冰/防冰 TCAS机动

#### AFR 101-15 · atc-scenario-0120-card-main-2081

- 场景：`atc-scenario-0120` · AFR 101 发动机失效 积冰/防冰 TCAS机动
- 场景呼号：`AFR 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、积冰防冰、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> Suddenly your left engine has failed at 6000 meters, make an urgency call to ATC and request to descend and return to land at Wuhan Airport.

### atc-scenario-0124 · BAW 352 鸟击 雷暴绕飞 TCAS机动

#### BAW 352-8 · atc-scenario-0124-card-main-2141

- 场景：`atc-scenario-0124` · BAW 352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 352`
- 原文识别到的呼号：`BAW 352`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 备降返航。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2211 的原文词集相似度 91%
- 人工结论：待判

**音频原文**

> C: BAW 352, Hefei airport is available, confirm you are diverting to Hefei?
> B: tell the controller you are not diverting to Hefei at the moment and you still want to fly to Wuhan.

#### BAW 352-16 · atc-scenario-0124-card-main-2149

- 场景：`atc-scenario-0124` · BAW 352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0031（BAW 352 询问两地天气 复飞）/atc-scenario-0031-card-main-544 的原文词集相似度 88%
- 人工结论：待判

**音频原文**

> the weather is deteriorating and below your landing minima, you executed a missed approach, advise tower.

#### BAW 352-17 · atc-scenario-0124-card-main-2150

- 场景：`atc-scenario-0124` · BAW 352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 352`
- 原文识别到的呼号：`BAW 352`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0031（BAW 352 询问两地天气 复飞）/atc-scenario-0031-card-main-545 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> BAW 352, roger, follow the standard missed approach procedure, advise intentions when able.

#### BAW 352-18 · atc-scenario-0124-card-main-2151

- 场景：`atc-scenario-0124` · BAW 352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 备降返航、复飞。；与 atc-scenario-0031（BAW 352 询问两地天气 复飞）/atc-scenario-0031-card-main-546 的原文词集相似度 87%
- 人工结论：待判

**音频原文**

> now you are climbing to missed approach altitude, you decide to divert to Hefei Airport, inform Tower.

### atc-scenario-0125 · BAW 120 鸟击 积冰/防冰 TCAS机动

#### BAW 120-13 · atc-scenario-0125-card-main-2165

- 场景：`atc-scenario-0125` · BAW 120 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`BAW 120`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 雷暴绕飞、复飞。
- 人工结论：待判

**音频原文**

> you encountered strong wind shear on short final, you made a missed approach, report it to Wuhan Tower.

#### BAW 120-14 · atc-scenario-0125-card-main-2166

- 场景：`atc-scenario-0125` · BAW 120 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`BAW 120`
- 原文识别到的呼号：`BAW 120`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> BAW 120, follow standard missed approach procedure, climb to 1,800 meters.

### atc-scenario-0126 · BAW 817 鸟击 积冰/防冰 TCAS机动

#### BAW 817-8 · atc-scenario-0126-card-main-2176

- 场景：`atc-scenario-0126` · BAW 817 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`BAW 817`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 燃油问题、备降返航。
- 人工结论：待判

**音频原文**

> tell the controller you want to dump fuel and return to land.

#### BAW 817-12 · atc-scenario-0126-card-main-2180

- 场景：`atc-scenario-0126` · BAW 817 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`BAW 817`
- 原文识别到的呼号：`BAW 817`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> C: BAW 817, how long do you need to dump fuel?
> B: tell the controller you need approximately 25 minutes.

### atc-scenario-0129 · ACA 452 颠簸 积冰/防冰 TCAS机动

#### ACA 452-16 · atc-scenario-0129-card-main-2239

- 场景：`atc-scenario-0129` · ACA 452 颠簸 积冰/防冰 TCAS机动
- 场景呼号：`ACA 452`
- 原文识别到的呼号：`ACA 452`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> ACA 452, when able, advise your intention.
> Tell the control you will maintain 8100m and divert to Beijing.

### atc-scenario-0130 · ACA 517 发动机失效 颠簸 TCAS机动

#### ACA 517-8 · atc-scenario-0130-card-main-2248

- 场景：`atc-scenario-0130` · ACA 517 发动机失效 颠簸 TCAS机动
- 场景呼号：`ACA 517`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Advise Wuhan Control you want to divert to Wuhan and track direct to WHA and descend to lower levels.

#### ACA 517-13 · atc-scenario-0130-card-main-2253

- 场景：`atc-scenario-0130` · ACA 517 发动机失效 颠簸 TCAS机动
- 场景呼号：`ACA 517`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0050（ACA 517 左发失效 复飞）/atc-scenario-0050-card-main-866 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> you executed a missed approach procedure and try to land on Runway 36R.

#### ACA 517-14 · atc-scenario-0130-card-main-2254

- 场景：`atc-scenario-0130` · ACA 517 发动机失效 颠簸 TCAS机动
- 场景呼号：`ACA 517`
- 原文识别到的呼号：`ACA 517`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0050（ACA 517 左发失效 复飞）/atc-scenario-0050-card-main-867 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: ACA 517, climb to 1200 meters, follow the standard missed approach procedure.

### atc-scenario-0139 · CES 529 TCAS机动 备降/返航

#### CES 529-9 · atc-scenario-0139-card-main-2407

- 场景：`atc-scenario-0139` · CES 529 TCAS机动 备降/返航
- 场景呼号：`CES 529`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、备降返航，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> B: The cabin crew reports 5 passengers in the cabin are seriously injured during emergency descent, inform the situation to Shanghai Control and request diversion to Hangzhou.

### atc-scenario-0148 · CCA 1301 起落架问题 刹车问题 积冰/防冰

#### CCA 1301-14 · atc-scenario-0148-card-main-2563

- 场景：`atc-scenario-0148` · CCA 1301 起落架问题 刹车问题 积冰/防冰
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 1301`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、起落架问题、刹车问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> CCA 1301, the landing aircraft on the short final just made the go around.

### atc-scenario-0149 · CCA 3101 起落架问题 刹车问题 积冰/防冰

#### CCA 3101-14 · atc-scenario-0149-card-main-2583

- 场景：`atc-scenario-0149` · CCA 3101 起落架问题 刹车问题 积冰/防冰
- 场景呼号：`CCA 3101`
- 原文识别到的呼号：`CCA 3101`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、起落架问题、刹车问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> CCA 3101, the landing aircraft on the short final just made the go around.

### atc-scenario-0150 · CCA 321 积冰/防冰 乘客医疗 TCAS机动

#### CCA 321-4 · atc-scenario-0150-card-main-2593

- 场景：`atc-scenario-0150` · CCA 321 积冰/防冰 乘客医疗 TCAS机动
- 场景呼号：`CCA 321`
- 原文识别到的呼号：`CCA 321`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、乘客医疗、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: CCA 321, when able, say your intention.
> B: Tell the controller that you'd like to divert to Wuhan and you need physician and first aid upon landing.

#### CCA 321-14 · atc-scenario-0150-card-main-2603

- 场景：`atc-scenario-0150` · CCA 321 积冰/防冰 乘客医疗 TCAS机动
- 场景呼号：`CCA 321`
- 原文识别到的呼号：`CCA 321`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、乘客医疗、TCAS机动，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> CCA 321, my apologies for that, follow the standard missed approach procedure, climb to 1,500 meters, contact Wuhan Approach on 119.35.

### atc-scenario-0155 · CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动

#### CSN 3109-8 · atc-scenario-0155-card-main-2678

- 场景：`atc-scenario-0155` · CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞、TCAS机动、风挡问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> suddenly, you have suffered from hail strike, you left wind shield has cracked, report it to Beijing Control and request return to land.

### atc-scenario-0158 · CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题

#### CSN 3235-12 · atc-scenario-0158-card-main-2731

- 场景：`atc-scenario-0158` · CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 3235`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、舱门问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> CSN 3235, line up Runway 08L and cleared for takeoff, caution strong wind shear at the departure end of the runway.

#### CSN 3235-13 · atc-scenario-0158-card-main-2732

- 场景：`atc-scenario-0158` · CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、舱门问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> Just after liftoff, you encountered strong wind shear between the surface and 200m, report it to Beijing Departure.

### atc-scenario-0166 · AFR 101 发动机失效 积冰/防冰 TCAS机动

#### AFR 101-15 · atc-scenario-0166-card-main-2877

- 场景：`atc-scenario-0166` · AFR 101 发动机失效 积冰/防冰 TCAS机动
- 场景呼号：`AFR 101`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 发动机问题、积冰防冰、TCAS机动，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> Suddenly your left engine has failed at 6000 meters, make an urgency call to ATC and request to descend and return to land at Wuhan Airport.

### atc-scenario-0169 · UAL 182 积冰/防冰 TCAS机动

#### UAL 182-6 · atc-scenario-0169-card-main-2921

- 场景：`atc-scenario-0169` · UAL 182 积冰/防冰 TCAS机动
- 场景呼号：`UAL 182`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、TCAS机动，但原文仅明确出现 外来物体吸入。
- 人工结论：待判

**音频原文**

> B: Now you are in London Control area, FL350, you encountered volcanic ash, tell ATC the situation and request descent, call London Control.

#### UAL 182-8 · atc-scenario-0169-card-main-2923

- 场景：`atc-scenario-0169` · UAL 182 积冰/防冰 TCAS机动
- 场景呼号：`UAL 182`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、TCAS机动，但原文仅明确出现 外来物体吸入。
- 人工结论：待判

**音频原文**

> B: Tell ATC you are still in volcanic ash area, both engines are vibrating highly, but aircraft can still be controlled.

### atc-scenario-0172 · UAL 811 颠簸 雷暴绕飞 增压问题

#### UAL 811-1 · atc-scenario-0172-card-main-2966

- 场景：`atc-scenario-0172` · UAL 811 颠簸 雷暴绕飞 增压问题
- 场景呼号：`UAL 811`
- 原文识别到的呼号：`UAL 811`、`AFR 103`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞，但原文仅明确出现 通讯问题。；与 atc-scenario-0040（UAL 811 转述增压问题）/atc-scenario-0040-card-main-678 的原文词集相似度 100%
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 UAL 811 与其他呼号 AFR 103；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> B: Your call sign is UAL 811, from Los Angeles to Wuhan, you have received an Urgency call from AFR 103, AFR 103 had a pressurization problem and the cabin altitude was rising rapidly, relay the message to Zhengzhou Control.

#### UAL 811-2 · atc-scenario-0172-card-main-2967

- 场景：`atc-scenario-0172` · UAL 811 颠簸 雷暴绕飞 增压问题
- 场景呼号：`UAL 811`
- 原文识别到的呼号：`UAL 811`、`AFR 103`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞，但原文仅明确出现 通讯问题。
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 UAL 811 与其他呼号 AFR 103；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: UAL 811, roger PANPAN, break, break, AFR 103, descend to 3000 meters on QNH1021.
> B: You relay the message to AFR 103.

### atc-scenario-0175 · UAL 817 鸟击 积冰/防冰 TCAS机动

#### UAL 817-8 · atc-scenario-0175-card-main-3020

- 场景：`atc-scenario-0175` · UAL 817 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`UAL 817`
- 原文识别到的呼号：`UAL 817`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 燃油问题、备降返航。
- 人工结论：待判

**音频原文**

> C: UAL 817, roger PAN, say your intention.
> B: tell the controller you want to dump fuel and return to land.

#### UAL 817-12 · atc-scenario-0175-card-main-3024

- 场景：`atc-scenario-0175` · UAL 817 鸟击 积冰/防冰 TCAS机动
- 场景呼号：`UAL 817`
- 原文识别到的呼号：`UAL 817`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、TCAS机动，但原文仅明确出现 燃油问题。
- 人工结论：待判

**音频原文**

> C: UAL 817, how long do you need to dump fuel?
> B: tell the controller you need approximately 25 minutes.

### atc-scenario-0177 · QFA 701 起落架问题 雷暴绕飞 TCAS机动

#### QFA 701-13 · atc-scenario-0177-card-main-3058

- 场景：`atc-scenario-0177` · QFA 701 起落架问题 雷暴绕飞 TCAS机动
- 场景呼号：`QFA 701`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞、TCAS机动、起落架问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> B: You executed missed approach because of poor visibility, inform Tower.

#### QFA 701-14 · atc-scenario-0177-card-main-3059

- 场景：`atc-scenario-0177` · QFA 701 起落架问题 雷暴绕飞 TCAS机动
- 场景呼号：`QFA 701`
- 原文识别到的呼号：`QFA 701`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 雷暴绕飞、TCAS机动、起落架问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: QFA 701, roger, follow the standard missed approach procedure.

### atc-scenario-0178 · QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动

#### QFA 160-8 · atc-scenario-0178-card-main-3070

- 场景：`atc-scenario-0178` · QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动
- 场景呼号：`QFA 160`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、燃油问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Now you find you don't have enough fuel to fly to Guangzhou and you decide to divert to Changsha Airport, notify Zhengzhou Control.

#### QFA 160-13 · atc-scenario-0178-card-main-3075

- 场景：`atc-scenario-0178` · QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动
- 场景呼号：`QFA 160`
- 原文识别到的呼号：`QFA 160`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、燃油问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: QFA 160, Wuhan Control, radar contact, I understand you have a navigation problem and fuel shortage, confirm you are diverting to Changsha.
> B: Tell Wuhan Control you are performing the checklist and tell Wuhan Control to stand by.

#### QFA 160-15 · atc-scenario-0178-card-main-3077

- 场景：`atc-scenario-0178` · QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动
- 场景呼号：`QFA 160`
- 原文识别到的呼号：`QFA 160`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 TCAS机动、燃油问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> C: QFA 160, roger, divert to Wuhan approved, descend and maintain 4800 meters, contact Wuhan Approach on 120.45 when reaching.

### atc-scenario-0182 · JAL 220 鸟击 积冰/防冰 乘客医疗

#### JAL 220-1 · atc-scenario-0182-card-main-3131

- 场景：`atc-scenario-0182` · JAL 220 鸟击 积冰/防冰 乘客医疗
- 场景呼号：`JAL 220`
- 原文识别到的呼号：`JAL 220`、`CCA 105`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、积冰防冰、乘客医疗，但原文仅明确出现 通讯问题。；与 atc-scenario-0044（JAL 220 转述接收机失效 吸入外来物体 右发超温）/atc-scenario-0044-card-main-746 的原文词集相似度 100%
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 JAL 220 与其他呼号 CCA 105；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> B: Your call sign is JAL 220, from Shanghai to Hongkong, you have intercepted an Urgency call from CCA 105, CCA 105 was transmitting blind due to receiver failure, he intended to request priority landing at Xiamen, relay the message to Xiamen Approach.

### atc-scenario-0185 · CCA 321 风挡裂纹 雷暴绕飞 积冰/防冰

#### CCA 321-11 · atc-scenario-0185-card-main-3193

- 场景：`atc-scenario-0185` · CCA 321 风挡裂纹 雷暴绕飞 积冰/防冰
- 场景呼号：`CCA 321`
- 原文识别到的呼号：`CCA 321`
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、雷暴绕飞、风挡问题，但原文仅明确出现 乘客医疗。
- 人工结论：待判

**音频原文**

> C: CCA 321, report your current situation and further intention.
> B: Tell Guangzhou Control that the cabin crew offered CPR procedures and first aid to revive the captain, but he has difficulty in breathing, and request priority landing and medical services.

#### CCA 321-13 · atc-scenario-0185-card-main-3195

- 场景：`atc-scenario-0185` · CCA 321 风挡裂纹 雷暴绕飞 积冰/防冰
- 场景呼号：`CCA 321`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、雷暴绕飞、风挡问题，但原文仅明确出现 乘客医疗。；与 atc-scenario-0150（CCA 321 积冰/防冰 乘客医疗 TCAS机动）/atc-scenario-0150-card-main-2595 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are over ZF, maintaining 6000 meters, inform your situation to Wuhan Approach and request priority landing and medical services.

#### CCA 321-16 · atc-scenario-0185-card-main-3198

- 场景：`atc-scenario-0185` · CCA 321 风挡裂纹 雷暴绕飞 积冰/防冰
- 场景呼号：`CCA 321`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 积冰防冰、雷暴绕飞、风挡问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> At minimum altitude, you are unable to see the runway due to low visibility, you decide to divert to Changsha.


## P3 · 低优先级：原文包含其他呼号，需结合转述/交通上下文判断

### atc-scenario-0015 · AFR 113 左发失效 乘客中风

#### AFR 113-4 · atc-scenario-0015-card-main-245

- 场景：`atc-scenario-0015` · AFR 113 左发失效 乘客中风
- 场景呼号：`AFR 113`
- 原文识别到的呼号：`AFR 113`、`CES 737`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 AFR 113 与其他呼号 CES 737；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: AFR 113, behind the CES 737 on short final, line up behind.

### atc-scenario-0040 · UAL 811 转述增压问题

#### UAL 811-1 · atc-scenario-0040-card-main-678

- 场景：`atc-scenario-0040` · UAL 811 转述增压问题
- 场景呼号：`UAL 811`
- 原文识别到的呼号：`UAL 811`、`AFR 103`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 UAL 811 与其他呼号 AFR 103；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> B: Your call sign is UAL 811, from Los Angeles to Wuhan, you have received an Urgency call from AFR 103, AFR 103 had a pressurization problem and the cabin altitude was rising rapidly, relay the message to Zhengzhou Control.

#### UAL 811-2 · atc-scenario-0040-card-main-679

- 场景：`atc-scenario-0040` · UAL 811 转述增压问题
- 场景呼号：`UAL 811`
- 原文识别到的呼号：`UAL 811`、`AFR 103`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 UAL 811 与其他呼号 AFR 103；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: UAL 811, roger PAN PAN, break, break, AFR 103, you are number 1 to land, the medical service will be ready for you.
> B: You relay the message to AFR 103.

### atc-scenario-0044 · JAL 220 转述接收机失效 吸入外来物体 右发超温

#### JAL 220-1 · atc-scenario-0044-card-main-746

- 场景：`atc-scenario-0044` · JAL 220 转述接收机失效 吸入外来物体 右发超温
- 场景呼号：`JAL 220`
- 原文识别到的呼号：`JAL 220`、`CCA 105`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 JAL 220 与其他呼号 CCA 105；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> B: Your call sign is JAL 220, from Shanghai to Hongkong, you have intercepted an Urgency call from CCA 105, CCA 105 was transmitting blind due to receiver failure, he intended to request priority landing at Xiamen, relay the message to Xiamen Approach.

### atc-scenario-0059 · CCA 527 绕飞雷暴

#### CCA 527-5 · atc-scenario-0059-card-main-1016

- 场景：`atc-scenario-0059` · CCA 527 绕飞雷暴
- 场景呼号：`CCA 527`
- 原文识别到的呼号：`CCA 527`、`CSN 737`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 CCA 527 与其他呼号 CSN 737；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: CCA 527, follow CSN 737 on A7, you are number 2 for departure.

### atc-scenario-0098 · CES 5118 加餐水 前机堵滑行道

#### CES 5118-22 · atc-scenario-0098-card-main-1708

- 场景：`atc-scenario-0098` · CES 5118 加餐水 前机堵滑行道
- 场景呼号：`CES 5118`
- 原文识别到的呼号：`CES 5118`、`CSN 328`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 CES 5118 与其他呼号 CSN 328；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: CES 5118, roger, break! break! CSN 328, taxi forward to be clear of E1.
> B: The aircraft moved, you are able to continue taxi and line up.

### atc-scenario-0108 · AFR 113 发动机失效 乘客医疗 TCAS机动

#### AFR 113-4 · atc-scenario-0108-card-main-1855

- 场景：`atc-scenario-0108` · AFR 113 发动机失效 乘客医疗 TCAS机动
- 场景呼号：`AFR 113`
- 原文识别到的呼号：`AFR 113`、`CES 737`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 AFR 113 与其他呼号 CES 737；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: AFR 113, behind the CES 737 on short final, line up behind.

### atc-scenario-0137 · CES 5118 雷暴绕飞 TCAS机动 舱门问题

#### CES 5118-23 · atc-scenario-0137-card-main-2382

- 场景：`atc-scenario-0137` · CES 5118 雷暴绕飞 TCAS机动 舱门问题
- 场景呼号：`CES 5118`
- 原文识别到的呼号：`CES 5118`、`CSN 328`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 CES 5118 与其他呼号 CSN 328；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: CES 5118, roger, break! break! CSN 328, taxi forward to be clear of E1.
> B: The aircraft moved, you are able to continue taxi and line up.

### atc-scenario-0147 · CCA 527 鸟击 雷暴绕飞 TCAS机动

#### CCA 527-5 · atc-scenario-0147-card-main-2537

- 场景：`atc-scenario-0147` · CCA 527 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`CCA 527`
- 原文识别到的呼号：`CCA 527`、`CSN 737`
- `CONTEXTUAL_FOREIGN_CALLSIGN`：原文同时出现本场景呼号 CCA 527 与其他呼号 CSN 737；可能是转述或交通信息，保留人工判断。
- 人工结论：待判

**音频原文**

> C: CCA 527, follow CSN 737 on A7, you are number 2 for departure.
