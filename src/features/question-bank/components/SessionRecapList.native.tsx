import { normalizeStaticLookupWord } from '../static-word-lookup/normalize';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Star } from '@/components/ui/icons';
import { AppText, Button, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, spacing } from '@/theme';
import { useWordFavorites } from '@/features/vocabulary/progress-store.native';
import { useSaveAction } from '@/features/vocabulary/use-save-action.native';
import { findStaticWordLookup } from '../static-word-lookup/repository';
import { useQuestionAnnotations } from '../annotations/use-question-annotations-with-save.native';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { LookupPronunciation } from './LookupPronunciation';
import type { LearningRecord } from '../types';
import { objectiveReview } from '../lib/session-recap';
export function SessionRecapList({kind,record,onBack,onOpen}:{kind:'annotations'|'words'|'wrong';record:LearningRecord;onBack:()=>void;onOpen:(id:string)=>void}) {
  const [onlyFavorites,setOnlyFavorites]=useState(false);const favorites=useWordFavorites();const save=useSaveAction();const annotations=useQuestionAnnotations();
  const title=kind==='words'?'查词与收藏':kind==='annotations'?'标注题目':'错题回顾';
  const selected=new Set(kind==='annotations'?record.sessionRecap?.annotatedCardIds:objectiveReview(record.studyReview).wrongIds);
  const items=record.studyReview?.items.filter(item=>selected.has(kind==='annotations'?item.card.id:item.id))??[];
  const words=(record.sessionRecap?.words??[]).filter(word=>!onlyFavorites||word.favorited);
  return <Screen scroll header={<TopBar title={title} onBack={onBack}/>}>
    {kind==='words'?<><Button variant={onlyFavorites?'secondary':'ghost'} onPress={()=>setOnlyFavorites(value=>!value)}>{onlyFavorites?'本次收藏':'全部查词'}</Button>{words.map(({word})=>{const entry=findStaticWordLookup(word);return <View key={word} style={styles.item}><View style={styles.row}><AppText variant="cardTitle">{word}</AppText><LookupPronunciation word={word}/><Pressable accessibilityLabel={favorites.isFavorite({word})?'取消收藏':'收藏单词'} onPress={()=>void save.run(()=>favorites.toggleFavorite({word}))}><Star size={20} color={colors.accent} fill={favorites.isFavorite({word})?colors.accent:'transparent'}/></Pressable></View><AppText variant="caption">{entry?.ipa}</AppText><AppText>{entry?.aviationMeaning??entry?.generalMeaning}</AppText>{record.studyReview?.items.filter(item => [item.card.audioText, item.card.referenceText].some(text => text?.split(/\s+/).some(token => normalizeStaticLookupWord(token) === normalizeStaticLookupWord(word)))).map(item => <Button key={item.id} size="sm" variant="ghost" onPress={() => onOpen(item.id)}>回到 {item.card.taskTitle}</Button>)}</View>;})}</>:items.map(item=>{
      const entry=annotations.store.entries[questionBankCardTargetKey({bankId:item.dataset.id,categoryId:item.category.id,topicId:item.topic.id,cardId:item.card.id})];
      return <Pressable accessibilityRole="button" key={item.id} onPress={()=>onOpen(item.id)} style={styles.item}><View style={styles.row}><AppText variant="button" style={{flex:1}}>{item.card.taskTitle}</AppText><ChevronRight color={colors.mutedForeground} size={20}/></View><AppText numberOfLines={2}>{item.card.audioText??(item.card.kind==='image'?item.card.imageAlt:'')}</AppText>{kind==='annotations'?<>
        {entry?.tagIds.length?<AppText color={colors.primary} variant="caption">{annotations.tagDefinitions.filter(t=>entry.tagIds.includes(t.id)).map(t=>t.label).join(' · ')}</AppText>:null}
        {entry?.highlights.length?<AppText variant="caption">{[...new Set(entry.highlights.map(h=>h.quote))].join(' · ')}</AppText>:null}
        {entry?.note?<AppText variant="caption" numberOfLines={3}>笔记：{entry.note}</AppText>:null}
      </>:<AppText variant="caption">已选 {String.fromCharCode(65+(record.studyReview?.states[item.id]?.selectedChoiceIndex??0))} · 正确答案 {String.fromCharCode(65+(item.card.correctChoiceIndex??0))}</AppText>}</Pressable>;
    })}
  </Screen>;
}
const styles=StyleSheet.create({item:{paddingVertical:spacing[4],gap:spacing[2],borderBottomWidth:1,borderBottomColor:colors.border},row:{flexDirection:'row',alignItems:'center',gap:spacing[3]}});
