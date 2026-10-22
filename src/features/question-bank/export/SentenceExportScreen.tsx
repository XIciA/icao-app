import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { generateSentencesPdf } from './pdf-generator';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Check } from '@/components/ui/icons';
import { AppText, Button, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, spacing } from '@/theme';
import { captureLearningWriteContext, assertLearningWriteContext } from '@/features/sync/learning-sync.native';
import { questionBankRepository } from '../data/repository.native';
import { contentReleaseOf } from '../data/content-version.native';
import { readAnnotationStore } from '../annotations/annotation-store.native';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import type { QuestionBankAnnotationStore } from '../annotations/types';
import { sqliteLearningStore } from '../platform/learning-store.native';
import type { QuestionBankDataset } from '../types';
import { selectedSentences, type ExportOptions, type ExportSentence } from './export-model';
import { exportFontBytes, storePdf, previewPdf, sharePdf, releasePdf } from './pdf-platform';
const defaults:ExportOptions={levels:[],filter:'all',tagIds:[],translation:true,highlights:true,tags:true,notes:true};
export function SentenceExportScreen({dataset,onBack}:{dataset:QuestionBankDataset;onBack:()=>void}) {
  const guide = useGuide(); const guideTour=guide?.current; const guideStep=guide?.step;
  const [data,setData]=useState<{rows:ExportSentence[];annotations:QuestionBankAnnotationStore}>();const [attempt,setAttempt]=useState(0);
  const [options,setOptions]=useState<ExportOptions>({...defaults,levels:dataset.categories.map(c=>c.name)});
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [output,setOutput]=useState<{uri:string;pages:number;count:number}>();
  const outputUri=useRef<string | undefined>(undefined);const active=useRef(true);const context=useRef(captureLearningWriteContext()).current;
  useEffect(()=>{if(guideTour==='export'&&guideStep==='export-scope'&&output){releasePdf(output.uri);outputUri.current=undefined;setError('');setOutput(undefined);}},[guideTour,guideStep,output]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;if(outputUri.current)releasePdf(outputUri.current);};},[]);
  useEffect(()=>{let current=true;setError('');setData(undefined);
    void (async()=>{const annotations=await readAnnotationStore();const rows:ExportSentence[]=[];
      for(const category of dataset.categories) for(const summary of category.topics){
        // Export has no membership gate. Source content retains the existing access policy.
        const topic=summary.access?.availableCardCount===0?summary:await questionBankRepository.getTopic('sentences900',category.id,summary.id,contentReleaseOf(dataset))??summary;
        const states=await sqliteLearningStore.getTopicStates(topic);
        for(const card of topic.cards)if(card.kind!=='image'&&!card.retired)rows.push({level:category.name,card,learned:Boolean(states[card.id]?.visited),annotation:annotations.entries[questionBankCardTargetKey({bankId:'sentences900',categoryId:category.id,topicId:topic.id,cardId:card.id})]});
      }
      assertLearningWriteContext(context);if(current)setData({rows,annotations});
    })().catch(()=>{if(current)setError('资料读取失败，已有记录未被修改，请重试。');});return()=>{current=false;};
  },[attempt,context,dataset]);
  const count=data?selectedSentences(data.rows,options).length:0;
  function toggleLevel(level:string){guide?.event('export-scope');setOptions(current=>({...current,levels:current.levels.includes(level)?current.levels.filter(l=>l!==level):[...current.levels,level]}));}
  async function generate(){if(!data||busy)return;setBusy(true);setError('');try{assertLearningWriteContext(context);
    const result=await generateSentencesPdf(data.rows,options,data.annotations,await exportFontBytes());assertLearningWriteContext(context);
    const uri=await storePdf(result.bytes);if(!active.current){releasePdf(uri);return;}outputUri.current=uri;setOutput({uri,pages:result.pageCount,count:result.sentenceCount});guide?.event('export-generate');
  }catch{if(active.current)setError('PDF 生成失败，请重试。学习笔记和进度不会受到影响。');}finally{if(active.current)setBusy(false);}}
  async function open(action:()=>Promise<void>,message:string){if(busy)return;setBusy(true);setError('');try{assertLearningWriteContext(context);await action();}catch{if(active.current)setError(message);}finally{if(active.current)setBusy(false);}}
  return <Screen scroll><TopBar title={output?'我的900句 PDF':'导出900句'} onBack={()=>{if(busy)return;if(output){setError('');releasePdf(output.uri);outputUri.current=undefined;setOutput(undefined);}else onBack();}}/>
    {error?<View style={styles.section}><AppText color={colors.destructive}>{error}</AppText>{!data?<Button onPress={()=>setAttempt(v=>v+1)}>重新读取</Button>:null}</View>:null}
    {output?<View style={styles.section}><GuideAnchor id="export-result" /><AppText variant="sectionTitle">PDF 已生成</AppText><AppText>{output.count} 句 · {output.pages} 页 · A4</AppText><Button disabled={busy} onPress={()=>void open(()=>previewPdf(output.uri),'PDF 预览未能打开，请重试或选择保存。')}>预览 PDF</Button><Button disabled={busy} variant="secondary" onPress={()=>void open(()=>sharePdf(output.uri),'未能打开保存或分享，请重试。')}>保存或分享 PDF</Button></View>:<>
      <View style={styles.section}><View style={styles.row}><AppText variant="sectionTitle">导出范围</AppText><Button variant="ghost" onPress={()=>setOptions(current=>({...current,levels:dataset.categories.map(c=>c.name)}))}>全选</Button></View>{dataset.categories.map(c=><Option key={c.id} label={c.name} selected={options.levels.includes(c.name)} onPress={()=>toggleLevel(c.name)}/>)}</View>
      <View style={styles.section}><GuideAnchor id="export-scope" /><AppText variant="sectionTitle">选择句子</AppText>{(['all','learned','annotated'] as const).map(filter=><Option key={filter} label={{all:'全部句子',learned:'仅已学习',annotated:'仅有标注'}[filter]} selected={options.filter===filter} onPress={()=>{setOptions(current=>({...current,filter}));guide?.event('export-scope');}}/>)}{options.filter==='annotated'&&data?.annotations.tagDefinitions.map(tag=><Option key={tag.id} label={tag.label} selected={options.tagIds.includes(tag.id)} onPress={()=>setOptions(current=>({...current,tagIds:current.tagIds.includes(tag.id)?current.tagIds.filter(id=>id!==tag.id):[...current.tagIds,tag.id]}))}/>)}</View>
      <View style={styles.section}><AppText variant="sectionTitle">包含内容</AppText>{(['translation','highlights','tags','notes'] as const).map(key=><View key={key} style={styles.row}>{key==='translation'||key==='highlights'?<GuideAnchor id={key==='translation'?'export-translation':'export-personal'} />:null}<AppText>{{translation:'中文翻译',highlights:'我的高亮',tags:'我的标签',notes:'我的笔记'}[key]}</AppText><Switch accessibilityLabel={{translation:'中文翻译',highlights:'我的高亮',tags:'我的标签',notes:'我的笔记'}[key]} value={options[key]} onValueChange={value=>{setOptions(current=>({...current,[key]:value}));guide?.event(key==='translation'?'export-translation':'export-personal');}} trackColor={{true:colors.primary}}/></View>)}</View>
      <View style={styles.section}><AppText>{data?`已选择 ${count} 句`:'正在读取可导出的句子…'}</AppText><Button guideId="export-generate" disabled={!data||!count||busy} onPress={()=>void generate()}>{busy?'正在生成 PDF…':'生成 PDF'}</Button></View>
    </>}
  </Screen>;
}
function Option({label,selected,onPress,guideId}:{label:string;selected:boolean;onPress:()=>void;guideId?:string}){return <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected}} onPress={onPress} style={styles.row}>{guideId ? <GuideAnchor id={guideId} /> : null}<AppText>{label}</AppText>{selected?<Check size={20} color={colors.primary}/>:<View style={{width:20}}/>}</Pressable>;}
const styles=StyleSheet.create({section:{paddingVertical:spacing[5],gap:spacing[3],borderBottomWidth:1,borderBottomColor:colors.border},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:spacing[2],minHeight:44}});
