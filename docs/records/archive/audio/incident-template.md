# Audio Recording Incident: Short Description

> 历史模板：录音故障现在直接维护在唯一排障文档，不再以此创建现行文件。

状态：调查中

日期：YYYY-MM-DD

## User-visible symptoms

-

## Environment

- App display version:
- Native build:
- Commit or reviewed file set:
- Platform/device/OS:
- Build type:
- Runtime endpoints:
- Account/auth state:

## Reproduction

1.

Expected:

Actual:

## Evidence

记录诊断事件、文件元数据、状态转换、接口错误码、构建和设备证据。不得记录录音内容、转写内容、URI、令牌或用户身份信息。

## Root cause

说明根因所在阶段、违反的不变量和完整因果链。

## Rejected hypotheses

| Hypothesis | Evidence that rejected it |
| --- | --- |
|  |  |

## Long-term fix

- Shared owner/source of truth reused:
- Implementation change:
- Restored invariant:
- Regression test:
- Static or release gate:

## Verification

- [ ] Targeted unit/integration tests
- [ ] `pnpm check:audio`
- [ ] `pnpm check`
- [ ] Native Development Build
- [ ] Platform fingerprint
- [ ] Standalone Release runtime verification
- [ ] Physical-device microphone → playback → transcription

## Remaining risks

-

## Follow-up

- Owner:
- Required evidence:
- Completion condition:
