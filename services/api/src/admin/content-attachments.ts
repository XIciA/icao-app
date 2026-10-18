import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { ContentAttachment, ContentAttachmentInput } from '@icao/contracts/content-workflow';

export type StoredAttachment = ContentAttachment & { data: string };
// Source material stays private in the work order, never in public content snapshots.
export function prepareAttachments(inputs: ContentAttachmentInput[] = []): StoredAttachment[] {
  if (inputs.length > 5) throw new BadRequestException('content_attachments_too_many');
  let total = 0;
  return inputs.map(input => {
    if (!input.name || input.name.length > 160 || [...input.name].some(char=>char.charCodeAt(0)<32||char==='/'||char==='\\')) throw new BadRequestException('content_attachment_name_invalid');
    const bytes = Buffer.from(input.data, 'base64');
    total += bytes.length;
    if (!bytes.length || bytes.toString('base64') !== input.data || bytes.length > 5 * 1024 * 1024 || total > 8 * 1024 * 1024) throw new BadRequestException('content_attachment_size_invalid');
    const ext = input.name.split('.').pop()?.toLowerCase();
    const hex = bytes.subarray(0, 8).toString('hex');
    let mimeType: string | undefined;
    if (ext === 'png' && hex === '89504e470d0a1a0a') mimeType = 'image/png';
    if (['jpg','jpeg'].includes(ext ?? '') && hex.startsWith('ffd8ff')) mimeType = 'image/jpeg';
    if (ext === 'pdf' && bytes.subarray(0,5).toString() === '%PDF-') mimeType = 'application/pdf';
    if (ext === 'docx' && hex.startsWith('504b0304')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'txt' && !bytes.includes(0) && Buffer.from(bytes.toString('utf8')).equals(bytes)) mimeType = 'text/plain';
    if (!mimeType) throw new BadRequestException('content_attachment_format_invalid');
    return { id: randomUUID(), name: input.name, mimeType, size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), data: input.data };
  });
}
export function attachmentMetadata(value: unknown): ContentAttachment[] {
  return ((value ?? []) as StoredAttachment[]).map(({id,name,mimeType,size,checksum}) => ({id,name,mimeType,size,checksum}));
}
