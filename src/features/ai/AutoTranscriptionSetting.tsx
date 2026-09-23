import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors, spacing } from '@/theme';
import { acceptAiConsent, hasAiConsent } from './ai-client.native';
import { autoTranscriptionAcknowledged, autoTranscriptionEnabled, autoTranscriptionOwnerKey, setAutoTranscriptionEnabled } from './auto-transcription.native';

export function AutoTranscriptionSetting() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void autoTranscriptionEnabled().then((value) => { if (active) setEnabled(value); }); return () => { active = false; }; }, []);
  async function change(value: boolean, accepted = false) {
    if (busy) return;
    const owner = autoTranscriptionOwnerKey();
    setBusy(true); setError('');
    try {
      if (value) {
        const consent = await hasAiConsent();
        if (!accepted && (!consent || !await autoTranscriptionAcknowledged())) { setConfirm(true); return; }
        if (!consent) await acceptAiConsent();
      }
      await setAutoTranscriptionEnabled(value, owner);
      setEnabled(value); setConfirm(false);
    } catch { setError('设置未保存，请检查登录和网络后重试。'); }
    finally { setBusy(false); }
  }
  return <>
    <View style={{ padding: spacing[3], gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="button">录音后自动转写</AppText>
        <Switch accessibilityLabel="录音后自动转写" disabled={busy} value={enabled} onValueChange={(value) => { void change(value); }} />
      </View>
      <AppText variant="micro">{enabled ? '新录音结束后自动上传并转写，消耗转写额度；AI评分仍需手动点击。' : '默认关闭。点击 AI评分后，完成必要的转写与分析。'} 此设置仅用于当前设备的当前账号。</AppText>
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
    </View>
    <BottomSheet visible={confirm} onClose={() => { if (!busy) setConfirm(false); }}>
      <View style={{ gap: spacing[3] }}>
        <AppText variant="sectionTitle">开启录音后自动转写</AppText>
        <AppText>开启后，普通学习中新完成的录音会经服务器发送给腾讯云语音识别。暂存录音处理后删除，异常残留最长保留 24 小时。</AppText>
        <AppText>主动点击 AI评分时，回答文字及必要题目材料会发送给 DeepSeek 进行学习分析。回答和结果可随学习记录同步。你可随时关闭自动转写，或在“隐私与数据”撤回 AI 数据处理同意。</AppText>
        <Button disabled={busy} onPress={() => { void change(true, true); }}>同意并开启</Button>
        <Button disabled={busy} variant="outline" onPress={() => setConfirm(false)}>暂不开启</Button>
      </View>
    </BottomSheet>
  </>;
}
