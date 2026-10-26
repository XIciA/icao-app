import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuestionAnnotations } from '../question-bank/annotations/use-question-annotations';
import { emptyRadioQueueFilter, filterRadioCatalogs, hasRadioQueueFilter, matchingRadioAnnotations, type RadioQueueFilter } from './queue-filter';
import type { RadioCatalog } from './types';

export function useRadioQueueFilter(source: RadioCatalog[], owner: string) {
  const annotations = useQuestionAnnotations();
  const [selection, setSelection] = useState({ owner, filter: emptyRadioQueueFilter });
  useLayoutEffect(() => { setSelection(previous => previous.owner === owner ? previous : { owner, filter: emptyRadioQueueFilter }); }, [owner]);
  const filter = selection.owner === owner ? selection.filter : emptyRadioQueueFilter;
  const matches = useMemo(() => hasRadioQueueFilter(filter) ? matchingRadioAnnotations(annotations.store, filter) : undefined, [annotations.store, filter]);
  const matchesRef = useRef(matches); matchesRef.current = matches;
  const project = useCallback((catalogs: RadioCatalog[]) => filterRadioCatalogs(catalogs, matchesRef.current), []);
  const catalogs = useMemo(() => filterRadioCatalogs(source, matches), [source, matches]);
  const setFilter = useCallback((next: RadioQueueFilter) => setSelection({ owner, filter: next }), [owner]);
  // Only changes to included question identities invalidate prepared audio, not text hydration.
  const signature = useMemo(() => matches ? JSON.stringify(catalogs.map(catalog => [catalog.bankId, catalog.tracks.map(track => track.id)])) : '', [catalogs, matches]);
  return { filter, setFilter, catalogs, project, signature, annotations };
}
