# 陆空通话完整场景迁移修正报告

- 规则：Web 陆空通话原始场景为最小迁移单元，一个场景只能全加或全不加。
- 处理：恢复迁移前 107 个旧场景，撤销之前向旧场景追加的 677 张卡，再按 79 个 Web 场景完整新增。
- 修正后：186 场景 / 3218 卡。

| 新场景 | 场景名 | 卡片 | 此前误写入的旧场景 | Web 来源 |
| --- | --- | ---: | --- | --- |
| atc-scenario-0108 | AFR 113 发动机失效 乘客医疗 TCAS机动 | 19 | atc-scenario-0015.json | banks/radiotelephony/001-afr113.json |
| atc-scenario-0109 | SIA 123 鸟击 发动机失效 积冰/防冰 | 16 | atc-scenario-0008.json | banks/radiotelephony/002-sia123.json |
| atc-scenario-0110 | UAL 403 机翼/控制面损坏 颠簸 雷暴绕飞 | 16 | atc-scenario-0034.json | banks/radiotelephony/003-ual403.json |
| atc-scenario-0111 | SIA 497 起落架问题 TCAS机动 | 17 | atc-scenario-0010.json | banks/radiotelephony/007-sia497.json |
| atc-scenario-0112 | CSN 557 液压问题 起落架问题 燃油泄漏 | 18 | atc-scenario-0075.json | banks/radiotelephony/008-csn557.json |
| atc-scenario-0113 | CSN 542 撞气球 可疑炸弹/无人认领行李 机翼/控制面损坏 | 20 | atc-scenario-0071.json | banks/radiotelephony/009-csn542.json |
| atc-scenario-0114 | CSN 3102 雷暴绕飞 积冰/防冰 乘客医疗 | 20 | atc-scenario-0085.json | banks/radiotelephony/010-csn3102.json |
| atc-scenario-0115 | CSN 3102 机翼/控制面损坏 积冰/防冰 TCAS机动 | 19 | atc-scenario-0083.json | banks/radiotelephony/011-csn3102.json |
| atc-scenario-0116 | CSN 3102 雷暴绕飞 TCAS机动 舱门问题 | 17 | atc-scenario-0077.json | banks/radiotelephony/012-csn3102.json |
| atc-scenario-0117 | CSN 6682 液压问题 襟翼问题 积冰/防冰 | 17 | atc-scenario-0087.json | banks/radiotelephony/013-csn6682.json |
| atc-scenario-0118 | CSN 371 刹车问题 TCAS机动 | 18 | atc-scenario-0076.json | banks/radiotelephony/014-csn371.json |
| atc-scenario-0119 | SIA 615 鸟击 积冰/防冰 烟雾 | 18 | atc-scenario-0012.json | banks/radiotelephony/015-sia615.json |
| atc-scenario-0120 | AFR 101 发动机失效 积冰/防冰 TCAS机动 | 20 | atc-scenario-0020.json | banks/radiotelephony/016-afr101.json |
| atc-scenario-0121 | SIA 852 起落架问题 积冰/防冰 TCAS机动 | 15 | atc-scenario-0007.json | banks/radiotelephony/017-sia852.json |
| atc-scenario-0122 | SIA 308 烟雾 TCAS机动 备降/返航 | 17 | atc-scenario-0013.json | banks/radiotelephony/019-sia308.json |
| atc-scenario-0123 | BAW 931 鸟击 发动机起火 乘客医疗 | 15 | atc-scenario-0028.json | banks/radiotelephony/020-baw931.json |
| atc-scenario-0124 | BAW 2352 鸟击 雷暴绕飞 TCAS机动 | 19 | atc-scenario-0031.json | banks/radiotelephony/021-baw2352.json |
| atc-scenario-0125 | BAW 120 鸟击 积冰/防冰 TCAS机动 | 16 | atc-scenario-0026.json | banks/radiotelephony/022-baw120.json |
| atc-scenario-0126 | BAW 817 鸟击 积冰/防冰 TCAS机动 | 17 | atc-scenario-0030.json | banks/radiotelephony/023-baw817.json |
| atc-scenario-0127 | ACA 331 烟雾 TCAS机动 备降/返航 | 19 | atc-scenario-0047.json | banks/radiotelephony/024-aca331.json |
| atc-scenario-0128 | ACA 219 TCAS机动 复飞 备降/返航 | 19 | atc-scenario-0046.json | banks/radiotelephony/025-aca219.json |
| atc-scenario-0129 | ACA 452 颠簸 积冰/防冰 TCAS机动 | 17 | atc-scenario-0049.json | banks/radiotelephony/026-aca452.json |
| atc-scenario-0130 | ACA 517 发动机失效 颠簸 TCAS机动 | 16 | atc-scenario-0050.json | banks/radiotelephony/027-aca517.json |
| atc-scenario-0131 | ACA 521 乘客医疗 TCAS机动 | 16 | atc-scenario-0051.json | banks/radiotelephony/028-aca521.json |
| atc-scenario-0132 | ACA 571 颠簸 雷暴绕飞 TCAS机动 | 16 | atc-scenario-0108.json | banks/radiotelephony/029-aca571.json |
| atc-scenario-0133 | CES 565 缝翼问题 积冰/防冰 TCAS机动 | 18 | atc-scenario-0092.json | banks/radiotelephony/031-ces565.json |
| atc-scenario-0134 | CES 728 颠簸 积冰/防冰 TCAS机动 | 18 | atc-scenario-0093.json | banks/radiotelephony/032-ces728.json |
| atc-scenario-0135 | CES 556 颠簸 雷暴绕飞 积冰/防冰 | 20 | atc-scenario-0089.json | banks/radiotelephony/033-ces556.json |
| atc-scenario-0136 | CES 2151 鸟击 TCAS机动 备降/返航 | 15 | atc-scenario-0095.json | banks/radiotelephony/034-ces2151.json |
| atc-scenario-0137 | CES 5118 雷暴绕飞 TCAS机动 舱门问题 | 24 | atc-scenario-0098.json | banks/radiotelephony/035-ces5118.json |
| atc-scenario-0138 | CES 769 TCAS机动 | 15 | atc-scenario-0094.json | banks/radiotelephony/036-ces769.json |
| atc-scenario-0139 | CES 529 TCAS机动 备降/返航 | 15 | atc-scenario-0091.json | banks/radiotelephony/037-ces529.json |
| atc-scenario-0140 | CES 209 TCAS机动 备降/返航 | 15 | atc-scenario-0091.json | banks/radiotelephony/038-ces209.json |
| atc-scenario-0141 | CES 5277 襟翼问题 TCAS机动 备降/返航 | 16 | atc-scenario-0099.json | banks/radiotelephony/039-ces5277.json |
| atc-scenario-0142 | CCA 512 发动机失效 积冰/防冰 TCAS机动 | 18 | atc-scenario-0058.json | banks/radiotelephony/040-cca512.json |
| atc-scenario-0143 | CCA 725 起落架问题 积冰/防冰 乘客医疗 | 16 | atc-scenario-0060.json | banks/radiotelephony/041-cca725.json |
| atc-scenario-0144 | CCA 985 积冰/防冰 烟雾 TCAS机动 | 17 | atc-scenario-0061.json | banks/radiotelephony/042-cca985.json |
| atc-scenario-0145 | CCA 937 积冰/防冰 TCAS机动 备降/返航 | 18 | atc-scenario-0063.json | banks/radiotelephony/043-cca937.json |
| atc-scenario-0146 | CCA 976 起落架问题 襟翼问题 烟雾 | 19 | atc-scenario-0062.json | banks/radiotelephony/044-cca976.json |
| atc-scenario-0147 | CCA 527 鸟击 雷暴绕飞 TCAS机动 | 17 | atc-scenario-0059.json | banks/radiotelephony/045-cca527.json |
| atc-scenario-0148 | CCA 1301 起落架问题 刹车问题 积冰/防冰 | 20 | atc-scenario-0068.json | banks/radiotelephony/046-cca1301.json |
| atc-scenario-0149 | CCA 3101 起落架问题 刹车问题 积冰/防冰 | 20 | atc-scenario-0068.json | banks/radiotelephony/047-cca3101.json |
| atc-scenario-0150 | CCA 321 积冰/防冰 乘客医疗 TCAS机动 | 17 | atc-scenario-0064.json | banks/radiotelephony/048-cca321.json |
| atc-scenario-0151 | CCA 1368 雷暴绕飞 TCAS机动 复飞 | 16 | atc-scenario-0070.json | banks/radiotelephony/049-cca1368.json |
| atc-scenario-0152 | CCA 572 雷暴绕飞 TCAS机动 | 17 | atc-scenario-0068.json | banks/radiotelephony/050-cca572.json |
| atc-scenario-0153 | CCA 1432 雷暴绕飞 TCAS机动 | 15 | atc-scenario-0069.json | banks/radiotelephony/051-cca1432.json |
| atc-scenario-0154 | CSN 319 液压问题 雷暴绕飞 TCAS机动 | 16 | atc-scenario-0073.json | banks/radiotelephony/052-csn319.json |
| atc-scenario-0155 | CSN 3109 风挡裂纹 雷暴绕飞 TCAS机动 | 16 | atc-scenario-0078.json | banks/radiotelephony/054-csn3109.json |
| atc-scenario-0156 | CSN 7353 TCAS机动 危险品 延误/加油 | 16 | atc-scenario-0081.json | banks/radiotelephony/055-csn7353.json |
| atc-scenario-0157 | CSN 1310 雷暴绕飞 TCAS机动 延误/加油 | 17 | atc-scenario-0079.json | banks/radiotelephony/056-csn1310.json |
| atc-scenario-0158 | CSN 3235 TCAS机动 导航/自动驾驶问题 舱门问题 | 15 | atc-scenario-0086.json | banks/radiotelephony/058-csn3235.json |
| atc-scenario-0159 | CSN 3112 燃油紧急 颠簸 雷暴绕飞 | 19 | atc-scenario-0082.json | banks/radiotelephony/059-csn3112.json |
| atc-scenario-0160 | CSN 9302 雷暴绕飞 TCAS机动 备降/返航 | 19 | atc-scenario-0088.json | banks/radiotelephony/060-csn9302.json |
| atc-scenario-0161 | AFR 896 颠簸 积冰/防冰 TCAS机动 | 20 | atc-scenario-0022.json | banks/radiotelephony/061-afr896.json |
| atc-scenario-0162 | AFR 941 发动机失效 TCAS机动 延误/加油 | 18 | atc-scenario-0017.json | banks/radiotelephony/062-afr941.json |
| atc-scenario-0163 | QFA 923 液压问题 积冰/防冰 TCAS机动 | 19 | atc-scenario-0003.json | banks/radiotelephony/063-qfa923.json |
| atc-scenario-0164 | AFR 675 起落架问题 襟翼问题 雷暴绕飞 | 17 | atc-scenario-0021.json | banks/radiotelephony/064-afr675.json |
| atc-scenario-0165 | AFR 9939 刹车问题 积冰/防冰 TCAS机动 | 16 | atc-scenario-0024.json | banks/radiotelephony/065-afr9939.json |
| atc-scenario-0166 | AFR 101 发动机失效 积冰/防冰 TCAS机动 | 20 | atc-scenario-0020.json | banks/radiotelephony/066-afr101.json |
| atc-scenario-0167 | AFR 332 烟雾 TCAS机动 备降/返航 | 15 | atc-scenario-0109.json | banks/radiotelephony/067-afr332.json |
| atc-scenario-0168 | UAL 831 增压问题 TCAS机动 | 18 | atc-scenario-0035.json | banks/radiotelephony/068-ual831.json |
| atc-scenario-0169 | UAL 182 积冰/防冰 TCAS机动 | 18 | atc-scenario-0036.json | banks/radiotelephony/069-ual182.json |
| atc-scenario-0170 | UAL 219 颠簸 积冰/防冰 TCAS机动 | 16 | atc-scenario-0038.json | banks/radiotelephony/070-ual219.json |
| atc-scenario-0171 | UAL 805 雷暴绕飞 TCAS机动 导航/自动驾驶问题 | 16 | atc-scenario-0037.json | banks/radiotelephony/071-ual805.json |
| atc-scenario-0172 | UAL 811 颠簸 雷暴绕飞 增压问题 | 15 | atc-scenario-0040.json | banks/radiotelephony/072-ual811.json |
| atc-scenario-0173 | UAL 835 TCAS机动 | 16 | atc-scenario-0039.json | banks/radiotelephony/073-ual835.json |
| atc-scenario-0174 | UAL 221 颠簸 乘客医疗 TCAS机动 | 16 | atc-scenario-0033.json | banks/radiotelephony/074-ual221.json |
| atc-scenario-0175 | UAL 817 鸟击 积冰/防冰 TCAS机动 | 17 | atc-scenario-0110.json | banks/radiotelephony/075-ual817.json |
| atc-scenario-0176 | UAL 813 颠簸 TCAS机动 | 16 | atc-scenario-0033.json | banks/radiotelephony/076-ual813.json |
| atc-scenario-0177 | QFA 701 起落架问题 雷暴绕飞 TCAS机动 | 17 | atc-scenario-0006.json | banks/radiotelephony/077-qfa701.json |
| atc-scenario-0178 | QFA 160 机翼/控制面损坏 燃油紧急 TCAS机动 | 18 | atc-scenario-0002.json | banks/radiotelephony/078-qfa160.json |
| atc-scenario-0179 | QFA 358 雷暴绕飞 TCAS机动 复飞 | 15 | atc-scenario-0005.json | banks/radiotelephony/079-qfa358.json |
| atc-scenario-0180 | QFA 432 积冰/防冰 烟雾 TCAS机动 | 20 | atc-scenario-0001.json | banks/radiotelephony/080-qfa432.json |
| atc-scenario-0181 | JAL 602 雷暴绕飞 乘客医疗 TCAS机动 | 15 | atc-scenario-0043.json | banks/radiotelephony/082-jal602.json |
| atc-scenario-0182 | JAL 220 鸟击 积冰/防冰 乘客医疗 | 15 | atc-scenario-0044.json | banks/radiotelephony/083-jal220.json |
| atc-scenario-0183 | KLM 88 积冰/防冰 TCAS机动 复飞 | 20 | atc-scenario-0042.json | banks/radiotelephony/084-klm88.json |
| atc-scenario-0184 | SIA 323 发动机失效 积冰/防冰 TCAS机动 | 17 | atc-scenario-0011.json | banks/radiotelephony/085-sia323.json |
| atc-scenario-0185 | CCA 321 风挡裂纹 雷暴绕飞 积冰/防冰 | 19 | atc-scenario-0064.json | banks/radiotelephony/087-cca321.json |
| atc-scenario-0186 | SIA 223 起落架问题 TCAS机动 复飞 | 17 | atc-scenario-0111.json | banks/radiotelephony/088-sia223.json |
