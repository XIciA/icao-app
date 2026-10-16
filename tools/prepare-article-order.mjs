// Codex provides minimally corrected text; this command only structures it.
// Usage: node tools/prepare-article-order.mjs order.json edited.json output-dir
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [orderPath,editedPath,directory]=process.argv.slice(2);if(!directory)throw new Error('usage: order.json edited.json output-dir');
const order=JSON.parse(fs.readFileSync(orderPath,'utf8')),edited=JSON.parse(fs.readFileSync(editedPath,'utf8'));
if(order.kind!=='article'||!edited.title?.trim()||!Array.isArray(edited.blocks)||!edited.blocks.length)throw new Error('invalid_article_plan');
const output=path.resolve(directory);fs.mkdirSync(output,{recursive:true});const coverFile=path.join(output,'cover.png');
execFileSync('swift',[path.join(root,'tools/render-article-cover.swift'),edited.title,coverFile,path.join(root,'assets/fonts/NotoSerifSC_600SemiBold.ttf')],{stdio:'inherit'});
const bytes=fs.readFileSync(coverFile),checksum=createHash('sha256').update(bytes).digest('hex');
const key=`editorial/${checksum}/cover.png`,publicPath=`/editorial-assets/${checksum}/cover.png`;
const resource={objectKey:key,sourceRelativePath:'cover.png',publicPath,bankId:'editorial',checksum,sizeBytes:bytes.length,mimeType:'image/png',status:'ready'};
const article={id:`article-${order.id}`,slug:`article-${order.id}`,version:order.revision,channel:'resource',category:edited.category??'学习分享',badge:edited.badge??'学习资料',title:edited.title,summary:edited.summary??'',tags:edited.tags??[],publishedAt:null,cover:{publicPath,alt:edited.title,width:800,height:500,mimeType:'image/png',checksum,sizeBytes:bytes.length},blocks:edited.blocks,sourceLinks:edited.sourceLinks??[]};
// Summary is an excerpt supplied from the original, never generated new claims.
if(!article.summary)article.summary=edited.blocks.find(b=>b.type==='paragraph')?.text.slice(0,100)??edited.title;
fs.writeFileSync(path.join(output,'resources.json'),JSON.stringify({schemaVersion:1,files:[resource]},null,2)+'\n');
fs.writeFileSync(path.join(output,'draft.json'),JSON.stringify({id:order.id,revision:order.revision,draft:{banks:[],article,decisions:[],notes:edited.changes??'保留原文，整理排版。'}},null,2)+'\n');
console.log('article_order_prepared');
