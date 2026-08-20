# ICAO 字母拼读

本资产用于识别和规范呼号、注册号、航路点、导航台及需要逐字母确认的专名。标准拼写使用 ICAO 形式，例如 `Alfa` 和 `Juliett`。

| 字母 | 标准拼读词 | 近似读音 |
| --- | --- | --- |
| A | Alfa | AL-FAH |
| B | Bravo | BRAH-VOH |
| C | Charlie | CHAR-LEE |
| D | Delta | DELL-TAH |
| E | Echo | ECK-OH |
| F | Foxtrot | FOKS-TROT |
| G | Golf | GOLF |
| H | Hotel | HOH-TELL |
| I | India | IN-DEE-AH |
| J | Juliett | JEW-LEE-ETT |
| K | Kilo | KEY-LOH |
| L | Lima | LEE-MAH |
| M | Mike | MIKE |
| N | November | NO-VEM-BER |
| O | Oscar | OSS-CAH |
| P | Papa | PAH-PAH |
| Q | Quebec | KEH-BECK |
| R | Romeo | ROW-ME-OH |
| S | Sierra | SEE-AIR-RAH |
| T | Tango | TANG-GO |
| U | Uniform | YOU-NEE-FORM |
| V | Victor | VIK-TAH |
| W | Whiskey | WISS-KEY |
| X | X-ray | ECKS-RAY |
| Y | Yankee | YANG-KEY |
| Z | Zulu | ZOO-LOO |

## 开发约束

- 连续拼读词只有在呼号、注册号、航路点、导航台或明确的 spelling 上下文中才能合并为字母。
- 合并后必须保留原顺序；不得根据题目答案猜测缺失字母。
- `Alfa`、`Juliett` 是规范拼写；输入中的 `Alpha`、`Juliet` 可以作为识别别名，但规范输出使用标准形式。
- `Hotel`、`India`、`Golf` 等同时也是普通英语词；没有拼读上下文时不得转换成单字母。
- 字母和数字混合标识必须逐项处理，例如 `Alfa three` → `A3`，不能丢失任何一项。

## 参考

- [ICAO Annex 10, Volume II](https://www.icao.int/Meetings/anconf12/Document%20Archive/AN10_V2_cons%5B1%5D.pdf)
- [FAA AIM, Phonetic Alphabet](https://www.faa.gov/air_traffic/publications/ATpubs/AIM_html/chap4_section_2.html)
