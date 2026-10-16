import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
/** Read-only preview of an already registered resource, never an arbitrary URL. */
@Injectable()
export class ContentPreviewStorageService {
  constructor(@Inject(OPS_API_CONFIG) private readonly config:OpsApiConfig) {}
  async read(resource:{storageBucket:string;objectKey:string;checksum:string;sizeBytes:number;mimeType:string}) {
    const {opsFeedbackStorageUrl:base,opsFeedbackStorageReadToken:token}=this.config;
    if(!base||!token||resource.storageBucket!=='question-bank-assets'||!['audio/mpeg','image/jpeg','image/png'].includes(resource.mimeType)||resource.sizeBytes>52428800) throw new ServiceUnavailableException('content_preview_unavailable');
    const response=await fetch(`${base.replace(/\/$/,'')}/object/authenticated/${resource.storageBucket}/${resource.objectKey.split('/').map(encodeURIComponent).join('/')}`,{headers:{authorization:`Bearer ${token}`,apikey:token},signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok||!response.body) throw new ServiceUnavailableException('content_preview_read_failed');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try { while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>resource.sizeBytes)throw new Error('content_preview_size_mismatch');chunks.push(next.value);} }
    finally {await reader.cancel().catch(()=>undefined);}
    const bytes=Buffer.concat(chunks);
    if(bytes.length!==resource.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==resource.checksum) throw new ServiceUnavailableException('content_preview_checksum_mismatch');
    return bytes;
  }
}
