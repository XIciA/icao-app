import { useEffect, useRef, useState } from 'react';
import Storage from '@/platform/storage';
import { VOCABULARY_ORDER_KEY, type VocabularyStudyOrder } from './study-order';

export function useStudyOrder() {
  const [order, setOrder] = useState<VocabularyStudyOrder>('frequency');
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void Storage.getItem(VOCABULARY_ORDER_KEY).then(value => {
      if (active && !changed.current && (value === 'frequency' || value === 'random')) setOrder(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const chooseOrder = (value: VocabularyStudyOrder) => {
    changed.current = true;
    setOrder(value);
    writes.current = writes.current.catch(() => undefined).then(() => Storage.setItem(VOCABULARY_ORDER_KEY, value));
    void writes.current.catch(() => undefined);
  };
  return { order, chooseOrder };
}
