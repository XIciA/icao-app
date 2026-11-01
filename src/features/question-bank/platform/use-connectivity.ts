import { useEffect, useState } from 'react';
import { getConnectivity, subscribeConnectivity, type Connectivity } from './network-service';
export function useConnectivity() {
  const [state, setState] = useState<Connectivity>('unknown');
  useEffect(() => {
    let active = true;
    void getConnectivity().then(value => { if (active) setState(value); });
    const unsubscribe = subscribeConnectivity(value => { if (active) setState(value); });
    return () => { active = false; unsubscribe(); };
  }, []);
  return state;
}
