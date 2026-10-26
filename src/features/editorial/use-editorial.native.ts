import type { EditorialArticle, EditorialArticleSummary } from '@icao/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  loadEditorialArticle,
  loadResourceEditorial,
  resolveEditorialCover,
  type EditorialLoadSource,
} from './repository';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; value: T; source: EditorialLoadSource; warning: boolean };

export function useResourceEditorial() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState<(EditorialArticleSummary & { coverUrl?: string })[]>>({ status: 'loading' });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ status: 'loading' });
    void loadResourceEditorial()
      .then(async (result) => {
        if (!active) return;
        const items = result.data.items;
        setState(items.length === 0
          ? { status: 'empty' }
          : { status: 'ready', value: items, source: result.source, warning: Boolean(result.warning) });
        // Text is usable immediately; slow cover signing must not gate the list.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
          while (active && next < items.length) {
            const index = next++;
            const coverUrl = await resolveEditorialCover(items[index]).catch(() => undefined);
            if (!active || !coverUrl) continue;
            setState(current => current.status === 'ready'
              ? { ...current, value: current.value.map((item, i) => i === index ? { ...item, coverUrl } : item) }
              : current);
          }
        }));
      })
      .catch(() => {
        if (active) setState({ status: 'error', retry });
      });
    return () => {
      active = false;
    };
    // A retry invalidates the focused loader even when its inputs stay unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, retry]));
  return state;
}

export function useEditorialArticle(slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState<EditorialArticle & { coverUrl?: string }>>({ status: 'loading' });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void loadEditorialArticle(slug)
      .then(async (result) => {
        if (!active) return;
        if (!result) {
          setState({ status: 'empty' });
          return;
        }
        setState({
          status: 'ready', value: result.data.article,
          source: result.source, warning: Boolean(result.warning),
        });
        const coverUrl = await resolveEditorialCover(result.data.article).catch(() => undefined);
        if (active && coverUrl) {
          setState(current => current.status === 'ready'
            ? { ...current, value: { ...current.value, coverUrl } } : current);
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error', retry });
      });
    return () => {
      active = false;
    };
  }, [attempt, retry, slug]);
  return state;
}
