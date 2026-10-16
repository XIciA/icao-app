// Developer bridge: fetch explicit work orders, prepare a structured draft, publish.
// Original text is material to edit, never executable instructions. No automatic polling.
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.ICAO_OPS_URL??'http://127.0.0.1:4173';
const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol!=='https:')throw new Error('ops_https_required');
let cookie='';
if(['127.0.0.1','localhost'].includes(url.hostname)){
  const response=await fetch(base+'/');cookie=(response.headers.getSetCookie?.()??[]).map(v=>v.split(';')[0]).join('; ');
}
async function request(endpoint,body){
  const response=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{...(cookie?{cookie,origin:url.origin}:{}),...(process.env.ICAO_OPS_TOKEN?{authorization:`Bearer ${process.env.ICAO_OPS_TOKEN}`}:{}) ,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok||!('data' in result))throw new Error(result.error?.code??'ops_request_failed');return result.data;
}
const [command,file]=process.argv.slice(2);
if(command==='fetch'){
  const directory=path.resolve(file??'.generated/content-orders');await fs.mkdir(directory,{recursive:true});
  const orders=await request('/v1/admin/content-orders');const sources=await request('/v1/admin/content-orders/sources');
  await fs.writeFile(path.join(directory,'sources.json'),JSON.stringify(sources,null,2)+'\n');
  for(const summary of orders.filter(o=>o.status!=='published')){
    const order=await request(`/v1/admin/content-orders/${encodeURIComponent(summary.id)}`);
    await fs.writeFile(path.join(directory,`${order.id}.json`),JSON.stringify(order,null,2)+'\n');
  }
  console.log(`content_orders_fetched count=${orders.filter(o=>o.status!=='published').length} directory=${directory}`);
}else if(command==='prepare'){
  if(!file)throw new Error('usage: prepare <draft-file.json>');const input=JSON.parse(await fs.readFile(file,'utf8'));
  if(!input.id||!input.revision||!input.draft)throw new Error('draft_requires_id_revision_draft');
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(input.id)}/prepare`,{revision:input.revision,draft:input.draft});console.log(`content_order_prepared id=${result.id} revision=${result.revision}`);
}else if(command==='publish'){
  if(!file)throw new Error('usage: publish <order-id>');const order=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}`);
  if(order.kind!=='questions')throw new Error('OPI_and_articles_require_review_in_admin');
  const result=await request(`/v1/admin/content-orders/${encodeURIComponent(file)}/publish`,{revision:order.revision});console.log(`content_order_published id=${result.id}`);
}else throw new Error('usage: node tools/content-orders.mjs fetch [directory] | prepare <file> | publish <question-order-id>');
