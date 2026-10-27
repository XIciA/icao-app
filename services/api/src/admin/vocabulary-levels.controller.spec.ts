import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { VocabularyAdminController } from './vocabulary-admin.controller';
import { VocabularyAdminService } from './vocabulary-admin.service';
import { VocabularyAudioService } from './vocabulary-audio.service';
import { ContentPreviewStorageService } from './content-preview-storage.service';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard } from './admin-role.guard';
import type { OpsAuthenticatedRequest } from './admin.types';
let app:NestFastifyApplication;
const service={previewLevels:vi.fn().mockResolvedValue({changes:[]}),publishLevels:vi.fn().mockResolvedValue({publishedVersion:6}),history:vi.fn().mockResolvedValue({items:[],nextCursor:null}),historyDetail:vi.fn().mockResolvedValue({version:5})};
beforeAll(async()=>{
  const module=await Test.createTestingModule({controllers:[VocabularyAdminController],providers:[AdminRoleGuard,{provide:VocabularyAdminService,useValue:service},{provide:VocabularyAudioService,useValue:{}},{provide:ContentPreviewStorageService,useValue:{}}]}).overrideGuard(RequireAdminAuthGuard).useValue({canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<OpsAuthenticatedRequest>();const role=request.headers['x-test-role'];if(!role)throw new UnauthorizedException();request.opsStaff={id:'9d8a1434-bd27-4356-a85d-03d58b121b08',role} as OpsAuthenticatedRequest['opsStaff'];return true;}}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({logger:false}));await app.init();await app.getHttpAdapter().getInstance().ready();
});
afterAll(async()=>app.close());
it('uses the existing admin-only gate for both batch publication and history',async()=>{
  for(const url of ['/v1/admin/vocabulary/history','/v1/admin/vocabulary/history/5']){
    expect((await app.inject({method:'GET',url})).statusCode).toBe(401);
    expect((await app.inject({method:'GET',url,headers:{'x-test-role':'support'}})).statusCode).toBe(403);
    expect((await app.inject({method:'GET',url,headers:{'x-test-role':'admin'}})).statusCode).toBe(200);
  }
  expect((await app.inject({method:'POST',url:'/v1/admin/vocabulary/levels/publish',headers:{'x-test-role':'support'},payload:{}})).statusCode).toBe(403);
});
it('accepts a large ID-and-target batch and rejects invalid targets, unbounded arrays and bad history filters',async()=>{
  const headers={'x-test-role':'admin'},url='/v1/admin/vocabulary/levels/preview';
  const moves=Array.from({length:110},(_,i)=>({id:`word-${i}`,bookId:'preview',meaning:'must never reach publication'}));
  expect((await app.inject({method:'POST',url,headers,payload:{baseVersion:5,moves}})).statusCode).toBe(201);
  expect(service.previewLevels.mock.calls.at(-1)?.[1][0]).toEqual({id:'word-0',bookId:'preview'});
  for(const payload of [{baseVersion:5,moves:[{id:'word',bookId:'other'}]},{baseVersion:5,moves:[]},{baseVersion:5,moves:Array.from({length:5001},(_,i)=>({id:`word-${i}`,bookId:'icao4'}))}])expect((await app.inject({method:'POST',url,headers,payload})).statusCode).toBe(400);
  expect((await app.inject({method:'GET',url:'/v1/admin/vocabulary/history?from=invalid',headers})).statusCode).toBe(400);
  expect((await app.inject({method:'GET',url:'/v1/admin/vocabulary/history/not-a-version',headers})).statusCode).toBe(400);
});
it('exposes the new paths through the existing local console without widening unrelated routes',()=>{
  const source=readFileSync('src/main-local-ops.ts','utf8');
  const literal=source.match(/const allowed=(\/.*\/);/)![1]!;
  const allowed=new RegExp(literal.slice(1,-1));
  for(const route of ['/v1/admin/vocabulary/levels/preview','/v1/admin/vocabulary/levels/publish','/v1/admin/vocabulary/history?word=gear','/v1/admin/vocabulary/history/5'])expect(allowed.test(route)).toBe(true);
  for(const route of ['/v1/admin/vocabulary/levels/delete','/v1/admin/vocabulary/history/5/delete','/v1/account','/v1/admin/auth/login'])expect(allowed.test(route)).toBe(false);
});
