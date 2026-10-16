import { Asset } from 'expo-asset';
export async function exportFontBytes() {
  const asset=Asset.fromModule(require('../../../../assets/fonts/NotoSerifSC_600SemiBold.ttf'));
  const response=await fetch(asset.uri);if(!response.ok)throw new Error('pdf_font_unavailable');return new Uint8Array(await response.arrayBuffer());
}
export async function storePdf(bytes:Uint8Array){return URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));}
export async function previewPdf(uri:string){const opened=window.open(uri,'_blank');if(!opened)throw new Error('pdf_preview_blocked');}
export async function sharePdf(uri:string){const link=document.createElement('a');link.href=uri;link.download='900句-我的学习资料.pdf';document.body.appendChild(link);link.click();link.remove();}
export function releasePdf(uri:string){URL.revokeObjectURL(uri);}
