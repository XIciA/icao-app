import { useLocalBack } from '@/components/navigation/useLocalBack';
import { GUIDE_FLOWS } from '@/features/usage-guide/guide-flows';
import { GuideAnchor, useGuide, useGuideAvailability, useGuideConfirmation } from '@/features/usage-guide/GuideBindings';
import { generateSentencesPdf } from './pdf-generator';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check } from '@/components/ui/icons';
import { AppText, BottomSheet, Button, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { DetailGroup, DetailRow } from '@/components/ui/DetailGroup';
import { GuideScrollView } from '@/features/usage-guide/GuideScrollView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@/theme';
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
  const insets = useSafeAreaInsets();
  const [picker,setPicker]=useState<'levels'|'filter'|'language'|'tags'>();
  const guide = useGuide();
  const offer = guide?.offer;
  useEffect(() => { offer?.('export', (GUIDE_FLOWS.export ?? []).map(step => step.id)); }, [offer]);
  const [data,setData]=useState<{rows:ExportSentence[];annotations:QuestionBankAnnotationStore}>();const [attempt,setAttempt]=useState(0);
  const [options,setOptions]=useState<ExportOptions>({...defaults,levels:dataset.categories.map(c=>c.name)});
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [output,setOutput]=useState<{uri:string;pages:number;count:number}>();
  const outputUri=useRef<string | undefined>(undefined);const active=useRef(true);const context=useRef(captureLearningWriteContext()).current;
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
  const generating = useRef(false);
  const count=data?selectedSentences(data.rows,options).length:0;
  useGuideConfirmation('export-levels', !!data && options.levels.length > 0);
  useGuideConfirmation('export-scope', !!data && count > 0);
  useGuideAvailability('export', error ? '导出暂未成功，请在页面重试，也可以跳过教学。已有学习记录会保留。' : data && !count ? '当前条件没有可导出的句子，请调整范围或筛选，也可以跳过教学。' : undefined);
  function toggleLevel(level:string){setOptions(current=>({...current,levels:current.levels.includes(level)?current.levels.filter(l=>l!==level):[...current.levels,level]}));}
  async function generate(){if(!data||busy||generating.current)return;generating.current=true;setBusy(true);setError('');try{assertLearningWriteContext(context);
    const result=await generateSentencesPdf(data.rows,options,data.annotations,await exportFontBytes());assertLearningWriteContext(context);
    const uri=await storePdf(result.bytes);if(!active.current){releasePdf(uri);return;}outputUri.current=uri;setOutput({uri,pages:result.pageCount,count:result.sentenceCount});guide?.event('export-generate');
  }catch{if(active.current)setError('PDF 生成失败，请重试。学习笔记和进度不会受到影响。');}finally{generating.current=false;if(active.current)setBusy(false);}}
  async function open(action:()=>Promise<void>,message:string){if(busy)return;setBusy(true);setError('');try{assertLearningWriteContext(context);await action();}catch{if(active.current)setError(message);}finally{if(active.current)setBusy(false);}}
  const back = useLocalBack(true, ()=>{if(busy)return;if(output){setError('');releasePdf(output.uri);outputUri.current=undefined;setOutput(undefined);}else onBack();});
  const filters = {all:'全部句子',learned:'已学习句子',annotated:'有标注句子'};
  const tagLabels = data?.annotations.tagDefinitions.filter(tag => options.tagIds.includes(tag.id)).map(tag => tag.label).join('、') || '不限标签';
  return <Screen contentStyle={styles.screen} header={<TopBar title={output?'我的900句 PDF':'导出900句'} onBack={back}/>}>
    <GuideScrollView contentContainerStyle={styles.content}>
      {busy ? <View accessibilityLiveRegion="polite" style={styles.section}><ActivityIndicator color={colors.primary}/><AppText>正在处理 PDF，内容较多时请稍候…</AppText></View> : null}
      {error?<View style={styles.section}><AppText color={colors.destructive}>{error}</AppText>{!data?<Button onPress={()=>setAttempt(v=>v+1)}>重新读取</Button>:null}</View>:null}
      {output?<View style={styles.section}><GuideAnchor id="export-result" /><AppText variant="sectionTitle">PDF 已生成</AppText><AppText>{output.count} 句 · {output.pages} 页 · A4</AppText><Button disabled={busy} onPress={()=>void open(()=>previewPdf(output.uri),'PDF 预览未能打开，请重试或选择保存。')}>预览 PDF</Button><Button disabled={busy} variant="secondary" onPress={()=>void open(()=>sharePdf(output.uri),'未能打开保存或分享，请重试。')}>保存或分享 PDF</Button></View>:<>
        <DetailGroup title="导出设置">
          <View><GuideAnchor id="export-levels" /><DetailRow label="范围" disabled={busy} onPress={()=>setPicker('levels')}>{options.levels.join('、') || '未选择'}</DetailRow></View>
          <View><GuideAnchor id="export-scope" /><DetailRow label="选择句子" disabled={busy} onPress={()=>setPicker('filter')}>{filters[options.filter]}</DetailRow></View>
          {options.filter==='annotated'?<DetailRow label="匹配标签" disabled={busy} onPress={()=>setPicker('tags')}>{tagLabels}</DetailRow>:null}
          <View><GuideAnchor id="export-translation" /><DetailRow label="语言" last disabled={busy} onPress={()=>setPicker('language')}>{options.translation?'中英对照':'仅英文'}</DetailRow></View>
        </DetailGroup>
        <DetailGroup title="附带内容"><View style={styles.chips}><GuideAnchor id="export-personal" />{(['highlights','tags','notes'] as const).map(key=><Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={{highlights:'我的高亮',tags:'我的标签',notes:'我的笔记'}[key]} accessibilityState={{checked:options[key],disabled:busy}} disabled={busy} style={[styles.chip,options[key]&&styles.selected]} onPress={()=>{setOptions(current=>({...current,[key]:!current[key]}));}}><AppText color={options[key]?colors.primary:colors.foreground} variant="caption">{{highlights:'高亮',tags:'标签',notes:'笔记'}[key]}</AppText>{options[key]?<Check size={15} color={colors.primary}/>:null}</Pressable>)}</View></DetailGroup>
        <AppText variant="caption">所选等级合并导出。英文原文始终保留，高亮、标签和笔记可独立选择。</AppText>
      </>}
    </GuideScrollView>
    {!output?<View style={[styles.dock,{paddingBottom:Math.max(insets.bottom,spacing[4])}]}><View style={styles.row}><AppText variant="caption">{data?`将导出 ${count} 句`:'正在读取可导出的句子…'}</AppText><AppText variant="micro">PDF · A4</AppText></View><Button guideId="export-generate" accessibilityLabel={busy ? '正在生成 PDF…' : '生成 PDF'} accessibilityState={{ busy }} loading={busy} disabled={!data||!count||busy} onPress={()=>void generate()}>{busy?'正在生成 PDF…':'生成 PDF'}</Button></View>:null}
    <BottomSheet visible={!!picker} onClose={()=>setPicker(undefined)} accessibilityLabel={picker==='levels'?'导出范围':picker==='filter'?'选择句子':picker==='language'?'导出语言':'匹配标签'}>
      <View style={styles.section}><GuideAnchor id={picker==='levels'?'export-levels':picker==='language'?'export-translation':'export-scope'} /><AppText variant="sectionTitle">{picker==='levels'?'导出范围':picker==='filter'?'选择句子':picker==='language'?'导出语言':'匹配标签'}</AppText>
        {picker==='levels'?<><Button variant="ghost" onPress={()=>{setOptions(current=>({...current,levels:dataset.categories.map(c=>c.name)}));}}>全选</Button>{dataset.categories.map(c=><Option key={c.id} label={c.name} selected={options.levels.includes(c.name)} onPress={()=>toggleLevel(c.name)}/>)}</>:null}
        {picker==='filter'?(['all','learned','annotated'] as const).map(filter=><Option key={filter} label={filters[filter]} selected={options.filter===filter} onPress={()=>{setOptions(current=>({...current,filter}));setPicker(undefined);guide?.event('export-scope');}}/>):null}
        {picker==='language'?[true,false].map(translation=><Option key={String(translation)} label={translation?'中英对照':'仅英文'} selected={options.translation===translation} onPress={()=>{setOptions(current=>({...current,translation}));setPicker(undefined);guide?.event('export-translation');}}/>):null}
        {picker==='tags'?<><AppText variant="caption">匹配任一所选标签；不选表示不限标签。</AppText>{data?.annotations.tagDefinitions.map(tag=><Option key={tag.id} label={tag.label} selected={options.tagIds.includes(tag.id)} onPress={()=>setOptions(current=>({...current,tagIds:current.tagIds.includes(tag.id)?current.tagIds.filter(id=>id!==tag.id):[...current.tagIds,tag.id]}))}/>)}</>:null}
        <Button variant="secondary" onPress={()=>{setPicker(undefined);if(picker==='levels' && options.levels.length)guide?.event('export-levels');if(picker==='filter' && count)guide?.event('export-scope');if(picker==='language')guide?.event('export-translation');}}>完成</Button>
      </View>
    </BottomSheet>
  </Screen>;
}

function Option({label,selected,onPress,guideId}:{label:string;selected:boolean;onPress:()=>void;guideId?:string}){return <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected}} onPress={onPress} style={styles.row}>{guideId ? <GuideAnchor id={guideId} /> : null}<AppText>{label}</AppText>{selected?<Check size={20} color={colors.primary}/>:<View style={{width:20}}/>}</Pressable>;}
const styles=StyleSheet.create({
  screen:{paddingHorizontal:0},content:{padding:spacing[5],gap:spacing[5]},section:{gap:spacing[3]},
  dock:{borderTopWidth:1,borderTopColor:colors.border,paddingHorizontal:spacing[5],paddingTop:spacing[3],gap:spacing[2]},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing[3],paddingVertical:spacing[2],minHeight:44},
  chips:{flexDirection:'row',gap:spacing[2],paddingVertical:spacing[4]},chip:{flex:1,minHeight:44,borderWidth:1,borderColor:colors.border,borderRadius:radii.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing[2]},selected:{backgroundColor:colors.primary08,borderColor:colors.primary20},
});
