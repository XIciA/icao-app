import { useCallback, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppModalHostContext } from './modal-host-context';

export function ModalHost({ children }: PropsWithChildren) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const captureHost = useCallback((node: View | null) => {
    setHost(node as unknown as HTMLElement | null);
  }, []);

  return (
    <AppModalHostContext.Provider value={host}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" ref={captureHost} style={styles.host} />
      </View>
    </AppModalHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  host: { ...StyleSheet.absoluteFillObject, zIndex: 1_000 },
});
