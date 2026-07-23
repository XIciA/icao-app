import type { EditorialArticle, EditorialArticleSummary } from '@icao/contracts';
import { useCallback, useEffect, useState } from 'react';

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
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void loadResourceEditorial()
      .then(async (result) => {
        const items = await Promise.all(result.data.items.map(async (item) => ({
          ...item,
          coverUrl: await resolveEditorialCover(item).catch(() => undefined),
        })));
        if (!active) return;
        setState(items.length === 0
          ? { status: 'empty' }
          : { status: 'ready', value: items, source: result.source, warning: Boolean(result.warning) });
      })
      .catch(() => {
        if (active) setState({ status: 'error', retry });
      });
    return () => {
      active = false;
    };
  }, [attempt, retry]);
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
        const coverUrl = await resolveEditorialCover(result.data.article).catch(() => undefined);
        if (active) {
          setState({
            status: 'ready',
            value: { ...result.data.article, coverUrl },
            source: result.source,
            warning: Boolean(result.warning),
          });
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
