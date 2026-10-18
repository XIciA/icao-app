import { describe, expect, it } from 'vitest';
import { attachmentMetadata, prepareAttachments } from '../src/admin/content-attachments';
describe('private content source attachments',()=>{
  it('round trips Unicode source material without exposing its body in metadata',()=>{
    const [file]=prepareAttachments([{name:'考试反馈.txt',data:Buffer.from('中文反馈').toString('base64')}]);
    expect(file?.mimeType).toBe('text/plain');expect(file?.size).toBe(12);
    expect(attachmentMetadata([file])[0]).not.toHaveProperty('data');
  });
  it('rejects mismatched file formats, unsafe names, malformed base64 and oversized sources',()=>{
    for(const input of [{name:'fake.png',data:Buffer.from('not an image').toString('base64')},{name:'../source.txt',data:'YQ=='},{name:'source.txt',data:'!YQ=='},{name:'source.txt',data:Buffer.alloc(5*1024*1024+1,65).toString('base64')}])expect(()=>prepareAttachments([input])).toThrow();
    expect(()=>prepareAttachments(Array.from({length:6},()=>({name:'source.txt',data:'YQ=='})))).toThrow();
  });
});
