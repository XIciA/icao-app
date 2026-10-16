import { Alert } from 'react-native';
import { speakVocabulary, speakVocabularyWithFeedback, stopVocabularySpeech } from '../speech.native';
const mockResolve=jest.fn();const mockAcquire=jest.fn(async()=>({owner:'wordSpeech',token:1}));
const mockPlayers:{play:jest.Mock;pause:jest.Mock;remove:jest.Mock;listener?:(mockStatus:unknown)=>void}[]=[];
let mockDeactivate:()=>void;
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha'},digestStringAsync:async(_kind:string,text:string)=>`hash-${text}`}));
jest.mock('@/features/question-bank/platform/resource-service',()=>({resolveRemoteQuestionBankAsset:(...args:unknown[])=>mockResolve(...args)}));
jest.mock('@/platform/audio',()=>({audioSessionOrchestrator:{register:(_owner:string,client:{deactivate:()=>void})=>{mockDeactivate=client.deactivate;},acquire:()=>mockAcquire(),release:async()=>undefined},createSessionManagedAudioPlayer:()=>{
 const player={isLoaded:true,play:jest.fn(),pause:jest.fn(),remove:jest.fn(),listener:undefined as ((mockStatus:unknown)=>void)|undefined,addListener:(_name:string,callback:(mockStatus:unknown)=>void)=>{player.listener=callback;return {remove:jest.fn()};}};mockPlayers.push(player);return player;
}}));
const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>undefined);
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(async()=>{await stopVocabularySpeech();mockPlayers.length=0;mockResolve.mockReset().mockResolvedValue('https://signed.test/file.mp3');mockAcquire.mockClear();alert.mockClear();});
afterEach(async()=>{await stopVocabularySpeech();});
it('plays normalized word and example as separate fixed files in order',async()=>{const done=speakVocabulary('air/ground','Report your position.');await flush();expect(mockResolve.mock.calls[0][0]).toBe('/pronunciation-assets/hash-air or ground.mp3');expect(mockPlayers[0].play).toHaveBeenCalled();mockPlayers[0].listener?.({didJustFinish:true});await flush();expect(mockResolve.mock.calls[1][0]).toBe('/pronunciation-assets/hash-Report your position..mp3');mockPlayers[1].listener?.({didJustFinish:true});await expect(done).resolves.toBe(true);});
it('stops on navigation without starting a stale example or reporting cancellation as an error',async()=>{const done=speakVocabularyWithFeedback('aircraft','Example.');await flush();await stopVocabularySpeech();mockPlayers[0].listener?.({didJustFinish:true});await expect(done).resolves.toBe(false);expect(mockPlayers).toHaveLength(1);expect(mockPlayers[0].pause).toHaveBeenCalled();expect(alert).not.toHaveBeenCalled();});
it('a different audio owner cancels word playback before switching',async()=>{const done=speakVocabulary('runway');await flush();mockDeactivate();await expect(done).resolves.toBe(false);expect(mockPlayers[0].pause).toHaveBeenCalled();});
it('does not start a file after a newer pronunciation supersedes its pending resolution',async()=>{let resolve!:(uri:string)=>void;mockResolve.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const old=speakVocabulary('old');await flush();const current=speakVocabulary('new');await flush();resolve('https://signed.test/old.mp3');await expect(old).resolves.toBe(false);expect(mockPlayers).toHaveLength(1);mockPlayers[0].listener?.({didJustFinish:true});await expect(current).resolves.toBe(true);});
it('reports a real missing resource and never substitutes runtime synthesis',async()=>{mockResolve.mockRejectedValueOnce(new Error('resource_not_found'));await expect(speakVocabularyWithFeedback('missing')).resolves.toBe(false);expect(mockPlayers).toHaveLength(0);expect(alert).toHaveBeenCalledTimes(1);});
it('cannot overlap recording when ownership is refused',async()=>{mockAcquire.mockRejectedValueOnce(new Error('recording_exclusive'));await expect(speakVocabulary('runway')).resolves.toBe(false);expect(mockPlayers[0].play).not.toHaveBeenCalled();expect(mockPlayers[0].remove).toHaveBeenCalled();});
