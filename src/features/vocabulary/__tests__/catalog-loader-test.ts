import Storage from '@/platform/storage';
import { apiFetch } from '@/platform/api-client';
import catalog from '../../../../content/vocabulary/three-books/dataset.json';
import oldCatalog from '../../../../content/vocabulary/dataset.json';
import { loadVocabulary } from '../catalog-loader';

jest.mock('@/platform/api-client',()=>({getApiBaseUrl:()=> 'https://test.invalid',apiFetch:jest.fn()}));
jest.mock('@/platform/storage',()=>({__esModule:true,default:{getItem:jest.fn(),setItem:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();jest.mocked(Storage.getItem).mockResolvedValue(null);jest.mocked(Storage.setItem).mockResolvedValue();});

it('loads the same three-book catalog on every current platform and rejects old server responses',async()=>{
  jest.mocked(apiFetch).mockResolvedValue({ok:true,status:200,json:async()=>({data:{version:3,checksum:'a'.repeat(64),dataset:catalog}})} as Response);
  expect((await loadVocabulary()).dataset.books.map(b=>b.id)).toEqual(['preview','icao4','icao5']);
  expect(apiFetch).toHaveBeenCalledWith('/v1/vocabulary?catalog=three-books-v3',expect.anything());
  jest.mocked(Storage.getItem).mockResolvedValue(null);
  jest.mocked(apiFetch).mockResolvedValue({ok:true,status:200,json:async()=>({data:{version:1,checksum:'b'.repeat(64),dataset:oldCatalog}})} as Response);
  await expect(loadVocabulary()).rejects.toThrow('vocabulary_catalog_upgrade_required');
});

it('uses the new cached catalog offline without exposing the obsolete fourth book or deleting learning data',async()=>{
  const cached={version:3,checksum:'a'.repeat(64),dataset:catalog};
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(cached));
  jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));
  expect(await loadVocabulary()).toMatchObject({dataset:catalog,source:'cache',warning:'vocabulary_remote_unavailable'});
  expect(Storage.setItem).not.toHaveBeenCalled();
});
