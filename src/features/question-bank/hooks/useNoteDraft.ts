import { useEffect, useState } from 'react';

/** The editor owns in-flight text; storage acknowledgements must not drive typing. */
export function useNoteDraft(scope: string, savedText: string, editing: boolean, save: (text: string) => void | Promise<boolean>, saveError?: string) {
  const [draft, setDraft] = useState<{ scope: string; text: string; settled: boolean }>();
  const current = draft?.scope === scope ? draft : undefined;

  useEffect(() => {
    setDraft((value) => {
      if (value?.scope !== scope) return undefined;
      // Keep the draft across blur/save failures until storage has caught up.
      // During composition even an intermediate acknowledgement is not a reset.
      return !editing && value.settled && !saveError && value.text === savedText ? undefined : value;
    });
  }, [scope, savedText, editing, current?.settled, saveError]);

  function change(text: string) {
    const next = { scope, text, settled: false };
    setDraft(next);
    const settled = () => setDraft((value) => value === next ? { ...next, settled: true } : value);
    // The existing save error and retry UI owns persistence failures.
    void Promise.resolve(save(text)).then(settled, settled);
  }

  return { text: current?.text ?? savedText, change };
}
