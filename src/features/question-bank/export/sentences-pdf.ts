import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ANNOTATION_PALETTE } from '@icao/contracts/annotation-management';
import type { QuestionBankAnnotationStore } from '../annotations/types';
import { contentFingerprint, tokenizeStudyText } from '../annotations/text';
import { selectedSentences, type ExportOptions, type ExportSentence } from './export-model';
const ink=rgb(.067,.086,.122),muted=rgb(.36,.39,.44),blue=rgb(.122,.369,.851);
const color=(hex:string)=>rgb(...[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255) as [number,number,number]);
type Piece={text:string;highlight?:string};
// Use a PDF-native Latin face for ASCII. The bundled CJK face has contextual
// numeric advances which pdf-lib cannot preserve in its glyph-width table.
function textRuns(text:string,font:PDFFont,latin:PDFFont) {
  return (text.match(/[\x20-\x7e]+|[^\x20-\x7e]+/g)??[]).map(value=>({text:value,font:/^[\x20-\x7e]+$/.test(value)?latin:font}));
}
function measureText(text:string,font:PDFFont,latin:PDFFont,size:number) {
  return textRuns(text,font,latin).reduce((total,run)=>total+run.font.widthOfTextAtSize(run.text,size),0);
}
function wrap(pieces:Piece[],font:PDFFont,latin:PDFFont,size:number,width:number):Piece[][] {
  const lines:Piece[][]=[[]];let used=0;
  for(const piece of pieces) {
    for(const token of piece.text.split(/(\n|\s+|[\u2e80-\u9fff])/u).filter(Boolean)) {
      if(token==='\n'){lines.push([]);used=0;continue;}
      const units=measureText(token,font,latin,size)>width?[...token]:[token];
      for(const text of units) {
        const w=measureText(text,font,latin,size);
        if(used+w>width&&used>0){lines.push([]);used=0;}
        if(!used&&!text.trim())continue;
        lines[lines.length-1].push({text,highlight:piece.highlight});used+=w;
      }
    }
  }
  return lines;
}
export async function buildSentencesPdf(rows:ExportSentence[],options:ExportOptions,annotations:QuestionBankAnnotationStore,fontBytes:Uint8Array,exportedAt=new Date()) {
  const chosen=selectedSentences(rows,options);if(!chosen.length)throw new Error('export_empty');
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  // The bundled CJK font loses glyphs when fontkit subsets it; retain its original glyph IDs.
  const font=await doc.embedFont(fontBytes,{subset:false});
  const latin=await doc.embedFont(StandardFonts.TimesRoman);
  doc.setTitle('900句 · 我的学习资料');doc.setAuthor('听你五个');doc.setCreationDate(exportedAt);
  const width=595.28,height=841.89,margin=44,textX=111,textWidth=width-margin-textX;
  let page:PDFPage;let y=0;
  const drawText=(text:string,settings:Parameters<PDFPage['drawText']>[1])=>{
    let x=settings?.x??0;const size=settings?.size??9;
    for(const run of textRuns(text,font,latin)){page.drawText(run.text,{...settings,font:run.font,x});x+=run.font.widthOfTextAtSize(run.text,size);}
  };
  const newPage=()=>{page=doc.addPage([width,height]);y=height-65;
    page.drawText('听你五个',{font,size:52,x:161,y:365,color:blue,opacity:.045,rotate:degrees(30)});
    drawText('听你五个  /  900句个人学习资料',{size:9,x:margin,y:height-34,color:muted});
    page.drawLine({start:{x:margin,y:height-42},end:{x:width-margin,y:height-42},color:rgb(.86,.88,.91),thickness:.5});
  };
  const ensure=(space:number)=>{if(y-space<46)newPage();};
  const line=(pieces:Piece[],size:number,x:number,shade=ink)=>{
    ensure(size+8);let cursor=x;
    for(const piece of pieces){const w=measureText(piece.text,font,latin,size);if(piece.highlight)page.drawRectangle({x:cursor,y:y-2,width:w,height:size+4,color:color(piece.highlight),opacity:.24});drawText(piece.text,{size,x:cursor,y,color:shade});cursor+=w;}
    y-=size+7;
  };
  newPage();
  line([{text:'900句 · 我的学习资料'}],20,margin);
  line([{text:`${options.levels.join(' / ')}  ·  ${chosen.length} 句  ·  ${exportedAt.toLocaleDateString('zh-CN')}`}],9,margin,muted);y-=6;
  const usedTags=new Set(chosen.flatMap(row=>row.annotation?.tagIds??[]));
  const definitions=annotations.tagDefinitions.filter(tag=>usedTags.has(tag.id));
  if(options.tags&&definitions.length){
    let x=margin;
    for(const tag of definitions){const w=measureText(tag.label,font,latin,9)+28;if(x+w>width-margin){y-=20;x=margin;ensure(20);}page!.drawCircle({x:x+3,y:y+3,size:3,color:color(ANNOTATION_PALETTE[tag.color])});drawText(tag.label,{size:9,x:x+13,y,color:muted});x+=w;}
    y-=24;
  }
  let previousLevel='';
  for(const row of chosen){
    // Release the JS thread between rows so progress indicators and cancellation stay responsive.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const highlights=options.highlights?row.annotation?.highlights??[]:[];
    const fingerprint=contentFingerprint(row.card.audioText);
    const pieces=tokenizeStudyText(row.card.audioText).map(token=>{
      const highlight=highlights.find(h=>h.wordIndex===token.wordIndex&&h.quote===token.text&&h.contentFingerprint===fingerprint);
      const definition=annotations.highlightDefinitions.find(d=>d.id===highlight?.colorId);
      return {text:token.text,highlight:definition?ANNOTATION_PALETTE[definition.color]:undefined};
    });
    const english=wrap(pieces,font,latin,10.5,textWidth);
    const translated=options.translation&&row.card.audioTextZh?wrap([{text:row.card.audioTextZh}],font,latin,9,textWidth):[];
    const notes=options.notes&&row.annotation?.note.trim()?wrap([{text:'笔记：'+row.annotation.note}],font,latin,9,textWidth):[];
    const blockHeight=english.length*17.5+(translated.length+notes.length)*16+13;
    ensure(Math.min(blockHeight+(previousLevel!==row.level?28:0),height-112));
    if(previousLevel!==row.level){line([{text:row.level}],13,margin,blue);y-=5;previousLevel=row.level;}
    const number=row.card.taskTitle.match(/\d+/)?.[0]??row.card.id.replace('sentence900-main-','');
    drawText(number,{size:9,x:margin,y,color:muted});
    if(options.tags){const tags=definitions.filter(d=>row.annotation?.tagIds.includes(d.id));tags.forEach((tag,index)=>page!.drawCircle({x:76+(index%4)*8,y:y+3-Math.floor(index/4)*8,size:2.5,color:color(ANNOTATION_PALETTE[tag.color])}));}
    english.forEach(parts=>line(parts,10.5,textX));translated.forEach(parts=>line(parts,9,textX,muted));notes.forEach(parts=>line(parts,9,textX,muted));y-=9;
  }
  const pages=doc.getPages();pages.forEach((p,index)=>p.drawText(`${index+1} / ${pages.length}`,{font:latin,size:9,x:width/2-12,y:25,color:muted}));
  return {bytes:await doc.save(),pageCount:pages.length,sentenceCount:chosen.length};
}
