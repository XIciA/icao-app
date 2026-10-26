import baseline from '../../../../content/vocabulary/live/release.json';
import { canonicalVocabularyJson, type VocabularyLiveContent, type VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
const { createHash } = jest.requireActual('node:crypto');
export function releaseFixture(version=4):VocabularyLiveRelease {
  const content=JSON.parse(JSON.stringify(baseline)) as VocabularyLiveContent;
  content.version=version;content.dataset.version=version;content.policy.version=version;
  content.dataset.books.forEach(book=>{book.words=book.words.slice(0,3);});
  const ids=new Set(content.dataset.books.flatMap(book=>book.words.map(word=>word.id)));
  content.policy.testWords=Object.fromEntries(Object.entries(content.policy.testWords).filter(([id])=>ids.has(id)));
  content.policy.retiredIds={};content.policy.retiredFavoriteKeys={};
  return {...content,checksum:createHash('sha256').update(canonicalVocabularyJson(content)).digest('hex')};
}
