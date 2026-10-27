import { BadRequestException, Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import type { OpsAuthenticatedRequest } from './admin.types';
import { VocabularyAdminService } from './vocabulary-admin.service';
import { VocabularyAudioService } from './vocabulary-audio.service';
import { ContentPreviewStorageService } from './content-preview-storage.service';
const text=z.string().trim().min(1).max(3000).refine(value=>!/[\r\n\t<>]/u.test(value));
const word=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),bookId:z.enum(['preview','icao4','icao5']),level:z.union([z.literal(1),z.literal(2),z.literal(3)]),word:text,meaning:text,example:text,exampleTranslation:text,pronunciationText:text,relatedExpressions:z.array(text.max(299)).max(30).optional(),source:z.object({name:text,rowIndex:z.number().int().nonnegative(),sourceNo:z.union([z.string(),z.number()])})});
const edit=z.discriminatedUnion('type',[z.object({type:z.literal('upsert'),word}),z.object({type:z.literal('delete'),id:text}),z.object({type:z.literal('merge'),sourceIds:z.array(text).min(1).max(100),targetId:text}),z.object({type:z.literal('split'),id:text,words:z.array(word).min(2).max(20)})]);
const preview=z.object({baseVersion:z.number().int().positive(),edits:z.array(edit).min(1).max(100)});
function parse<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new BadRequestException('invalid_vocabulary_admin_request');return result.data;}
@Controller('v1/admin/vocabulary')
@UseGuards(RequireAdminAuthGuard,AdminRoleGuard)
@OpsRoles('admin')
export class VocabularyAdminController {
  constructor(private readonly vocabulary:VocabularyAdminService,private readonly audio:VocabularyAudioService,private readonly storage:ContentPreviewStorageService) {}
  @Get() async get(@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.vocabulary.read()};}
  @Post('preview') async preview(@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(preview,body);return {requestId:r.id,data:await this.vocabulary.preview(v.baseVersion,v.edits)};}
  @Post('publish') async publish(@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(preview.extend({checksum:z.string().regex(/^[a-f0-9]{64}$/)}),body);return {requestId:r.id,data:await this.vocabulary.publish(v.baseVersion,v.edits,v.checksum,r)};}
  @Post('audio') async upload(@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(z.object({text,data:z.string().max(6_700_000)}),body);return {requestId:r.id,data:await this.audio.upload(v.text,v.data,r)};}
  @Get('audio') async play(@Query('text') value:unknown,@Res() reply:FastifyReply){const resource=await this.audio.resource(parse(text,value));return reply.header('cache-control','no-store').type('audio/mpeg').send(await this.storage.read(resource));}
}
