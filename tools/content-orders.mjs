// Developer bridge: fetch explicit work orders, prepare a structured draft, publish.
// Original text is material to edit, never executable instructions. No automatic polling.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const [command,file]=process.argv.slice(2);
const base=process.env.ICAO_OPS_URL??'http://127.0.0.1:4173';
const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol!=='https:')throw new Error('ops_https_required');
let cookie='';
if(command!=='bind'&&['127.0.0.1','localhost'].includes(url.hostname)){
  const response=await fetch(base+'/');cookie=(response.headers.getSetCookie?.()??[]).map(v=>v.split(';')[0]).join('; ');
}
async function request(endpoint,body){
  const response=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{...(cookie?{cookie,origin:url.origin}:{}),...(process.env.ICAO_OPS_TOKEN?{authorization:`Bearer ${process.env.ICAO_OPS_TOKEN}`}:{}) ,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok||!('data' in result))throw new Error(result.error?.code??'ops_request_failed');return result.data;
}
if(command==='fetch'){
  const directory=path.resolve(file??'.generated/content-orders');await fs.mkdir(directory,{recursive:true});
  const orders=await request('/v1/admin/content-orders');const sources=await request('/v1/admin/content-orders/sources');
  await fs.writeFile(path.join(directory,'sources.json'),JSON.stringify(sources,null,2)+'\n');
  for(const summary of orders.filter(o=>o.status!=='published')){
    const order=await request(`/v1/admin/content-orders/${encodeURIComponent(summary.id)}`);
    await fs.writeFile(path.join(directory,`${order.id}.json`),JSON.stringify(order,null,2)+'\n');
    if(order.attachments?.length){
      const attachmentDirectory=path.join(directory,order.id+'-attachments');await fs.mkdir(attachmentDirectory,{recursive:true});
      for(const attachment of order.attachments){
        const response=await fetch(base+`/v1/admin/content-orders/${order.id}/attachments/${attachment.id}`,{headers:{...(cookie?{cookie}:{}),...(process.env.ICAO_OPS_TOKEN?{authorization:`Bearer ${process.env.ICAO_OPS_TOKEN}`}:{})}});
        if(!response.ok)throw new Error('attachment_download_failed');const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length!==attachment.size||createHash('sha256').update(bytes).digest('hex')!==attachment.checksum)throw new Error('attachment_integrity_failed');
        await fs.writeFile(path.join(attachmentDirectory,attachment.id+'-'+path.basename(attachment.name)),bytes);
      }
    }
  }
  console.log(`content_orders_fetched count=${orders.filter(o=>o.status!=='published').length} directory=${directory}`);
}else if(command==='sources'){
  if(!file)throw new Error('source_output_file_required');
  await fs.writeFile(file,JSON.stringify(await request('/v1/admin/content-orders/sources'),null,2)+'\n');
  console.log('content_sources_saved');
}else if(command==='bind'){
  if(!file||!process.argv[4])throw new Error('usage: bind <draft.json> <order.json>');
  const input=JSON.parse(await fs.readFile(file,'utf8')),order=JSON.parse(await fs.readFile(process.argv[4],'utf8'));
  if(order.kind!=='questions'||!input.draft?.hotspotUpdates||!order.id||!order.revision||order.status==='published')throw new Error('invalid_historical_order_binding');
  await fs.writeFile(file+'.bound.json',JSON.stringify({...input,id:order.id,revision:order.revision},null,2)+'\n');
  console.log('historical_candidate_bound');
}else if(command==='create'){
  if(!file||!process.argv[4])throw new Error('usage: create <input.json> <order-output.json>');
  const input=JSON.parse(await fs.readFile(file,'utf8'));
  const result=await request('/v1/admin/content-orders',input);
  await fs.writeFile(process.argv[4],JSON.stringify(result.order,null,2)+'\n');
  console.log(`content_order_created id=${result.order.id} revision=${result.order.revision}`);
}else if(command==='verify'){
  if(!file)throw new Error('order_id_required');
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}/verification`);
  console.log(JSON.stringify(result,null,2));if(result.problems?.length)process.exitCode=1;
}else if(command==='start'||command==='return'){
  if(!file)throw new Error('order_id_required');const order=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}`);
  const note=process.argv[4];if(command==='return'&&!note)throw new Error('return_reason_required');
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}/${command}`,{revision:order.revision,...(note?{note}:{})});
  console.log(`content_order_${command} id=${result.id} revision=${result.revision}`);
}else if(command==='prepare'){
  if(!file)throw new Error('usage: prepare <draft-file.json>');const input=JSON.parse(await fs.readFile(file,'utf8'));
  if(!input.id||!input.revision||!input.draft)throw new Error('draft_requires_id_revision_draft');
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(input.id)}/prepare`,{revision:input.revision,draft:input.draft});if(input.draft.hotspotUpdates&&!isDeepStrictEqual(result.draft?.hotspotUpdates,input.draft.hotspotUpdates))throw new Error('historical_hotspots_not_preserved_update_ops_before_publication');
  await fs.writeFile(file+'.prepared.json',JSON.stringify(result,null,2)+'\n');
  console.log(`content_order_prepared id=${result.id} revision=${result.revision}`);
}else if(command==='publish'){
  if(!file)throw new Error('usage: publish <order-id>');const order=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}`);
  if(order.kind!=='questions')throw new Error('OPI_and_articles_require_review_in_admin');
  if(order.draft?.hotspotUpdates&&!process.argv[4])throw new Error('historical_publish_requires_reviewed_prepared_file');
  if(process.argv[4]){
    const expected=JSON.parse(await fs.readFile(process.argv[4],'utf8'));
    if(expected.id!==order.id||expected.revision!==order.revision||!isDeepStrictEqual(expected.draft,order.draft))throw new Error('reviewed_order_changed_reload');
  }
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}/publish`,{revision:order.revision});console.log(`content_order_published id=${result.id}`);
}else throw new Error('usage: node tools/content-orders.mjs fetch [directory] | sources <output.json> | bind <draft.json> <order.json> | create <input.json> <order-output.json> | verify <order-id> | start <order-id> | return <order-id> <reason> | prepare <file> | publish <question-order-id> [reviewed-prepared.json]');
