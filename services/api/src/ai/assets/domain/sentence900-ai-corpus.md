# Sentence900 AI Corpus

本文档把上游 `feizhuicu/docs/references/sentence900/900原始文本.txt` 定位为 `sentence900` 的 AI 语料源。它不替代当前设计稿运行时题库 JSON，只用于沉淀 ASR hotwords / hints、保守 normalization 和 word-lookup 术语候选。

## 1. Source Validation

- Source: `/Users/zhouyide/Desktop/icao项目/feizhuicu/docs/references/sentence900/900原始文本.txt`
- Runtime data: `lib/question-banks/data/question-bank.json`
- Extraction report: `feizhuicu/tools/question-bank-pipeline/reports/sentence900-ai-assets-report.json`
- Source entries: `900`
- JSON entries: `900`
- Sequence 1-900: `yes`
- Source / JSON mismatches: `0`

Review decision: ready for AI content assets; do not change published question-bank data from this file.

## 2. ASR Hotword Candidates

| ID | Hotword | Category | Count | Sentence IDs | Status | Use For |
| --- | --- | --- | ---: | --- | --- | --- |
| S900-HW-001 | `VOR` | abbreviation | 36 | 62, 71, 72, 74, 75, 314, 316, 317 | ready | transcribe, word-lookup |
| S900-HW-002 | `BKM` | navaid-or-waypoint | 23 | 314, 316, 319, 371, 382, 383, 385, 386 | hint-only | transcribe |
| S900-HW-003 | `ILS` | abbreviation | 12 | 18, 278, 298, 299, 300, 323, 375, 471 | ready | transcribe, word-lookup |
| S900-HW-004 | `ADS-B` | abbreviation | 12 | 283, 284, 285, 286, 287, 288, 633, 634 | ready | transcribe, word-lookup |
| S900-HW-005 | `APU` | abbreviation | 11 | 520, 521, 522, 656, 659, 660, 665, 666 | ready | transcribe, word-lookup |
| S900-HW-006 | `RVSM` | abbreviation | 10 | 429, 430, 431, 432, 433, 465, 531, 594 | ready | transcribe, word-lookup |
| S900-HW-007 | `QNH` | abbreviation | 9 | 5, 94, 96, 97, 98, 104, 334, 416 | ready | transcribe, word-lookup |
| S900-HW-008 | `RVR` | abbreviation | 8 | 198, 199, 201, 202, 203, 204, 205, 206 | ready | transcribe, word-lookup |
| S900-HW-009 | `DME` | abbreviation | 7 | 75, 316, 317, 408, 476 | ready | transcribe, word-lookup |
| S900-HW-010 | `RNAV` | abbreviation | 7 | 87, 361, 362, 364, 365, 368, 468 | ready | transcribe, word-lookup |
| S900-HW-011 | `BK` | waypoint-candidate | 7 | 225, 227, 246, 295, 330, 331, 353 | hint-only | transcribe |
| S900-HW-012 | `CPDLC` | abbreviation | 7 | 437, 438, 440, 662, 663, 664 | ready | transcribe, word-lookup |
| S900-HW-013 | `A1` | route-designator | 6 | 131, 134, 399, 419, 420, 423 | hint-only | transcribe |
| S900-HW-014 | `FL` | abbreviation | 6 | 343, 384, 385, 563, 754 | ready | transcribe, word-lookup |
| S900-HW-015 | `VMC` | abbreviation | 5 | 27, 337, 417, 418, 882 | ready | transcribe, word-lookup |
| S900-HW-016 | `GPS` | abbreviation | 5 | 366, 482, 590, 630, 635 | ready | transcribe, word-lookup |
| S900-HW-017 | `TCAS` | abbreviation | 5 | 602, 604, 854, 857, 858 | ready | transcribe, word-lookup |
| S900-HW-018 | `ATC` | abbreviation | 4 | 76, 86, 324, 496 | ready | transcribe, word-lookup |
| S900-HW-019 | `FMS` | abbreviation | 4 | 362, 463, 588, 839 | ready | transcribe, word-lookup |
| S900-HW-020 | `CAT` | abbreviation | 4 | 375, 483, 487, 895 | ready | transcribe, word-lookup |
| S900-HW-021 | `A2` | route-designator | 3 | 126, 161, 162 | hint-only | transcribe |
| S900-HW-022 | `C2` | uppercase-token | 3 | 156, 157, 158 | hint-only | transcribe |
| S900-HW-023 | `IMC` | abbreviation | 3 | 233, 642, 881 | ready | transcribe, word-lookup |
| S900-HW-024 | `NOTAM` | abbreviation | 3 | 277, 649, 759 | ready | transcribe, word-lookup |
| S900-HW-025 | `SELCAL` | abbreviation | 3 | 439, 491 | ready | transcribe, word-lookup |
| S900-HW-026 | `SID` | abbreviation | 2 | 29, 137 | ready | transcribe, word-lookup |
| S900-HW-027 | `LHR` | navaid-or-waypoint | 2 | 73 | hint-only | transcribe |
| S900-HW-028 | `LN` | waypoint-candidate | 2 | 268, 321 | hint-only | transcribe |
| S900-HW-029 | `KODAP` | waypoint-candidate | 2 | 340, 342 | hint-only | transcribe |
| S900-HW-030 | `AK` | waypoint-candidate | 2 | 351, 369 | hint-only | transcribe |
| S900-HW-031 | `radar vectors` | procedure | 13 | 46, 251, 290, 463, 468, 478, 480, 505 | ready | transcribe, word-lookup |
| S900-HW-032 | `wind shear` | weather | 8 | 183, 464, 708, 709, 710, 714, 717, 731 | ready | transcribe, word-lookup |
| S900-HW-033 | `flight planned route` | route | 6 | 45, 78, 79, 80, 85, 420 | ready | transcribe, word-lookup |
| S900-HW-034 | `air conditioning` | system | 6 | 441, 442, 443, 444, 447, 659 | ready | transcribe, word-lookup |
| S900-HW-035 | `minimum safe altitude` | altitude | 5 | 467, 538, 582, 597, 639 | ready | transcribe, word-lookup |
| S900-HW-036 | `fuel leak` | emergency | 5 | 546, 547, 552, 554, 555 | ready | transcribe, word-lookup |
| S900-HW-037 | `landing gear` | aircraft-system | 4 | 176, 621, 623, 773 | ready | transcribe, word-lookup |
| S900-HW-038 | `medical assistance` | emergency | 4 | 448, 604, 653, 875 | ready | transcribe, word-lookup |
| S900-HW-039 | `hydraulic system` | system | 3 | 567, 571, 573 | ready | transcribe, word-lookup |
| S900-HW-040 | `engine failure` | emergency | 2 | 650, 694 | ready | transcribe, word-lookup |
| S900-HW-041 | `smoke emergency` | emergency | 1 | 446 | ready | transcribe, word-lookup |
| S900-HW-042 | `pressurization system` | system | 1 | 449 | ready | transcribe, word-lookup |

## 3. Waypoint And Navaid Hint Candidates

这些条目只作为 ASR hint，不自动改写转写结果。短代码可能和普通单词、机型、代码字段混淆，进入运行时代码前应保持 `hint-only`。

| ID | Candidate | Type | Count | Sentence IDs | Status | Use For |
| --- | --- | --- | ---: | --- | --- | --- |
| S900-NAV-001 | `BKM VOR` | navaid-context | 22 | 314, 316, 319, 371, 382, 383, 385, 386 | hint-only | transcribe |
| S900-NAV-002 | `HUR VOR` | navaid-context | 1 | 62 | hint-only | transcribe |
| S900-NAV-003 | `SY VOR` | navaid-context | 1 | 71 | hint-only | transcribe |
| S900-NAV-004 | `JFK VOR` | navaid-context | 1 | 72 | hint-only | transcribe |
| S900-NAV-005 | `AMS VOR` | navaid-context | 1 | 74 | hint-only | transcribe |
| S900-NAV-006 | `PER VOR` | navaid-context | 1 | 75 | hint-only | transcribe |
| S900-NAV-007 | `ST VOR` | navaid-context | 1 | 317 | hint-only | transcribe |
| S900-NAV-008 | `LV NDB` | navaid-context | 1 | 402 | hint-only | transcribe |
| S900-NAV-009 | `NLD VOR` | navaid-context | 1 | 404 | hint-only | transcribe |
| S900-WPT-001 | `BKM` | waypoint-candidate | 23 | 314, 316, 319, 371, 382, 383, 385, 386 | hint-only | transcribe |
| S900-WPT-002 | `BK` | waypoint-candidate | 7 | 225, 227, 246, 295, 330, 331, 353 | hint-only | transcribe |
| S900-WPT-003 | `LHR` | waypoint-candidate | 2 | 73 | hint-only | transcribe |
| S900-WPT-004 | `LN` | waypoint-candidate | 2 | 268, 321 | hint-only | transcribe |
| S900-WPT-005 | `KODAP` | waypoint-candidate | 2 | 340, 342 | hint-only | transcribe |
| S900-WPT-006 | `AK` | waypoint-candidate | 2 | 351, 369 | hint-only | transcribe |
| S900-WPT-007 | `NLD` | waypoint-candidate | 2 | 403, 404 | hint-only | transcribe |
| S900-WPT-008 | `DAPRO` | waypoint-candidate | 2 | 419, 420 | hint-only | transcribe |
| S900-WPT-009 | `WXJ` | waypoint-candidate | 1 | 4 | hint-only | transcribe |
| S900-WPT-010 | `SHA` | waypoint-candidate | 1 | 9 | hint-only | transcribe |
| S900-WPT-011 | `CGO` | waypoint-candidate | 1 | 10 | hint-only | transcribe |
| S900-WPT-012 | `WXI` | waypoint-candidate | 1 | 12 | hint-only | transcribe |
| S900-WPT-013 | `ZHO` | waypoint-candidate | 1 | 13 | hint-only | transcribe |
| S900-WPT-014 | `PLT` | waypoint-candidate | 1 | 17 | hint-only | transcribe |
| S900-WPT-015 | `LLK` | waypoint-candidate | 1 | 29 | hint-only | transcribe |
| S900-WPT-016 | `HRB` | waypoint-candidate | 1 | 51 | hint-only | transcribe |
| S900-WPT-017 | `JMU` | waypoint-candidate | 1 | 51 | hint-only | transcribe |
| S900-WPT-018 | `OBLIK` | waypoint-candidate | 1 | 53 | hint-only | transcribe |
| S900-WPT-019 | `ZF` | waypoint-candidate | 1 | 53 | hint-only | transcribe |
| S900-WPT-020 | `WUH` | waypoint-candidate | 1 | 53 | hint-only | transcribe |
| S900-WPT-021 | `WXA` | waypoint-candidate | 1 | 54 | hint-only | transcribe |
| S900-WPT-022 | `HUR` | waypoint-candidate | 1 | 62 | hint-only | transcribe |
| S900-WPT-023 | `ML` | waypoint-candidate | 1 | 67 | hint-only | transcribe |
| S900-WPT-024 | `DA` | waypoint-candidate | 1 | 68 | hint-only | transcribe |
| S900-WPT-025 | `SY` | waypoint-candidate | 1 | 71 | hint-only | transcribe |
| S900-WPT-026 | `JFK` | waypoint-candidate | 1 | 72 | hint-only | transcribe |
| S900-WPT-027 | `AMS` | waypoint-candidate | 1 | 74 | hint-only | transcribe |
| S900-WPT-028 | `PER` | waypoint-candidate | 1 | 75 | hint-only | transcribe |
| S900-WPT-029 | `ZAM` | waypoint-candidate | 1 | 79 | hint-only | transcribe |
| S900-WPT-030 | `WHA` | waypoint-candidate | 1 | 84 | hint-only | transcribe |
| S900-WPT-031 | `LX` | waypoint-candidate | 1 | 91 | hint-only | transcribe |
| S900-WPT-032 | `TB` | waypoint-candidate | 1 | 252 | hint-only | transcribe |
| S900-WPT-033 | `CK` | waypoint-candidate | 1 | 258 | hint-only | transcribe |
| S900-WPT-034 | `DG` | waypoint-candidate | 1 | 259 | hint-only | transcribe |
| S900-WPT-035 | `IP` | waypoint-candidate | 1 | 269 | hint-only | transcribe |

## 4. Normalization Candidates

这些规则只应在场景明确时启用，并且必须保留 `rawTranscript`。不要让 normalization 修正用户语法错误，也不要用标准句补全用户没说出的内容。

| ID | Type | Target | Count | Sentence IDs | Action | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| S900-NR-001 | flight-level | `FL` | 99 | 1, 2, 3, 4, 6, 7, 9, 10 | normalize-if-clear | ready |
| S900-NR-002 | runway | `Runway` | 57 | 18, 46, 47, 48, 71, 78, 80, 81 | normalize-if-clear | ready |
| S900-NR-003 | heading | `heading` | 24 | 18, 71, 72, 146, 244, 246, 247, 248 | normalize-if-clear | ready |
| S900-NR-004 | frequency | `radio frequency` | 20 | 52, 67, 78, 80, 81, 82, 85, 87 | normalize-if-clear | ready |
| S900-NR-005 | speed | `speed knots` | 18 | 37, 40, 41, 42, 253, 254, 255, 256 | normalize-if-clear | ready |
| S900-NR-006 | squawk | `squawk` | 13 | 51, 78, 79, 80, 81, 82, 85, 87 | normalize-if-clear | ready |
| S900-NR-007 | qnh-qfe | `QNH/QFE` | 9 | 5, 96, 97, 98, 104, 334, 335, 416 | normalize-if-clear | ready |

## 5. Phrasebook Candidates

这些短语可用于 ASR phrase hints 和 word-lookup。

| ID | Phrase | Category | Count | Sentence IDs | Status | Use For |
| --- | --- | --- | ---: | --- | --- | --- |
| S900-PH-001 | `request diversion` | emergency / alternate | 27 | 360, 460, 487, 501, 541, 545, 547, 571 | ready | transcribe, word-lookup |
| S900-PH-002 | `request radar vectors` | navigation | 12 | 46, 290, 463, 468, 478, 480, 505, 513 | ready | transcribe, word-lookup |
| S900-PH-003 | `request immediate descent` | emergency | 10 | 445, 452, 453, 655, 680, 681, 702, 713 | ready | transcribe, word-lookup |
| S900-PH-004 | `request emergency services` | emergency | 6 | 522, 548, 666, 735, 776, 862 | ready | transcribe, word-lookup |
| S900-PH-005 | `expect further clearance` | holding | 5 | 68, 73, 74, 371, 421 | ready | transcribe, word-lookup |
| S900-PH-006 | `request priority landing` | emergency | 5 | 502, 503, 519, 808, 867 | ready | transcribe, word-lookup |
| S900-PH-007 | `request holding instructions` | holding | 4 | 313, 479, 741, 890 | ready | transcribe, word-lookup |
| S900-PH-008 | `contact Approach` | communication | 2 | 67, 228 | ready | transcribe, word-lookup |
| S900-PH-009 | `hold as published` | holding | 2 | 68, 369 | ready | transcribe, word-lookup |
| S900-PH-010 | `maintain runway heading` | departure | 2 | 137, 780 | ready | transcribe, word-lookup |
| S900-PH-011 | `cleared to land` | clearance | 2 | 174, 179 | ready | transcribe, word-lookup |
| S900-PH-012 | `unable to maintain altitude` | limitation | 1 | 465 | ready | transcribe, word-lookup |
| S900-PH-013 | `unable to comply` | limitation | 1 | 854 | ready | transcribe, word-lookup |

## 6. Boundary Notes

- `sentence900` 的产品链路仍是 `transcribe + exact-match-check`。
- `exact-match-check` 保持本地确定性规则，不调用 LLM。
- ASR 可以使用本文件里的 hotwords / navaid hints，但不能直接把用户语音补全为标准句。
- `word-lookup` 可以引用本语料中的句子编号解释术语和短语。
