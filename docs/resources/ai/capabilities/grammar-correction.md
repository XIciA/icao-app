# 语法纠错

## 介绍

语法纠错用于修正 ASR 转写英文中的明确语言错误。结果先分条展示每一处修改，再展示完整的正确句子。案例中的“用户完整看到的结果”代表页面需要呈现的全部内容，标题、顺序、编号和文字都是产品效果的一部分。开发者只需维护这些输入输出案例。

## 案例

### 案例 1：一处语法错误

**用户输入（ASR 转写）**

> He have informed ATC.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **He have → He has**  
>    主语 He 为第三人称单数，应使用 has。
>
> **正确句子**
>
> He has informed ATC.

### 案例 2：过去时错误

**用户输入（ASR 转写）**

> Yesterday we encounter severe turbulence.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **encounter → encountered**  
>    事件发生在昨天，应使用一般过去时。
>
> **正确句子**
>
> Yesterday we encountered severe turbulence.

### 案例 3：多处语法错误

**用户输入（ASR 转写）**

> The passengers was frightened and the pilot were calm.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **passengers was → passengers were**  
>    复数主语 passengers 应使用 were。
>
> 2. **pilot were → pilot was**  
>    单数主语 pilot 应使用 was。
>
> **正确句子**
>
> The passengers were frightened and the pilot was calm.

### 案例 4：保留高度和航向

**用户输入（ASR 转写）**

> We was maintaining FL180 on heading 270.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **We was → We were**  
>    主语 We 应使用 were。
>
> **正确句子**
>
> We were maintaining FL180 on heading 270.

### 案例 5：保留呼号

**用户输入（ASR 转写）**

> Speedbird 123 have requested descent.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **Speedbird 123 have → Speedbird 123 has**  
>    该呼号指一架航空器，应使用 has。
>
> **正确句子**
>
> Speedbird 123 has requested descent.

### 案例 6：保留不确定性

**用户输入（ASR 转写）**

> I think the engine may has a problem.

**用户完整看到的结果**

> **语法纠错**
>
> 1. **may has → may have**  
>    情态动词 may 后应使用动词原形。
>
> **正确句子**
>
> I think the engine may have a problem.

### 案例 7：没有语法错误

**用户输入（ASR 转写）**

> We were unable to maintain altitude.

**用户完整看到的结果**

> **语法纠错**
>
> 未发现明确语法问题。
>
> **正确句子**
>
> We were unable to maintain altitude.

### 案例 8：正确但可以进一步润色

**用户输入（ASR 转写）**

> I told ATC about the turbulence.

**用户完整看到的结果**

> **语法纠错**
>
> 未发现明确语法问题。
>
> **正确句子**
>
> I told ATC about the turbulence.
