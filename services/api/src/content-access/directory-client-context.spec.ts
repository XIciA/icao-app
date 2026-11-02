import Fastify from 'fastify';
import { describe,it,expect } from 'vitest';
import { registerDirectoryClientContext,directoryClient,directoryVersionForClient } from './directory-client-context';
import { retargetHotspotBrief } from '@icao/contracts/app-content';
describe('directory rollout isolation',()=>{
 it('keeps legacy and preview requests isolated, including after async work',async()=>{
  const server=Fastify();registerDirectoryClientContext(server);
  server.get('/',async()=>{
   await Promise.resolve();
   return {context:directoryClient(),oldActive:directoryVersionForClient('opi',{version:29},false),
    newActive:directoryVersionForClient('opi',{version:30,compatibility:{capability:'stable-storage-v1',fallbackVersion:29}},false),
    pinned:directoryVersionForClient('opi',{version:29},true),
    future:directoryVersionForClient('opi',{version:31},false)};
  });
  try {
   const [old,next,untrusted]=await Promise.all([
    server.inject({url:'/'}),
    server.inject({url:'/',headers:{'x-icao-directory-identity':'stable-storage-v1','x-icao-directory-preview':'opi=30'}}),
    server.inject({url:'/',headers:{'x-icao-directory-preview':'opi=30'}}),
   ]);
   expect(old.json().newActive).toBe(29);expect(old.json().oldActive).toBeUndefined();
   expect(next.json().oldActive).toBe(30);expect(next.json().newActive).toBeUndefined();
   expect(next.json().pinned).toBeUndefined();expect(next.json().future).toBeUndefined();
   expect(untrusted.json().context.preview).toEqual({});
   expect(directoryClient().stableIdentity).toBe(false);
  } finally {await server.close();}
 });
 it('retargets mixed-origin hotspots while retaining their exact cards and reported wording',()=>{
  const input={briefs:[{id:'keep',topics:[{topicId:'old',topicTitle:'old',cardIds:['a','b']}],sources:[{kind:'general',topics:[{topicId:'old',topicTitle:'old',cardIds:['a']}]}],reportedPrompts:{a:['exact wording']}}]};
  const result=retargetHotspotBrief(input,new Map([['a',{topicId:'new-a',topicTitle:'A'}],['b',{topicId:'new-b',topicTitle:'B'}]]));
  expect(result.briefs[0]?.topics.map(t=>t.topicId)).toEqual(['new-a','new-b']);
  expect(result.briefs[0]?.reportedPrompts).toEqual(input.briefs[0]?.reportedPrompts);
  expect(input.briefs[0]?.topics[0]?.topicId).toBe('old');
  expect(()=>retargetHotspotBrief(input,new Map())).toThrow('hotspot_question_unavailable');
 });
});
