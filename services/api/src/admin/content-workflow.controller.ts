import type { FastifyReply } from 'fastify';
import { ContentPreviewStorageService } from './content-preview-storage.service';
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { RequireAdminAuthGuard } from './admin-auth.guard';
import { AdminRoleGuard, OpsRoles } from './admin-role.guard';
import type { OpsAuthenticatedRequest } from './admin.types';
import { ContentWorkflowService } from './content-workflow.service';
const input=z.object({kind:z.enum(['opi','article','questions']),text:z.string().trim().min(1).max(200000),examDate:z.iso.date().optional(),center:z.string().trim().min(1).max(100).optional(),attachments:z.array(z.object({name:z.string().max(160),data:z.string().max(7_000_000)})).max(5).optional()}).refine(v=>v.kind!=='opi'||Boolean(v.examDate&&v.center));
const attachmentsSchema=z.array(z.object({name:z.string().max(160),data:z.string().max(7_000_000)})).max(5).optional();
const revisionSchema=z.object({revision:z.number().int().positive()});
function parse<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new BadRequestException('invalid_content_order_request');return result.data;}
@Controller('v1/admin/content-orders')
@UseGuards(RequireAdminAuthGuard,AdminRoleGuard)
export class ContentWorkflowController {
  constructor(private readonly workflow:ContentWorkflowService,private readonly storage:ContentPreviewStorageService) {}
  @Get() async list(@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.list()};}
  @Get('sources') @OpsRoles('admin') async sources(@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.sources()};}
  @Get(':id/attachments/:attachmentId') async attachment(@Param('id') id:string,@Param('attachmentId') attachmentId:string,@Res() reply:FastifyReply) {
    const file=await this.workflow.attachment(parse(z.uuid(),id),parse(z.uuid(),attachmentId));
    return reply.header('cache-control','no-store').header('x-content-type-options','nosniff').header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`).type(file.mimeType).send(Buffer.from(file.data,'base64'));
  }
  @Post(':id/start') @OpsRoles('admin') async start(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema,body);return {requestId:r.id,data:await this.workflow.transition(parse(z.uuid(),id),v.revision,'processing','',r)};}
  @Post(':id/return') @OpsRoles('admin') async returnOrder(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema.extend({note:z.string().trim().min(1).max(2000)}),body);return {requestId:r.id,data:await this.workflow.transition(parse(z.uuid(),id),v.revision,'pending',v.note,r)};}
  @Get(':id/preview-cards') async previewCards(@Param('id') id:string,@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.previewCards(parse(z.uuid(),id))};}
  @Get(':id/verification') async verification(@Param('id') id:string,@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.verifyPublished(parse(z.uuid(),id))};}
  @Get(':id/resource') async resource(@Param('id') id:string,@Query('path') path:string,@Res() reply:FastifyReply) {
    const row=await this.workflow.previewResource(parse(z.uuid(),id),parse(z.string().max(2000),path));
    const bytes=await this.storage.read(row);return reply.header('cache-control','no-store').type(row.mimeType).send(bytes);
  }
  @Get(':id') async get(@Param('id') id:string,@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.get(parse(z.uuid(),id))};}
  @Post() async create(@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){return {requestId:r.id,data:await this.workflow.create(parse(input,body),r)};}
  @Post(':id/append') async append(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema.extend({text:z.string().trim().min(1).max(200000),attachments:attachmentsSchema}),body);return {requestId:r.id,data:await this.workflow.append(parse(z.uuid(),id),v.revision,v.text,r,v.attachments)};}
  @Post(':id/prepare') @OpsRoles('admin') async prepare(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema.extend({draft:z.unknown()}),body);return {requestId:r.id,data:await this.workflow.stage(parse(z.uuid(),id),v.revision,v.draft,r)};}
  @Post(':id/exclude') @OpsRoles('admin') async exclude(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema.extend({index:z.number().int().nonnegative()}),body);return {requestId:r.id,data:await this.workflow.exclude(parse(z.uuid(),id),v.revision,v.index,r)};}
  @Post(':id/publish') @OpsRoles('admin') async publish(@Param('id') id:string,@Body() body:unknown,@Req() r:OpsAuthenticatedRequest){const v=parse(revisionSchema,body);return {requestId:r.id,data:await this.workflow.publish(parse(z.uuid(),id),v.revision,r)};}
}
