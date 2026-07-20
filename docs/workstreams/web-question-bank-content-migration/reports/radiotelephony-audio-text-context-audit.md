# 陆空通话音频原文与场景语境审查

> 本报告是人工复核清单，不会自动修正题库，也不代表候选已被判定为错误。

## 审查边界

- 覆盖正式共享源 `content/question-banks/banks/radiotelephony` 的全部场景和卡片。
- 仅使用 `audioText`，并以航司分类、场景名和任务标题确定语境；不读取或展示参考答案、中文原文和音频文件内容。
- 对 `src/features/question-bank/data/question-bank.json` 仅比较上述审查输入的派生快照，确认学习页所用数据未漂移。

## 输入与覆盖

- 场景：186；卡片：3218；航司分类：11。
- 正式源审查输入 SHA-256：`11c1bd462e0da215f1ec08dc521c6aefc48daa3843ad543ff4f3555b092c2e9f`
- 内嵌题库审查输入 SHA-256：`11c1bd462e0da215f1ec08dc521c6aefc48daa3843ad543ff4f3555b092c2e9f`
- 候选卡：470（P0 2、P1 287、P2 172、P3 9）。

## 分级说明

- P0：场景呼号未出现，原文主呼号属于另一航司。
- P1：场景呼号未出现，原文为同航司的不同号码。
- P2：原文明确的事件与场景主题无交集；如存在，会附跨场景相似原文证据。
- P3：本场景呼号存在，但原文还提及其他航班；可能合理，保留高召回审查。

## P0 · 高优先级：主呼号跨航司错配

### atc-scenario-0044 · JAL 220 转述接收机失效 吸入外来物体 右发超温

#### JAL 220-2 · atc-scenario-0044-card-main-747

- 场景：`atc-scenario-0044` · JAL 220 转述接收机失效 吸入外来物体 右发超温
- 场景呼号：`JAL 220`
- 原文识别到的呼号：`CCA 105`
- `PRIMARY_CALLSIGN_CROSS_AIRLINE`：场景主呼号 JAL 220 未出现在原文；原文出现 CCA 105。
- 人工结论：待判

**音频原文**

> C: CCA 105, Xiamen Approach, report your current position and altitude.
> B: Tell Xiamen Approach that CCA 105's current position is 10 miles northwest of FQG, altitude is 9800 meters.

### atc-scenario-0182 · JAL 220 鸟击 积冰/防冰 乘客医疗

#### JAL 220-2 · atc-scenario-0182-card-main-3132

- 场景：`atc-scenario-0182` · JAL 220 鸟击 积冰/防冰 乘客医疗
- 场景呼号：`JAL 220`
- 原文识别到的呼号：`CCA 105`
- `PRIMARY_CALLSIGN_CROSS_AIRLINE`：场景主呼号 JAL 220 未出现在原文；原文出现 CCA 105。
- 人工结论：待判

**音频原文**

> C: CCA 105, Xiamen Approach, report your current position and altitude.
> B: tell Xiamen approach that CCA 105's current position is 10 miles NWA of FQG, altitude is 9800m.


## P1 · 高优先级：主呼号同航司号码错位

### atc-scenario-0014 · SIA 1334 通讯失效 地面延误

#### SIA 1334-1 · atc-scenario-0014-card-main-232

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> B: Your call sign is SIA 334 from Chengdu to Beijing, you are at stand 34, information I received, request ATC clearance.

#### SIA 1334-2 · atc-scenario-0014-card-main-233

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334, stand by, I am going to check your flight plan.

#### SIA 1334-3 · atc-scenario-0014-card-main-234

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334, Delivery, cleared to Beijing as filed, fight level #%$@*^#....
> B: The ATC clearance has been disturbed, inform ATC and request repeat the clearance.

#### SIA 1334-4 · atc-scenario-0014-card-main-235

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334 is cleared to Beijing as filed, 10700 meters, D06 departure, Runway 12, runway heading until passing 3000 meters before turning right, squawk 4562.

#### SIA 1334-5 · atc-scenario-0014-card-main-236

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334, readback correct, when ready for push back and start up, contact Ground 118.9.

#### SIA 1334-7 · atc-scenario-0014-card-main-238

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334, roger, call me back when ready.

#### SIA 1334-8 · atc-scenario-0014-card-main-239

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 通讯问题，但原文仅明确出现 舱门问题。
- 人工结论：待判

**音频原文**

> C: SIA 334, are you fully ready now? Your slot is 0310.
> B: You need to open the cabin door for the release documents, advise Ground you will need another 5 minutes.

#### SIA 1334-10 · atc-scenario-0014-card-main-241

- 场景：`atc-scenario-0014` · SIA 1334 通讯失效 地面延误
- 场景呼号：`SIA 1334`
- 原文识别到的呼号：`SIA 334`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 SIA 1334 未出现在原文；原文出现 SIA 334。
- 人工结论：待判

**音频原文**

> C: SIA 334, push back and startup approved until abeam gate 33, do not block gate 35, there is incoming traffic to the gate.

### atc-scenario-0024 · AFR 9939 中断起飞 刹车超温

#### AFR 9939-1 · atc-scenario-0024-card-main-411

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> B: Your call sign is AFR 939, a flight from Wuhan to Beijing, you are parking at gate 07, you have received information H, request ATC clearance from Wuhan Delivery.

#### AFR 9939-2 · atc-scenario-0024-card-main-412

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, cleared to Beijing via flight planned route, departure Runway 18, ZF-02 departure, initial climb 2700 meters, request level change en route, departure frequency 127.35, squawk 2615.

#### AFR 9939-4 · atc-scenario-0024-card-main-414

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, push back and start up approved, facing east.
> B: Tell the controller you have difficulty in starting the engines with strong tailwind, you want to change the push back position in face west.

#### AFR 9939-6 · atc-scenario-0024-card-main-416

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, taxi to holding point Runway 18 via taxiway Z4, A and A1.

#### AFR 9939-7 · atc-scenario-0024-card-main-417

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, hold at present position, give way to Airbus 320 vacating via E5.

#### AFR 9939-8 · atc-scenario-0024-card-main-418

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, traffic is clear, continue taxi via A and A1 to holding point Runway 18.

#### AFR 9939-9 · atc-scenario-0024-card-main-419

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, contact Wuhan Tower on 124.35.

#### AFR 9939-11 · atc-scenario-0024-card-main-421

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, line up Runway 18.

#### AFR 9939-12 · atc-scenario-0024-card-main-422

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, cleared for takeoff Runway 18, surface wind calm.

#### AFR 9939-14 · atc-scenario-0024-card-main-424

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, what is the situation like now?
> B: Tell the controller your brakes have exceeded the temperature limit, and request taxi back to apron to have the plane checked.

#### AFR 9939-15 · atc-scenario-0024-card-main-425

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, expedite vacate via E1.

#### AFR 9939-16 · atc-scenario-0024-card-main-426

- 场景：`atc-scenario-0024` · AFR 9939 中断起飞 刹车超温
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, do you need any assistance?
> B: Tell the controller you need stair vehicle to disembark the passengers.

### atc-scenario-0031 · BAW 2352 询问两地天气 复飞

#### BAW 2352-1 · atc-scenario-0031-card-main-529

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> B: Your call sign is BAW 352, you are maintaining 11000 meters, over XIA, squawking 3567, make an initial contact with Wuhan Control.

#### BAW 2352-2 · atc-scenario-0031-card-main-530

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, Wuhan Control, radar contact, descend and maintain 10400 meters.

#### BAW 2352-3 · atc-scenario-0031-card-main-531

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, Wuhan Control, descend to 9200 meters, reduced speed to 270 knots until advised.

#### BAW 2352-5 · atc-scenario-0031-card-main-533

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 2352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2138 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: BAW 352, cleared offset 25 miles left of track for 30 minutes, report clear of CB.

#### BAW 2352-8 · atc-scenario-0031-card-main-536

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 备降返航。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2211 的原文词集相似度 91%
- 人工结论：待判

**音频原文**

> C: BAW 352, Hefei Airport is available, confirm you are diverting to Hefei?
> B: Tell the controller you are not diverting to Hefei at the moment, and you still want to fly to Wuhan.

#### BAW 2352-9 · atc-scenario-0031-card-main-537

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, roger, track direct to ZF, follow ZF-2A arrival, expect ILS approach Runway 36R.

#### BAW 2352-10 · atc-scenario-0031-card-main-538

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, descend and maintain 4200 meters, reduce speed to minimum clean speed.

#### BAW 2352-11 · atc-scenario-0031-card-main-539

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, contact Wuhan Tower 119.6.

#### BAW 2352-13 · atc-scenario-0031-card-main-541

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, roger, surface wind calm, RVR touchdown 550 meters, midpoint 600 meters, rollout 500 meters, continue approach Runway 36R.

#### BAW 2352-15 · atc-scenario-0031-card-main-543

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, cloud broken 700 meters, cleared to land Runway 36R.

#### BAW 2352-17 · atc-scenario-0031-card-main-545

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, roger, follow the standard missed approach procedure, advise intentions when able.

#### BAW 2352-19 · atc-scenario-0031-card-main-547

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> C: BAW 352, roger, turn right, direct to LKO, climb to and maintain 2400 meters.

### atc-scenario-0068 · CCA 1301 刹车超温 一个前轮没气

#### CCA 1301-1 · atc-scenario-0068-card-main-1161

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> B: Your call sign is CCA 301, a flight from Beijing to Guangzhou, you are parking at gate 215, you are ready for push back and start up, contact Beijing Ground.

#### CCA 1301-2 · atc-scenario-0068-card-main-1162

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, Beijing Ground, push back and start up approved, facing west.

#### CCA 1301-4 · atc-scenario-0068-card-main-1164

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, Beijing Ground, taxi via taxiway Y4 and G2, hold short of H.

#### CCA 1301-6 · atc-scenario-0068-card-main-1166

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: Roger, thank you, CCA 301, continue taxi.
> B: Tell the controller that you are unable to taxi because you find the taxiway surface is contaminated with leaking fluid.

#### CCA 1301-7 · atc-scenario-0068-card-main-1167

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, roger, turn left, taxi via Y1, then turn left, taxi via Y2.

#### CCA 1301-9 · atc-scenario-0068-card-main-1169

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, line up and be ready for immediate departure.

#### CCA 1301-10 · atc-scenario-0068-card-main-1170

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, Runway 36R, cleared for immediate takeoff, surface wind 340 degrees, 2 meters per second.

#### CCA 1301-11 · atc-scenario-0068-card-main-1171

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, stop immediately! I say again! stop immediately!
> B: Tell the controller you use the maximum brakes and you are stopping on the runway.

#### CCA 1301-12 · atc-scenario-0068-card-main-1172

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, vacate runway via E2.

#### CCA 1301-14 · atc-scenario-0068-card-main-1174

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 起落架问题、刹车问题，但原文仅明确出现 复飞。
- 人工结论：待判

**音频原文**

> C: CCA 301, the landing aircraft on the short final just made the go around.

#### CCA 1301-16 · atc-scenario-0068-card-main-1176

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, what assistance do you need?
> B: Tell the controller you need ground services to cool the wheels.

#### CCA 1301-17 · atc-scenario-0068-card-main-1177

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, what else do you need?
> B: Tell the controller 1 of your nose wheel tires was deflated, you have to hold at present position for maintenance inspection.

#### CCA 1301-19 · atc-scenario-0068-card-main-1179

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, what assistance do you require?
> B: Tell the controller you need a tug to tow you back to the maintenance apron.

#### CCA 1301-20 · atc-scenario-0068-card-main-1180

- 场景：`atc-scenario-0068` · CCA 1301 刹车超温 一个前轮没气
- 场景呼号：`CCA 1301`
- 原文识别到的呼号：`CCA 301`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1301 未出现在原文；原文出现 CCA 301。
- 人工结论：待判

**音频原文**

> C: CCA 301, hold position, the tug will come soon.

### atc-scenario-0069 · CCA 1432 避开强下沉气流

#### CCA 1432-1 · atc-scenario-0069-card-main-1181

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> B: Your call sign is CCA 432, you are performing a flight from Guangzhou to Beijing, you are maintaining 5400 meters, over IKUBA, squawking 5655, make initial contact with Beijing Approach.

#### CCA 1432-2 · atc-scenario-0069-card-main-1182

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, Beijing Approach, radar contact, climb to and maintain 6600 meters, contact Beijing Control on 118.2.

#### CCA 1432-4 · atc-scenario-0069-card-main-1184

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, negative due traffic, maintain 6600 meters.

#### CCA 1432-5 · atc-scenario-0069-card-main-1185

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, climb to and maintain 8900 meters, turn left heading 210, fly direct to OBLIK.

#### CCA 1432-7 · atc-scenario-0069-card-main-1187

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, negative due military activity, continue present heading for 20 miles.

#### CCA 1432-9 · atc-scenario-0069-card-main-1189

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, turn left heading 240 to rejoin Amber 461, climb and maintain 10100 meters.

#### CCA 1432-10 · atc-scenario-0069-card-main-1190

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, maintain 10100 meters, offset 10 miles left to avoid the reported strong downdraft.

#### CCA 1432-12 · atc-scenario-0069-card-main-1192

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, hold at PEK VOR as published, when clear of weather, contact Beijing Approach on 119.25.

#### CCA 1432-14 · atc-scenario-0069-card-main-1194

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, Beijing Approach, radar contact, descend to and maintain 2400 meters, RENOB-2B arrival, expect ILS approach Runway 01.

#### CCA 1432-15 · atc-scenario-0069-card-main-1195

- 场景：`atc-scenario-0069` · CCA 1432 避开强下沉气流
- 场景呼号：`CCA 1432`
- 原文识别到的呼号：`CCA 432`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1432 未出现在原文；原文出现 CCA 432。
- 人工结论：待判

**音频原文**

> C: CCA 432, turn right heading 330, descend to 900 meters, cleared ILS approach Runway 01, report established.

### atc-scenario-0070 · CCA 1368(印度口音)跑线 复飞

#### CCA 1368-1 · atc-scenario-0070-card-main-1196

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0151（CCA 1368 雷暴绕飞 TCAS机动 复飞）/atc-scenario-0151-card-main-2607 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your call sign is CCA 368, a flight from Shenzhen to Beijing, your weather radar indicates a squall line near VYK, contact Beijing Approach and request parallel offset 10 miles right of track until PEK VOR.

#### CCA 1368-2 · atc-scenario-0070-card-main-1197

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, Beijing Approach, radar contact, negative due prohibited area, turn left heading 230, track out 25 miles.

#### CCA 1368-3 · atc-scenario-0070-card-main-1198

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, when clear of weather, fly direct to AA443.

#### CCA 1368-4 · atc-scenario-0070-card-main-1199

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, turn right, direct to AA442, hold at AA442 as published.

#### CCA 1368-5 · atc-scenario-0070-card-main-1200

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, orbit right from present position until advised, Runway 18L is not available now.

#### CCA 1368-7 · atc-scenario-0070-card-main-1202

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, after this orbit, leave the hold, fly heading 360, direct to LADIX.

#### CCA 1368-9 · atc-scenario-0070-card-main-1204

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, Beijing Approach, follow PEK-05 arrival, descend to 2100 meters on QNH 1008, expect ILS approach Runway 01.

#### CCA 1368-10 · atc-scenario-0070-card-main-1205

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, descend and maintain 1500 meters, cleared for ILS approach Runway 01, report established.

#### CCA 1368-12 · atc-scenario-0070-card-main-1207

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, Runway 01, cleared to land.

#### CCA 1368-14 · atc-scenario-0070-card-main-1209

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, climb straight ahead until 230 meters, turn right direct to PEK, hold at PEK at 600 meters.

#### CCA 1368-16 · atc-scenario-0070-card-main-1211

- 场景：`atc-scenario-0070` · CCA 1368(印度口音)跑线 复飞
- 场景呼号：`CCA 1368`
- 原文识别到的呼号：`CCA 368`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CCA 1368 未出现在原文；原文出现 CCA 368。
- 人工结论：待判

**音频原文**

> C: CCA 368, roger, thanks, vacate Runway 01 via rapid exit E2.

### atc-scenario-0077 · CSN 3102 因延误重新加油

#### CSN 3102-1 · atc-scenario-0077-card-main-1318

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 102, a flight from Wuhan to Guangzhou, you are at gate 213, you have got information K, request ATC clearance.

#### CSN 3102-2 · atc-scenario-0077-card-main-1319

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, cleared to Guangzhou via flight planned route, runway in use 36R, LKO-02 departure, initial altitude 1200 meters, cruising level 10400 meters, departure frequency 119.75, squawk 2736.

#### CSN 3102-4 · atc-scenario-0077-card-main-1321

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, push back and start up approved, facing north.

#### CSN 3102-6 · atc-scenario-0077-card-main-1323

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, start 1 engine at the gate approved, report when ready for taxi.

#### CSN 3102-8 · atc-scenario-0077-card-main-1325

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, taxi to holding point Runway 36R via taxiway Z4, A3 and A.

#### CSN 3102-9 · atc-scenario-0077-card-main-1326

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, hold position, give way to Boeing 747 passing from left to right.

#### CSN 3102-10 · atc-scenario-0077-card-main-1327

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, traffic passed and clear, continue taxi.

#### CSN 3102-11 · atc-scenario-0077-card-main-1328

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, contact Wuhan Tower 124.35.

#### CSN 3102-13 · atc-scenario-0077-card-main-1330

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 102, hold short of Runway 36R, expect 15 minutes delay due thunderstorm approaching the upwind of Runway 36R.

#### CSN 3102-15 · atc-scenario-0077-card-main-1332

- 场景：`atc-scenario-0077` · CSN 3102 因延误重新加油
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, enter Runway 36R, vacate runway via A2, then T5 to gate 211.

### atc-scenario-0078 · CSN 3109 冰雹风挡裂 自动降落许可

#### CSN 3109-1 · atc-scenario-0078-card-main-1333

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 109, you are approaching VYK, maintaining 4500 meters, squawking 3125, make initial contact with Beijing Control.

#### CSN 3109-2 · atc-scenario-0078-card-main-1334

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, Beijing Control, radar contact, direct to VYK, after passing VYK, climb to 8400 meters.

#### CSN 3109-4 · atc-scenario-0078-card-main-1336

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, negative due military activity, turn left heading 010.

#### CSN 3109-5 · atc-scenario-0078-card-main-1337

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, turn left heading 350.

#### CSN 3109-7 · atc-scenario-0078-card-main-1339

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, left turn is not permitted due restricted area.

#### CSN 3109-9 · atc-scenario-0078-card-main-1341

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, roger, turn right heading 340, direct to VYK, descend to and maintain 5100 meters.

#### CSN 3109-10 · atc-scenario-0078-card-main-1342

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, descend to 4200 meters, contact Beijing Approach 119.25.

#### CSN 3109-12 · atc-scenario-0078-card-main-1344

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, Beijing Approach, radar contact, follow VYK-05 arrival, expect radar vectors for ILS approach Runway 36R.

#### CSN 3109-14 · atc-scenario-0078-card-main-1346

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, Runway 36R, cleared to land, surface wind 350, 3 meters per second.

#### CSN 3109-16 · atc-scenario-0078-card-main-1348

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：`CSN 109`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3109 未出现在原文；原文出现 CSN 109。
- 人工结论：待判

**音频原文**

> C: CSN 109, hold position, the tug will come soon.

### atc-scenario-0079 · CSN 1310 减跑道 地面延误加油

#### CSN 1310-1 · atc-scenario-0079-card-main-1349

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 310, performing a flight from Beijing to Guangzhou, you are parking at gate 221, you have received information B, contact Beijing Delivery and request ATC clearance.

#### CSN 1310-2 · atc-scenario-0079-card-main-1350

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, Beijing Delivery, cleared to Guangzhou via flight planned route, BOBAK-03 departure, departure Runway 36R, initial climb 1800 meters, cruising level 9500 meters, squawk 2536.

#### CSN 1310-3 · atc-scenario-0079-card-main-1351

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, expect slot time 0215 due to temporary departure restrictions, report when ready for push back and start up.

#### CSN 1310-4 · atc-scenario-0079-card-main-1352

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, slot time restriction has canceled, monitored Beijing Ground 121.975.

#### CSN 1310-6 · atc-scenario-0079-card-main-1354

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, Beijing Ground, push back approved, facing east.

#### CSN 1310-8 · atc-scenario-0079-card-main-1356

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, your slot time has expired, your new slot time is 0325, start up at own discretion.

#### CSN 1310-10 · atc-scenario-0079-card-main-1358

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, taxi to holding point Runway 36R via taxiway Z4, Z3, T5, D6.

#### CSN 1310-11 · atc-scenario-0079-card-main-1359

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, hold short of T5, give way to Boeing 747 passing from left to right.

#### CSN 1310-13 · atc-scenario-0079-card-main-1361

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, negative intersection departure due sequencing, continue taxi to holding point Runway 36R via taxiway T5 and D6.

#### CSN 1310-15 · atc-scenario-0079-card-main-1363

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0157（CSN 1310 雷暴绕飞 TCAS机动 延误/加油）/atc-scenario-0157-card-main-2717 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 310, hold short of Runway 36R, expect 15 minutes delay due thunderstorms in the vicinity of the airport.

#### CSN 1310-16 · atc-scenario-0079-card-main-1364

- 场景：`atc-scenario-0079` · CSN 1310 减跑道 地面延误加油
- 场景呼号：`CSN 1310`
- 原文识别到的呼号：`CSN 310`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 1310 未出现在原文；原文出现 CSN 310。
- 人工结论：待判

**音频原文**

> C: CSN 310, Runway 36R, line up and cleared for takeoff, surface wind 350 degrees, 3 meters per second.

### atc-scenario-0080 · CSN 6202 前缘襟翼结冰

#### CSN 6202-1 · atc-scenario-0080-card-main-1366

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 202, destination Harbin. You just departed from Beijing airport at 23. You are passing 1200 meters and want to climb to 1800 meters, contact Beijing Departure.

#### CSN 6202-2 · atc-scenario-0080-card-main-1367

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, Beijing Departure, radar contact, due to slower preceding traffic, cancel SID, turn right heading 010.

#### CSN 6202-3 · atc-scenario-0080-card-main-1368

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, climb to 5400 meters on standard, resume own navigation, direct to YV, via flight planned route.

#### CSN 6202-5 · atc-scenario-0080-card-main-1370

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, contact Beijing Control 125.9 for request.

#### CSN 6202-7 · atc-scenario-0080-card-main-1372

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 202, climb to and maintain 10700 meters due Air Force restriction, suggest heading 020.
> B: Because the CB is 2 large, you want heading 030.

#### CSN 6202-8 · atc-scenario-0080-card-main-1373

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, turn right heading 030 approved.

#### CSN 6202-10 · atc-scenario-0080-card-main-1375

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 积冰防冰。
- 人工结论：待判

**音频原文**

> C: CSN 202, Beijing roger.
> B: Tell the controller that you are getting an ice build-up as a result of suspected de-icing equipment failure, request descent below freezing level.

#### CSN 6202-11 · atc-scenario-0080-card-main-1376

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, roger, descend to 6300 meters, report when require lower, do emergency conditions exist?
> B: Tell the controller this level should be sufficient and emergency conditions do not exist.

#### CSN 6202-13 · atc-scenario-0080-card-main-1378

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, roger, confirm approach and landing normal?
> B: Say no problem.

#### CSN 6202-14 · atc-scenario-0080-card-main-1379

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, turn right direct to GITUM, descend to and maintain 3600 meters.

#### CSN 6202-15 · atc-scenario-0080-card-main-1380

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, contact Approach 120.6.

#### CSN 6202-17 · atc-scenario-0080-card-main-1382

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, Beijing Approach, roger, do you require any other assistance?
> B: Tell Approach you have a micro-switch malfunction and will conduct a flapless landing and request Runway 36R.

#### CSN 6202-18 · atc-scenario-0080-card-main-1383

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, roger, change of Runway 36R, turn left heading 090, descend to and maintain 2700 meters on QNH 1013, information C.

#### CSN 6202-19 · atc-scenario-0080-card-main-1384

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, turn right heading 270, descend to 1800 meters.

#### CSN 6202-20 · atc-scenario-0080-card-main-1385

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, the field is 11 miles away, report visual contact.
> B: Tell the Approach, you have the runway in sight.

#### CSN 6202-21 · atc-scenario-0080-card-main-1386

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：`CSN 202`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6202 未出现在原文；原文出现 CSN 202。
- 人工结论：待判

**音频原文**

> C: CSN 202, make visual approach 36 right, turn final when ready.

### atc-scenario-0081 · CSN 7353 危险品卸载 浓雾

#### CSN 7353-1 · atc-scenario-0081-card-main-1387

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 353, a flight from Wuhan to Los Angeles, the cargo manifest shows that there is dangerous goods on board, report it to company operations and request offload the luggage.

#### CSN 7353-3 · atc-scenario-0081-card-main-1389

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, cleared to Los Angeles via flight planned route, Runway 36R, LKO-01D departure, initial climb 1200 meters, cruising level 8900 meters, departure frequency 119.7, squawk 2515.

#### CSN 7353-4 · atc-scenario-0081-card-main-1390

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, expect 15 minutes delay, the airport is temporarily closed due heavy fog, call you back.

#### CSN 7353-6 · atc-scenario-0081-card-main-1392

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, after traffic taxiing behind is clear, push back and start up approved, pushed back onto taxiway Z4, abeam gate 232, facing east.

#### CSN 7353-8 · atc-scenario-0081-card-main-1394

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, taxi via taxiway Z4, A3 and A to holding point Runway 36R.

#### CSN 7353-10 · atc-scenario-0081-card-main-1396

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, the visibility is improving, continue taxi to holding point Runway 36R via taxiway A3 and A.

#### CSN 7353-11 · atc-scenario-0081-card-main-1397

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, contact Wuhan Tower 124.35.

#### CSN 7353-13 · atc-scenario-0081-card-main-1399

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, Runway 36R, cleared for takeoff, when airborne, contact 119.7.

#### CSN 7353-15 · atc-scenario-0081-card-main-1401

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, Wuhan Departure, radar contact, climb to 3900 meters at 3000 feet per minute or greater.

#### CSN 7353-16 · atc-scenario-0081-card-main-1402

- 场景：`atc-scenario-0081` · CSN 7353 危险品卸载 浓雾
- 场景呼号：`CSN 7353`
- 原文识别到的呼号：`CSN 353`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 7353 未出现在原文；原文出现 CSN 353。
- 人工结论：待判

**音频原文**

> C: CSN 353, continue climb to 8900 meters, report passing 6000 meters.

### atc-scenario-0082 · CSN 3112 跑线 宣布燃油紧急

#### CSN 3112-1 · atc-scenario-0082-card-main-1403

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2735 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 112, a flight from Beijing to Guangzhou, the preceding aircraft reported a squall line 100 miles ahead on the weather radar, contact Beijing Control and request turn right to circumnavigate the weather.

#### CSN 3112-2 · atc-scenario-0082-card-main-1404

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2736 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 112, Beijing Control, negative due prohibited area, turn left 30 degrees, track out 35 kilometers, report clear of CB.

#### CSN 3112-4 · atc-scenario-0082-card-main-1406

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, the preceding aircraft reported severe turbulence of 10400 meters, 11000 meters is available, what's your intention?
> B: Acknowledge the transmission and tell the controller you'd like to climb to 11000 meters.

#### CSN 3112-5 · atc-scenario-0082-card-main-1407

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, climb to and maintain 11000 meters.

#### CSN 3112-6 · atc-scenario-0082-card-main-1408

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, after passing MUDAM, fly direct to ASAVA.

#### CSN 3112-7 · atc-scenario-0082-card-main-1409

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, orbit right from present position until advised to weather ahead.

#### CSN 3112-9 · atc-scenario-0082-card-main-1411

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 7112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 7112。
- 人工结论：待判

**音频原文**

> C: CSN 7112, roger, say your intention.
> B: Tell the controller you require radar vector to Beijing for priority landing.

#### CSN 3112-10 · atc-scenario-0082-card-main-1412

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, roger, turn left heading 190, fly direct to GUVBA.

#### CSN 3112-11 · atc-scenario-0082-card-main-1413

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, turn left heading 150, direct to AA446, hold at AA446 as published due weather.

#### CSN 3112-13 · atc-scenario-0082-card-main-1415

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, roger, leave the hold, proceed to LADIX, descent to 6000 meters, contact Beijing Approach on 119.35, we have informed them about your situation.

#### CSN 3112-15 · atc-scenario-0082-card-main-1417

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 7112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 7112。
- 人工结论：待判

**音频原文**

> C: CSN 7112, Beijing Approach, radar contact, descent to 4200 meters, expect radar vector ILS approach Runway 36R.

#### CSN 3112-16 · atc-scenario-0082-card-main-1418

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 7112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 7112。
- 人工结论：待判

**音频原文**

> C: CSN 7112, are you declaring fuel emergency?
> B: Tell the controller that you are declaring fuel emergency and request priority landing Runway 36R.

#### CSN 3112-17 · atc-scenario-0082-card-main-1419

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, roger, you are number 1 to land, cleared straight in ILS approach Runway 36R, report established.

#### CSN 3112-19 · atc-scenario-0082-card-main-1421

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：`CSN 112`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3112 未出现在原文；原文出现 CSN 112。
- 人工结论：待判

**音频原文**

> C: CSN 112, Beijing Tower, Runway 36R, clear to land.

### atc-scenario-0083 · CSN 3102 轮挡 左发防冰失效

#### CSN 3102-1 · atc-scenario-0083-card-main-1422

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 102, a flight from Beijing to Guangzhou, you are at gate 211, you are ready for push back and start up, contact Beijing Apron.

#### CSN 3102-2 · atc-scenario-0083-card-main-1423

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, push back and start up approved, Runway 19R, QNH 1014.

#### CSN 3102-5 · atc-scenario-0083-card-main-1426

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, taxi to holding point Runway 19R via taxiway Z18, M5, hold short of F.

#### CSN 3102-7 · atc-scenario-0083-card-main-1428

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, hold short of F, contact Beijing Ground on 121.95.

#### CSN 3102-9 · atc-scenario-0083-card-main-1430

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, de-ice on taxiway Z4.
> B: Tell Beijing Ground the de-icing fluid is only effective for 30 minutes and your slot time is 35.

#### CSN 3102-10 · atc-scenario-0083-card-main-1431

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, taxi via taxiway Z4 and F to holding point Runway 19R.

#### CSN 3102-12 · atc-scenario-0083-card-main-1433

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, Beijing Departure, radar contact, climb to 1800 meters on QNH 1014.

#### CSN 3102-14 · atc-scenario-0083-card-main-1435

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, negative due traffic, maintain 1800 meters until advised.

#### CSN 3102-16 · atc-scenario-0083-card-main-1437

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, roger PAN PAN, climb to and maintain 3000 meters.

#### CSN 3102-18 · atc-scenario-0083-card-main-1439

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, descend to 900 meters on QNH 1014.
> B: You confirm with Beijing Departure if you should descend to 900 meters because it is below the minimum safe altitude.

#### CSN 3102-19 · atc-scenario-0083-card-main-1440

- 场景：`atc-scenario-0083` · CSN 3102 轮挡 左发防冰失效
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, my apologies, cancel speed restrictions, recleared to descend to 1500 meters on QNH 1014.

### atc-scenario-0084 · CSN 3001 老太太受伤 2座乘客重伤

#### CSN 3001-1 · atc-scenario-0084-card-main-1441

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 001, a flight from Guangzhou to Beijing, you are cruising at 9200 meters, squawking 3625.

#### CSN 3001-2 · atc-scenario-0084-card-main-1442

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, Guangzhou Control, radar contact, maintain present level.

#### CSN 3001-3 · atc-scenario-0084-card-main-1443

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, there was a severe ride report by previous pilot at 10700 meters, what's your intention?
> B: Tell the controller that you'd like to climb to 11300 meters.

#### CSN 3001-4 · atc-scenario-0084-card-main-1444

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, roger, climb to and maintain 11300 meters.

#### CSN 3001-6 · atc-scenario-0084-card-main-1446

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, roger, descend to maintain 8400 meters, expedite descent until passing 10100 due crossing traffic.

#### CSN 3001-7 · atc-scenario-0084-card-main-1447

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, when able, say you are further intention.
> B: Tell Guangzhou Control that 2 passengers in Seat 35L and 35H were seriously injured, and you'd like to divert to Wuhan Airport.

#### CSN 3001-8 · atc-scenario-0084-card-main-1448

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, roger, contact Wuhan Control on 118.9, we have informed them of your situation.

#### CSN 3001-10 · atc-scenario-0084-card-main-1450

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, Wuhan Control, radar contact, continue descent to 6300 meters, turn right, direct to ZF.

#### CSN 3001-11 · atc-scenario-0084-card-main-1451

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 7001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 7001。
- 人工结论：待判

**音频原文**

> C: CSN 7001, descend and maintain 4500 meters, contact Wuhan Approach on 119.25.

#### CSN 3001-13 · atc-scenario-0084-card-main-1453

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, Wuhan Approach, roger, do you require any emergency services?
> B: Tell Wuhan Approach you need ambulance and first aid upon arrival.

#### CSN 3001-14 · atc-scenario-0084-card-main-1454

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, we will relay your message to the related parties, you are number 1, now turn left heading 120, descend and maintain 1500 meters, cleared for ILS approach Runway 36R.

#### CSN 3001-15 · atc-scenario-0084-card-main-1455

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, Runway 36R, cleared to land, the ambulance will be ready near the runway.

#### CSN 3001-17 · atc-scenario-0084-card-main-1457

- 场景：`atc-scenario-0084` · CSN 3001 老太太受伤 2座乘客重伤
- 场景呼号：`CSN 3001`
- 原文识别到的呼号：`CSN 001`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3001 未出现在原文；原文出现 CSN 001。
- 人工结论：待判

**音频原文**

> C: CSN 001, when vacated, follow the follow-me car to gate 213.

### atc-scenario-0085 · CSN 3102 乘客被热咖啡烫伤

#### CSN 3102-1 · atc-scenario-0085-card-main-1458

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 102, a flight from Guangzhou to Beijing, you are at gate 223, contact Guangzhou Ground and request push back and start up.

#### CSN 3102-2 · atc-scenario-0085-card-main-1459

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, push back and start up approved, facing west.

#### CSN 3102-3 · atc-scenario-0085-card-main-1460

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, stand by, expect 30 minutes delay, lightning and thunder were reported in the vicinity of the airport.

#### CSN 3102-5 · atc-scenario-0085-card-main-1462

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, taxi via J1, Z to holding point Runway 19.

#### CSN 3102-8 · atc-scenario-0085-card-main-1465

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, line up and wait Runway 19, expect 30 minutes delay.

#### CSN 3102-10 · atc-scenario-0085-card-main-1467

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 7102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 7102。
- 人工结论：待判

**音频原文**

> C: CSN 7102, when airborne, turn right heading 120, climb to 900 meters, cleared for takeoff Runway 19, contact Departure on 121.95.

#### CSN 3102-12 · atc-scenario-0085-card-main-1469

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, Guangzhou Departure, radar contact, turn right heading 300, climb to 900 meters.

#### CSN 3102-13 · atc-scenario-0085-card-main-1470

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, climb to 3000 meters on standard.

#### CSN 3102-15 · atc-scenario-0085-card-main-1472

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, what assistance do you need?
> B: Tell the controller you need medical services upon landing.

#### CSN 3102-16 · atc-scenario-0085-card-main-1473

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, medical services will be ready upon landing.

#### CSN 3102-17 · atc-scenario-0085-card-main-1474

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, descend to 2100 meters, expect radar vector for ILS approach Runway 19.

#### CSN 3102-18 · atc-scenario-0085-card-main-1475

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, cleared for ILS approach Runway 19, report established.

#### CSN 3102-21 · atc-scenario-0085-card-main-1478

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：`CSN 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3102 未出现在原文；原文出现 CSN 102。
- 人工结论：待判

**音频原文**

> C: CSN 102, the ambulance and medical staff have been ready at the gate.

### atc-scenario-0086 · CSN 3235 完全准备 强风切变

#### CSN 3235-1 · atc-scenario-0086-card-main-1479

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 235, a flight from Beijing to Shanghai Hongqiao, you are parking at 217, you have got information G, contact Beijing Delivery and request ATC clearance.

#### CSN 3235-2 · atc-scenario-0086-card-main-1480

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, Beijing Delivery, cleared to Shanghai Hongqiao via flight planned route, departure Runway 08L, LMN-41 departure, initial climb 1500 meters, cruising level 9200 meters, after departure, contact 119.8, squawk 3223.

#### CSN 3235-3 · atc-scenario-0086-card-main-1481

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, your slot time is 0800, expect 15 minutes delay due temporary airway restriction.

#### CSN 3235-4 · atc-scenario-0086-card-main-1482

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, the airway restriction has been cancelled, report ready for start up.

#### CSN 3235-6 · atc-scenario-0086-card-main-1484

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, start up approved.

#### CSN 3235-8 · atc-scenario-0086-card-main-1486

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, push back approved, facing south.

#### CSN 3235-10 · atc-scenario-0086-card-main-1488

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, taxi via taxiway T4, D and A to holding point Runway 08L.

#### CSN 3235-12 · atc-scenario-0086-card-main-1490

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> C: CSN 235, line up Runway 08L and cleared for takeoff, caution strong wind shear at the departure end of the runway.

#### CSN 3235-14 · atc-scenario-0086-card-main-1492

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, roger, climb to 4200 meters, resume own navigation to LMN.

#### CSN 3235-15 · atc-scenario-0086-card-main-1493

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：`CSN 235`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3235 未出现在原文；原文出现 CSN 235。
- 人工结论：待判

**音频原文**

> C: CSN 235, continue climb to 5100 meters, contact Beijing Control on 118.9.

### atc-scenario-0087 · CSN 6682 试音 襟翼卡起飞位 液压漏油

#### CSN 6682-1 · atc-scenario-0087-card-main-1494

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 682, you are at stand K38 with information B, your destination is Guangzhou, request ATC clearance from Wuhan Delivery.

#### CSN 6682-2 · atc-scenario-0087-card-main-1495

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, I read you 3, loud background whistle, check your transmitter.
> B: You have the transmitter checked and carry out radio check with Wuhan Delivery on the frequency 118.3.

#### CSN 6682-3 · atc-scenario-0087-card-main-1496

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, I read you 5.
> B: Acknowledge the transmission and request ATC clearance.

#### CSN 6682-4 · atc-scenario-0087-card-main-1497

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, Wuhan Delivery, cleared to Guangzhou via flight planned route, departure Runway 36R, follow LKO-01 departure, initial climb 1200 meters, cruising level 8400 meters, departure frequency 119.6, squawk 3115.

#### CSN 6682-6 · atc-scenario-0087-card-main-1499

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, taxi via taxiway Z4, A3 and A to holding point Runway 36R.

#### CSN 6682-8 · atc-scenario-0087-card-main-1501

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, Runway 36R, cleared for takeoff, surface wind 350 degrees, 5 knots.

#### CSN 6682-10 · atc-scenario-0087-card-main-1503

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, Wuhan Approach, radar contact, climb to 3900 meters, expedite until passing 2100 meters.

#### CSN 6682-12 · atc-scenario-0087-card-main-1505

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, roger, turn right, direct to WHA, climb to and maintain 3000 meters, hold at WHA as published.

#### CSN 6682-14 · atc-scenario-0087-card-main-1507

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, roger PAN, turn right heading 240, descend to 2400 meters, expect radar vector for ILS approach Runway 36R.

#### CSN 6682-15 · atc-scenario-0087-card-main-1508

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, turn right heading 330, descend to 900 meters, cleared for ILS approach Runway 36R, report established.

#### CSN 6682-17 · atc-scenario-0087-card-main-1510

- 场景：`atc-scenario-0087` · CSN 6682 试音 襟翼卡起飞位 液压漏油
- 场景呼号：`CSN 6682`
- 原文识别到的呼号：`CSN 682`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 6682 未出现在原文；原文出现 CSN 682。
- 人工结论：待判

**音频原文**

> C: CSN 682, cleared to land Runway 36R.

### atc-scenario-0088 · CSN 9302 异物击中,疑似冰雹,仪表失真

#### CSN 9302-1 · atc-scenario-0088-card-main-1511

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 302, you are at parking bay 235, you are ready for push back, contact Guangzhou Ground.

#### CSN 9302-2 · atc-scenario-0088-card-main-1512

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0160（CSN 9302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2755 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 302, stand by, expect 20 minutes delay, thunderstorm is approaching the airport, numerous aircraft holding for weather improvement.

#### CSN 9302-3 · atc-scenario-0088-card-main-1513

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, report tug is ready.
> B: Tell the controller the tug is in position and you are ready for push back.

#### CSN 9302-4 · atc-scenario-0088-card-main-1514

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, push back approved, facing east, Runway 19, stand by for start up.

#### CSN 9302-6 · atc-scenario-0088-card-main-1516

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, expect departure at 49, start up at own discretion, QNH 1008, report when ready for taxi.

#### CSN 9302-8 · atc-scenario-0088-card-main-1518

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, taxi via Juliette, D, T3 and T4 to holding point Runway 19.

#### CSN 9302-9 · atc-scenario-0088-card-main-1519

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, hold short of T3, give way to Airbus 320 crossing from right to left.

#### CSN 9302-10 · atc-scenario-0088-card-main-1520

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, traffic is clear, continue taxi via D, T3 and T4 to holding point Runway 19.

#### CSN 9302-12 · atc-scenario-0088-card-main-1522

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0160（CSN 9302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2765 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> C: CSN 302, line up and wait Runway 19, caution thunderstorm building up at the departure end of Runway 19.
> B: Read back ATC clearance and request right turn when airborne due weather.

#### CSN 9302-13 · atc-scenario-0088-card-main-1523

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, turn right heading 120, direct to LMN, Runway 19, cleared for takeoff, surface wind 180 degrees, 5 meters per second.

#### CSN 9302-15 · atc-scenario-0088-card-main-1525

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, climb to 2700 meters on QNH 1008.

#### CSN 9302-17 · atc-scenario-0088-card-main-1527

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, roger, descend to 1500 meters, expect radar vector for final Runway 19.

#### CSN 9302-18 · atc-scenario-0088-card-main-1528

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, contact Guangzhou Tower on 118.5.

#### CSN 9302-19 · atc-scenario-0088-card-main-1529

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, Runway 19, cleared to land.

### atc-scenario-0095 · CES 2151 拖把断了 鸟击一发失效

#### CES 2151-1 · atc-scenario-0095-card-main-1631

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> B: Your call sign is CES 151, you are at gate 232, you have got information S, request ATC clearance to Shanghai Hongqiao from Wuhan Delivery.

#### CES 2151-2 · atc-scenario-0095-card-main-1632

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, Wuhan Delivery, information S is valid, cleared to Shanghai Hongqiao via flight planned route, Runway 36R, initial climb to 1800 meters, ZF-01 departure, cruising level 10100 meters, after departure, contact 123.4, squawk 4125.

#### CES 2151-4 · atc-scenario-0095-card-main-1634

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, push back and start up approved, push back to taxiway Z4, facing west.

#### CES 2151-7 · atc-scenario-0095-card-main-1637

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, taxi via taxiway Z4, A3 and A to holding point Runway 36R.

#### CES 2151-8 · atc-scenario-0095-card-main-1638

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, hold short of A7, give way to Airbus 320 coming from your right, when traffic is clear, continue taxi via taxiway A to holding point Runway 36R.

#### CES 2151-10 · atc-scenario-0095-card-main-1640

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, wind 200 degrees, 8 meters per second.
> B: The tail wind exceeds your takeoff limit, contact Tower to change to Runway 18L and state the reason.

#### CES 2151-12 · atc-scenario-0095-card-main-1642

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, climb and maintain 600 meters, turn right to join downwind and cleared for ILS Runway 36R.

#### CES 2151-14 · atc-scenario-0095-card-main-1644

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, change to Runway 18L is approved, maintain 600 meters, turn right, direct to WHA, contact Wuhan Approach 121.7.

#### CES 2151-15 · atc-scenario-0095-card-main-1645

- 场景：`atc-scenario-0095` · CES 2151 拖把断了 鸟击一发失效
- 场景呼号：`CES 2151`
- 原文识别到的呼号：`CES 151`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 2151 未出现在原文；原文出现 CES 151。
- 人工结论：待判

**音频原文**

> C: CES 151, climb to and maintain 900 meters, after WHA, fly heading 360, expect radar vector for ILS approach Runway 18L.

### atc-scenario-0096 · CES 5102 异响 3客受伤

#### CES 5102-1 · atc-scenario-0096-card-main-1646

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> B: Your call sign is CES 102, destination Beijing, 4800 meters maintaining, estimating DOGAR 05, information F, now contact Beijing Approach.

#### CES 5102-2 · atc-scenario-0096-card-main-1647

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, Beijing Approach, DOGAR-03 arrival, expect ILS approach Runway 01, maintain 4800 meters.

#### CES 5102-4 · atc-scenario-0096-card-main-1649

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, descend to and maintain 2100 meters on QNH 1012.

#### CES 5102-5 · atc-scenario-0096-card-main-1650

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, can you describe the sound in more detail?
> B: It seems to be an outside air noise or a slight depressurization problem.

#### CES 5102-6 · atc-scenario-0096-card-main-1651

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, roger.
> B: The engineers advised that it may be a problem with the door seal. They suggested you reduce speed to minimum, report to the controller.

#### CES 5102-7 · atc-scenario-0096-card-main-1652

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, affirm, do you require emergency services on arrival?
> B: You have 3 passengers injured during emergency descent, so you will need medical service on arrival, require priority lending.

#### CES 5102-8 · atc-scenario-0096-card-main-1653

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, roger, you are number 1, doctor and ambulance will be ready on arrival.
> B: Request change Runway 36R to save time.

#### CES 5102-9 · atc-scenario-0096-card-main-1654

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, roger, turn left heading 300, radar vector for landing.

#### CES 5102-10 · atc-scenario-0096-card-main-1655

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, the weather is deteriorating, say intention.
> B: Tell the controller you want to continue approach.

#### CES 5102-11 · atc-scenario-0096-card-main-1656

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, descend to and maintain 900 meters, turn right heading 330, report established on localizer.

#### CES 5102-13 · atc-scenario-0096-card-main-1658

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, continue approach and contact Beijing Tower 118.1.

#### CES 5102-15 · atc-scenario-0096-card-main-1660

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, Beijing Tower, expect low visibility for your arrival, say intention.
> B: You want to try landing.

#### CES 5102-16 · atc-scenario-0096-card-main-1661

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, continue approach, report outer marker.

#### CES 5102-18 · atc-scenario-0096-card-main-1663

- 场景：`atc-scenario-0096` · CES 5102 异响 3客受伤
- 场景呼号：`CES 5102`
- 原文识别到的呼号：`CES 102`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5102 未出现在原文；原文出现 CES 102。
- 人工结论：待判

**音频原文**

> C: CES 102, cleared to land Runway 36R, surface wind 160, 7 meters per second, report vacated.

### atc-scenario-0097 · CES 5325 左翼撞击 三号熄火 冲出跑道

#### CES 5325-1 · atc-scenario-0097-card-main-1664

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> B: You are the pilot of CES 325 which is bound for Wuhan. You have just been handed over from Hefei Control, you are over IKUBA at 23, and your level is 8400 meters, call Wuhan Control.

#### CES 5325-2 · atc-scenario-0097-card-main-1665

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, Wuhan Control, radar identified, descent to and maintain 6000 meters, report reaching.

#### CES 5325-4 · atc-scenario-0097-card-main-1667

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: Roger, CES 325, you have just passed the traffic, descent to 6000 meters and turn left heading 170 immediately, there is military activity in the area right now.

#### CES 5325-6 · atc-scenario-0097-card-main-1669

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, roger PAN. Descend to and maintain 4800 meters, report passing XSH.

#### CES 5325-7 · atc-scenario-0097-card-main-1670

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, we have notified the other relevant parties, please give us more description about your present situation.
> B: Report to ATC that No.3 engine has flamed out and it is even harder to overcome the banking tendency. You guess that might be some more damages to the left wing.

#### CES 5325-8 · atc-scenario-0097-card-main-1671

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, keep us advised.

#### CES 5325-10 · atc-scenario-0097-card-main-1673

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, maintain present level and contact Wuhan Approach on 118.9, good day.

#### CES 5325-12 · atc-scenario-0097-card-main-1675

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, roger MAYDAY, the center controller as told us your situation, you will have the top priority. Descend to 1200 meters on QNH 1008, expect ILS approach Runway 36R, you are number 1.

#### CES 5325-14 · atc-scenario-0097-card-main-1677

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, eh, let me see, the latest ATIS shows, wind 310 degrees, at 11 meters per second, but it is variable.

#### CES 5325-16 · atc-scenario-0097-card-main-1679

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, roger, well, fire services and ambulance will be ready upon you landing.

#### CES 5325-18 · atc-scenario-0097-card-main-1681

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, continue approach and contact Tower 118.6, good day.

#### CES 5325-20 · atc-scenario-0097-card-main-1683

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, radar identified, continue ILS approach Runway 36R, you are No.1, report the outer marker.

#### CES 5325-22 · atc-scenario-0097-card-main-1685

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
- 原文识别到的呼号：`CES 325`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5325 未出现在原文；原文出现 CES 325。
- 人工结论：待判

**音频原文**

> C: CES 325, cleared land Runway 36R, wind 300 degrees at 12 meters per second, QNH 1008.

### atc-scenario-0099 · CES 5277 襟翼卡阻 无法完全放下

#### CES 5277-1 · atc-scenario-0099-card-main-1710

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> B: Your call sign is CES 277, you are parking at gate 213, you have received information M, request ATC clearance to London Heathrow from Wuhan Delivery.

#### CES 5277-2 · atc-scenario-0099-card-main-1711

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, cleared to London Heathrow via flight planned route, departure Runway 04, initial climb 2700 meters, LKO-02 departure, cruising level 8400 meters, squawk 2512.

#### CES 5277-4 · atc-scenario-0099-card-main-1713

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, taxi to holding point Runway 04 via taxiway A4, E2, hold short of Runway 36R.

#### CES 5277-6 · atc-scenario-0099-card-main-1715

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, expedite cross Runway 36R, report vacated.

#### CES 5277-9 · atc-scenario-0099-card-main-1718

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, after departure, climb straight ahead until 600 meters, follow SID, direct to LKO, contact Wuhan Departure 120.2, cleared for takeoff Runway 04.

#### CES 5277-11 · atc-scenario-0099-card-main-1720

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, roger, turn right, direct to LKO, hold at LKO VOR 210 radio, hold at 3300 meters, inbound track 280 degrees, left hand pattern, outbound time 1 minute.

#### CES 5277-13 · atc-scenario-0099-card-main-1722

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, turn right heading 340, follow LKO-03A arrival, expect ILS approach Runway 04.

#### CES 5277-15 · atc-scenario-0099-card-main-1724

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, turn right heading 030 to join right hand downwind Runway 04.

#### CES 5277-16 · atc-scenario-0099-card-main-1725

- 场景：`atc-scenario-0099` · CES 5277 襟翼卡阻 无法完全放下
- 场景呼号：`CES 5277`
- 原文识别到的呼号：`CES 277`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CES 5277 未出现在原文；原文出现 CES 277。
- 人工结论：待判

**音频原文**

> C: CES 277, cleared to land, Runway 04.

### atc-scenario-0102 · CSN 3426 乘客坐错 翼尖相撞

#### CSN 3426-1 · atc-scenario-0102-card-main-1757

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> B: Your call sign is CSN 426, at gate 410, ask Beijing East Ground for taxi instruction.

#### CSN 3426-2 · atc-scenario-0102-card-main-1758

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, taxi to holding point of Runway 36R via Y1 and C1.

#### CSN 3426-4 · atc-scenario-0102-card-main-1760

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, backtrack at present position, back to the gate via C1 and Y1.

#### CSN 3426-6 · atc-scenario-0102-card-main-1762

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, taxi to holding point of Runway 36R via Y1 and C1.

#### CSN 3426-7 · atc-scenario-0102-card-main-1763

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, hold short at intersection between Y1 and T2, 1 Airbus 330 taxiing east on taxiway T2.

#### CSN 3426-8 · atc-scenario-0102-card-main-1764

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, after Airbus 330 vacating intersection, continue to taxi.

#### CSN 3426-10 · atc-scenario-0102-card-main-1766

- 场景：`atc-scenario-0102` · CSN 3426 乘客坐错 翼尖相撞
- 场景呼号：`CSN 3426`
- 原文识别到的呼号：`CSN 426`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 3426 未出现在原文；原文出现 CSN 426。
- 人工结论：待判

**音频原文**

> C: CSN 426, I’ve reported it to relevant departments. And investigation car is on the way.

### atc-scenario-0124 · BAW 2352 鸟击 雷暴绕飞 TCAS机动

#### BAW 2352-1 · atc-scenario-0124-card-main-2134

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> Your call sign is BAW 352, you are maintaining 11,000 meters, over XIA, squawking 3567, make an initial contact with Wuhan Control.

#### BAW 2352-2 · atc-scenario-0124-card-main-2135

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, Wuhan Control, radar contact, descend and maintain 10,400 meters.

#### BAW 2352-3 · atc-scenario-0124-card-main-2136

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, Wuhan Control, descend to 9,200 meters, reduce speed to 270 knots until advised.

#### BAW 2352-5 · atc-scenario-0124-card-main-2138

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, cleared offset 25 miles left of track for 30 minutes, report clear of CB.

#### BAW 2352-8 · atc-scenario-0124-card-main-2141

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 备降返航。；与 atc-scenario-0128（ACA 219 TCAS机动 复飞 备降/返航）/atc-scenario-0128-card-main-2211 的原文词集相似度 91%
- 人工结论：待判

**音频原文**

> C: BAW 352, Hefei airport is available, confirm you are diverting to Hefei?
> B: tell the controller you are not diverting to Hefei at the moment and you still want to fly to Wuhan.

#### BAW 2352-9 · atc-scenario-0124-card-main-2142

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, roger, track direct to ZF, follow Z FOXTROT-2A arrival, expect ILS approach Runway 36R.

#### BAW 2352-10 · atc-scenario-0124-card-main-2143

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, descend and maintain 4,200 meters, reduce speed to minimum clean speed.

#### BAW 2352-11 · atc-scenario-0124-card-main-2144

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, contact Wuhan Tower 119.6.

#### BAW 2352-13 · atc-scenario-0124-card-main-2146

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, roger, surface wind calm, RVR touchdown 550 meters, midpoint 600 meters, rollout 500 meters, continue approach Runway 36R.

#### BAW 2352-15 · atc-scenario-0124-card-main-2148

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, cloud broken 700 meters, cleared to land Runway 36R.

#### BAW 2352-17 · atc-scenario-0124-card-main-2150

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0031（BAW 2352 询问两地天气 复飞）/atc-scenario-0031-card-main-545 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> BAW 352, roger, follow the standard missed approach procedure, advise intentions when able.

#### BAW 2352-19 · atc-scenario-0124-card-main-2152

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：`BAW 352`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 BAW 2352 未出现在原文；原文出现 BAW 352。
- 人工结论：待判

**音频原文**

> BAW 352, roger, turn right, direct to LKO, climb to and maintain 2,400 meters.

### atc-scenario-0160 · CSN 9302 雷暴绕飞 TCAS机动 备降/返航

#### CSN 9302-15 · atc-scenario-0160-card-main-2768

- 场景：`atc-scenario-0160` · CSN 9302 雷暴绕飞 TCAS机动 备降/返航
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：`CSN 302`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 CSN 9302 未出现在原文；原文出现 CSN 302。
- 人工结论：待判

**音频原文**

> C: CSN 302, climb to 2700 meters on QNH 1008.

### atc-scenario-0165 · AFR 9939 刹车问题 积冰/防冰 TCAS机动

#### AFR 9939-1 · atc-scenario-0165-card-main-2847

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> B: Your call sign is AFR 939, a flight from Wuhan to Beijing, you are parking at gate 07, you have received information H, request ATC clearance from Wuhan Delivery.

#### AFR 9939-2 · atc-scenario-0165-card-main-2848

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> AFR 939, cleared to Beijing via flight planned route, departure Runway 18, ZF-02 departure, initial climb 2700 meters, request level change en route, departure frequency 127.35, squawk 2615.

#### AFR 9939-4 · atc-scenario-0165-card-main-2850

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, push back and start up approved, facing east.
> B: Tell the controller you have difficulty in starting the engines with strong tailwind, you want to change the push back position in face west.

#### AFR 9939-6 · atc-scenario-0165-card-main-2852

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, taxi to holding point Runway 18 via taxiway Z4, A and A1.

#### AFR 9939-7 · atc-scenario-0165-card-main-2853

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, hold at present position, give way to Airbus 320 vacating via E5.

#### AFR 9939-8 · atc-scenario-0165-card-main-2854

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, traffic is clear, continue taxi via A and A1 to holding point Runway 18.

#### AFR 9939-9 · atc-scenario-0165-card-main-2855

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> AFR 939, contact Wuhan Tower on 124.35.

#### AFR 9939-11 · atc-scenario-0165-card-main-2857

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> AFR 939, line up Runway 18.

#### AFR 9939-12 · atc-scenario-0165-card-main-2858

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> AFR 939, cleared for takeoff Runway 18, surface wind calm.

#### AFR 9939-14 · atc-scenario-0165-card-main-2860

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, what is the situation like now?
> B: Tell the controller your brakes have exceeded the temperature limit, and request taxi back to apron to have the plane checked.

#### AFR 9939-15 · atc-scenario-0165-card-main-2861

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> AFR 939, expedite vacate via E1.

#### AFR 9939-16 · atc-scenario-0165-card-main-2862

- 场景：`atc-scenario-0165` · AFR 9939 刹车问题 积冰/防冰 TCAS机动
- 场景呼号：`AFR 9939`
- 原文识别到的呼号：`AFR 939`
- `PRIMARY_CALLSIGN_NUMBER_MISMATCH`：场景主呼号 AFR 9939 未出现在原文；原文出现 AFR 939。
- 人工结论：待判

**音频原文**

> C: AFR 939, do you need any assistance?
> B: Tell the controller you need stair vehicle to disembark the passengers.


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

### atc-scenario-0031 · BAW 2352 询问两地天气 复飞

#### BAW 2352-4 · atc-scenario-0031-card-main-532

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 2352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2137 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar observed there was a cumulonimbus ahead, contact Wuhan Control and request offset 25 miles left of track for 30 minutes.

#### BAW 2352-6 · atc-scenario-0031-card-main-534

- 场景：`atc-scenario-0031` · BAW 2352 询问两地天气 复飞
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 复飞，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0124（BAW 2352 鸟击 雷暴绕飞 TCAS机动）/atc-scenario-0124-card-main-2139 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are clear of CB, ask Wuhan Control to resume flight route.

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

#### JAL 220-15 · atc-scenario-0044-card-main-760

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

### atc-scenario-0078 · CSN 3109 冰雹风挡裂 自动降落许可

#### CSN 3109-3 · atc-scenario-0078-card-main-1335

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0155（CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动）/atc-scenario-0155-card-main-2673 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Your weather radar observed a thunderstorm ahead, request Beijing Control for a right turn to avoid the thunderstorm.

#### CSN 3109-6 · atc-scenario-0078-card-main-1338

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0155（CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动）/atc-scenario-0155-card-main-2676 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now there is a strong E of thunderstorm, you are too close to the weather, request left turn to avoid it.

#### CSN 3109-8 · atc-scenario-0078-card-main-1340

- 场景：`atc-scenario-0078` · CSN 3109 冰雹风挡裂 自动降落许可
- 场景呼号：`CSN 3109`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 风挡问题，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: Suddenly, you have suffered from hail strike, the wind shield is cracked on the outside, report it to Beijing Control and request return to land.

### atc-scenario-0080 · CSN 6202 前缘襟翼结冰

#### CSN 6202-4 · atc-scenario-0080-card-main-1369

- 场景：`atc-scenario-0080` · CSN 6202 前缘襟翼结冰
- 场景呼号：`CSN 6202`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 襟翼问题，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Inform the controller that your weather radar shows a build-up around YV, request direct to KAKAT.

### atc-scenario-0082 · CSN 3112 跑线 宣布燃油紧急

#### CSN 3112-3 · atc-scenario-0082-card-main-1405

- 场景：`atc-scenario-0082` · CSN 3112 跑线 宣布燃油紧急
- 场景呼号：`CSN 3112`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 燃油问题，但原文仅明确出现 雷暴绕飞。；与 atc-scenario-0159（CSN 3112 燃油紧急 颠簸 雷暴绕飞）/atc-scenario-0159-card-main-2737 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: Now you are clear of CB and closing back to the course, contact Beijing Control.

### atc-scenario-0085 · CSN 3102 乘客被热咖啡烫伤

#### CSN 3102-7 · atc-scenario-0085-card-main-1464

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Weather forecast says the thunderstorm will not improve in about half an hour, you decide to taxi back to the apron for holding.

#### CSN 3102-14 · atc-scenario-0085-card-main-1471

- 场景：`atc-scenario-0085` · CSN 3102 乘客被热咖啡烫伤
- 场景呼号：`CSN 3102`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 乘客医疗，但原文仅明确出现 备降返航。
- 人工结论：待判

**音频原文**

> B: During climb, 1 of the passengers was scalded by hot coffee, contact Guangzhou Departure and request return to land.

### atc-scenario-0086 · CSN 3235 完全准备 强风切变

#### CSN 3235-5 · atc-scenario-0086-card-main-1483

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 舱门问题。；与 atc-scenario-0158（CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题）/atc-scenario-0158-card-main-2724 的原文词集相似度 100%
- 人工结论：待判

**音频原文**

> B: All the passengers have boarded the aircraft, all cabin doors have been closed, you are fully ready.

#### CSN 3235-13 · atc-scenario-0086-card-main-1491

- 场景：`atc-scenario-0086` · CSN 3235 完全准备 强风切变
- 场景呼号：`CSN 3235`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 未识别，但原文仅明确出现 雷暴绕飞。
- 人工结论：待判

**音频原文**

> B: Just after liftoff, you encountered strong wind shear between the surface and 200 meters, report it to Beijing Departure.

### atc-scenario-0088 · CSN 9302 异物击中,疑似冰雹,仪表失真

#### CSN 9302-16 · atc-scenario-0088-card-main-1526

- 场景：`atc-scenario-0088` · CSN 9302 异物击中,疑似冰雹,仪表失真
- 场景呼号：`CSN 9302`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击，但原文仅明确出现 备降返航。；与 atc-scenario-0160（CSN 9302 雷暴绕飞 TCAS机动 备降/返航）/atc-scenario-0160-card-main-2769 的原文词集相似度 100%
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

### atc-scenario-0097 · CES 5325 左翼撞击 三号熄火 冲出跑道

#### CES 5325-3 · atc-scenario-0097-card-main-1666

- 场景：`atc-scenario-0097` · CES 5325 左翼撞击 三号熄火 冲出跑道
- 场景呼号：`CES 5325`
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

### atc-scenario-0124 · BAW 2352 鸟击 雷暴绕飞 TCAS机动

#### BAW 2352-16 · atc-scenario-0124-card-main-2149

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 复飞。；与 atc-scenario-0031（BAW 2352 询问两地天气 复飞）/atc-scenario-0031-card-main-544 的原文词集相似度 88%
- 人工结论：待判

**音频原文**

> the weather is deteriorating and below your landing minima, you executed a missed approach, advise tower.

#### BAW 2352-18 · atc-scenario-0124-card-main-2151

- 场景：`atc-scenario-0124` · BAW 2352 鸟击 雷暴绕飞 TCAS机动
- 场景呼号：`BAW 2352`
- 原文识别到的呼号：未识别到
- `SCENE_SEMANTIC_DRIFT`：场景主题为 鸟击、雷暴绕飞、TCAS机动，但原文仅明确出现 备降返航、复飞。；与 atc-scenario-0031（BAW 2352 询问两地天气 复飞）/atc-scenario-0031-card-main-546 的原文词集相似度 87%
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
