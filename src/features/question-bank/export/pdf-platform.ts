import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { isPrintDismissal } from './pdf-errors';
export async function exportFontBytes() {
  const asset=Asset.fromModule(require('../../../../assets/fonts/NotoSerifSC_600SemiBold.ttf'));
  await asset.downloadAsync();return new File(asset.localUri??asset.uri).bytes();
}
export async function storePdf(bytes:Uint8Array) {
  const file=new File(Paths.cache,`900句-我的学习资料-${Date.now()}.pdf`);file.write(bytes);return file.uri;
}
export async function previewPdf(uri:string){
  try { await Print.printAsync({uri}); } catch (error) { if (!isPrintDismissal(error)) throw error; }
}
export async function sharePdf(uri:string){await Sharing.shareAsync(uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:'保存或分享我的900句'});}
export function releasePdf(uri:string){try{new File(uri).delete();}catch{/* Cache cleanup may run after the OS removed a temporary file. */}}
