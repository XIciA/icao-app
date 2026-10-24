import type { LegalConsentStatus } from '@icao/contracts/app-content';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button, Screen } from '@/components/ui';
import { ApiClientError } from '@/platform/api-client';
import { colors, spacing } from '@/theme';
import { acceptLegalDocuments, getLegalConsentStatus } from './legal-consent.native';
import { LegalDocumentBody } from './LegalDocumentBody.native';

type Props = {
  accountId?: string;
  status?: LegalConsentStatus;
  onStatus(status: LegalConsentStatus): void;
  onSignOut(): Promise<void>;
};

export function LegalConsentGate({ accountId, status, onStatus, onSignOut }: Props) {
  const pathname = usePathname();
  const [document, setDocument] = useState<'agreement' | 'privacy'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actionRef = useRef(false);
  const initialCheckAccount = useRef<string | undefined>(undefined);
  const visible = !!accountId && status?.accountId === accountId && status.required;
  const safeToCheck = ['/', '/profile', '/discover', '/account/settings'].includes(pathname);

  useEffect(() => { setDocument(undefined); setError(''); }, [accountId, status?.agreement.version, status?.privacy.version]);
  useEffect(() => {
    if (!accountId || !safeToCheck || visible) return;
    let active = true;
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const next = await getLegalConsentStatus(accountId!);
        // A late background response cannot open a modal after the user starts a question or recording.
        if (active) onStatus(next);
      } catch { /* Keep the last confirmed state; recheck on the next safe entry or foreground. */ }
      finally { checking = false; }
    }
    if (initialCheckAccount.current !== accountId) initialCheckAccount.current = accountId;
    else void check();
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => { active = false; foreground.remove(); };
  }, [accountId, onStatus, pathname, safeToCheck, visible]);

  async function confirm() {
    if (!status || !visible || actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError('');
    try {
      const receipt = await acceptLegalDocuments(status.accountId, status);
      onStatus({ ...status, required: false, receipt });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'legal_version_changed') {
        try { onStatus(await getLegalConsentStatus(status.accountId)); }
        catch { /* Retain the exact currently displayed documents until a refresh succeeds. */ }
        setError('协议有新的更新，请查看后再次确认。');
      } else setError('暂时无法保存确认，请检查网络后重试。');
    } finally { actionRef.current = false; setBusy(false); }
  }

  async function decline() {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError('');
    try { await onSignOut(); }
    catch { setError('退出未完成，请重试。'); }
    finally { actionRef.current = false; setBusy(false); }
  }

  if (!visible || !status) return null;
  return <AppModal animationType="fade" presentationStyle="fullScreen" visible onRequestClose={() => { if (!busy && document) setDocument(undefined); }}>
    <Screen contentStyle={styles.screen} scroll header={document ? <TopBar onBack={() => setDocument(undefined)} title={status[document].title} /> : undefined}>
      {document ? <>
        <LegalDocumentBody document={status[document]} />
      </> : <View style={styles.content}>
        <AppText variant="pageTitle">{status.receipt ? '协议已更新' : '确认用户协议'}</AppText>
        <AppText>{status.receipt
          ? '请查看以下更新，确认后继续使用。'
          : '请阅读并同意用户协议与隐私政策后继续使用。'}</AppText>
        {[...new Set([status.agreement.changeSummary, status.privacy.changeSummary].filter(Boolean))].map((summary) =>
          <AppText key={summary} variant="caption">{summary}</AppText>)}
        <Button onPress={() => setDocument('agreement')} variant="outline">查看用户协议</Button>
        <Button onPress={() => setDocument('privacy')} variant="outline">查看隐私政策</Button>
        {error ? <AppText accessibilityRole="alert" color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={busy} loading={busy} onPress={() => void confirm()}>同意并继续</Button>
        <Button disabled={busy} onPress={() => void decline()} variant="ghost">不同意，退出登录</Button>
      </View>}
    </Screen>
  </AppModal>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { gap: spacing[5], padding: spacing[5], paddingTop: spacing[10], paddingBottom: spacing[10] },
});
