import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { ContentDraft } from '@icao/contracts/content-workflow';

const text = z.string().trim().min(1);
const cardSchema = z.object({ id: text, taskTitle: text, kind: z.enum(['text','image']).optional(),
  audioText: text.optional(), audioTextZh: z.string().optional(), referenceText: z.string().optional(), referenceTextZh: z.string().optional(),
  audio: text.optional(), image: text.optional(), imageAlt: text.optional(), retired: z.boolean().optional(), examReported: z.boolean().optional(), studyTier: z.union([z.literal(0),z.literal(1),z.literal(2)]).optional(),
  choices: z.array(text).min(2).optional(), correctChoiceIndex: z.number().int().nonnegative().optional(),
  reportedPrompts: z.record(z.string(), z.array(text).min(1)).optional(),
}).passthrough();
const topicSchema = z.object({ id: text, name: text, declaredCardCount: z.number().int(), cards: z.array(cardSchema),
  scopeCardIds: z.record(z.string(),z.array(text)).optional() }).passthrough();
export const bankSchema = z.object({ id: text, categories: z.array(z.object({ id: text, name: text, declaredTopicCount: z.number().int(), declaredCardCount: z.number().int(), topics: z.array(topicSchema) }).passthrough()), declaredTopicCount: z.number().int(), declaredCardCount: z.number().int() }).passthrough();
export type Bank = z.infer<typeof bankSchema>;
export function cardsOf(bank: Bank) { return bank.categories.flatMap(category => category.topics.flatMap(topic => topic.cards.map(card => ({category,topic,card})))); }
export function validateBank(value: unknown, previous?: unknown): Bank {
  const parsed = bankSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid_question_bank');
  const bank = parsed.data; const cards = cardsOf(bank);
  const oldBank = previous ? bankSchema.parse(previous) : undefined;
  const oldCards = new Map(oldBank ? cardsOf(oldBank).map(e => [e.card.id, e.card]) : []);
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(cards.map(e=>e.card.id)) || !unique(bank.categories.map(c=>c.id)) || !unique(bank.categories.flatMap(c=>c.topics.map(t=>t.id)))
    || cards.length !== bank.declaredCardCount || bank.categories.flatMap(c=>c.topics).length !== bank.declaredTopicCount) throw new BadRequestException('question_bank_count_or_identity_mismatch');
  for (const category of bank.categories) {
    if (category.topics.length !== category.declaredTopicCount || category.topics.reduce((n,t)=>n+t.cards.length,0) !== category.declaredCardCount) throw new BadRequestException('category_count_mismatch');
    for (const topic of category.topics) {
      if (topic.cards.length !== topic.declaredCardCount) throw new BadRequestException('topic_count_mismatch');
      for (const ids of Object.values(topic.scopeCardIds ?? {})) if (!unique(ids) || ids.some(id=>!topic.cards.some(c=>c.id===id))) throw new BadRequestException('invalid_study_scope');
      for (const card of topic.cards) {
        if (card.retired) continue;
        if(bank.id==='opi') {
          const old=oldCards.get(card.id);
          if(card.audioText!==old?.audioText && card.kind!=='image' && !card.audioText?.endsWith('?')) throw new BadRequestException('opi_question_must_be_complete');
          for(const [id,prompts] of Object.entries(card.reportedPrompts??{})) if(JSON.stringify(prompts)!==JSON.stringify(old?.reportedPrompts?.[id]) && prompts.some(prompt=>!prompt.endsWith('?'))) throw new BadRequestException('opi_reported_question_must_be_complete');
        }
        // An unrelated edit must not invalidate legacy content. New or changed cards
        // must meet their bank's complete format before publication.
        const practiceContent = (value: typeof card | undefined) => {
          if (!value) return value;
          const practice = { ...value };
          delete practice.reportedPrompts;
          return practice;
        };
        if (JSON.stringify(practiceContent(oldCards.get(card.id))) === JSON.stringify(practiceContent(card))) continue;
        if (card.kind === 'image') { if (!card.image || !card.imageAlt) throw new BadRequestException('image_question_incomplete'); continue; }
        if (!card.audioText || !card.audio) throw new BadRequestException('question_audio_missing');
        if (oldCards.get(card.id)?.audioText !== card.audioText && oldCards.get(card.id)?.audio === card.audio) throw new BadRequestException('changed_question_requires_new_audio');
        if (card.choices) {
          if (card.correctChoiceIndex === undefined || card.correctChoiceIndex >= card.choices.length) throw new BadRequestException('question_answer_missing');
        } else if (bank.id === 'sentences900') {
          if (!card.audioTextZh?.trim()) throw new BadRequestException('sentence_translation_missing');
        } else if (!card.referenceText?.trim() || !card.referenceTextZh?.trim()) throw new BadRequestException('question_reference_missing');
      }
    }
  }
  if (previous) {
    const old = bankSchema.parse(previous); const next = new Map(cards.map(e=>[e.card.id,e]));
    for (const prior of cardsOf(old)) {
      const current = next.get(prior.card.id);
      if (!current || current.topic.id !== prior.topic.id || current.category.id !== prior.category.id) throw new BadRequestException('existing_question_identity_must_be_preserved');
    }
  }
  return bank;
}
const block = z.discriminatedUnion('type',[
  z.object({type:z.literal('heading'),level:z.union([z.literal(2),z.literal(3)]),text}),
  z.object({type:z.literal('paragraph'),text}),
  z.object({type:z.literal('list'),ordered:z.boolean(),items:z.array(text).min(1)}),
  z.object({type:z.literal('callout'),tone:z.enum(['note','warning']),title:text.optional(),text}),
]);
const hotspotSchema = z.object({id:text,date:z.iso.date(),title:text,centers:z.array(text).min(1),topics:z.array(z.object({topicId:text,topicTitle:text,cardIds:z.array(text).min(1)})).min(1)});
export const draftSchema = z.object({
  banks:z.array(z.object({bankId:z.enum(['opi','listening','sentences900','radiotelephony','storytelling']),baseChecksum:z.string().regex(/^[a-f0-9]{64}$/),payload:z.record(z.string(),z.unknown())})).max(5),
  hotspot:hotspotSchema.extend({centers:z.array(text).length(1)}).optional(),
  hotspotUpdates:z.object({baseChecksum:z.string().regex(/^[a-f0-9]{64}$/),briefs:z.array(hotspotSchema).min(1).max(500)}).optional(),
  article:z.object({id:text,slug:text,version:z.number().int().positive(),channel:z.literal('resource'),category:text,badge:text,title:text,summary:text,tags:z.array(text),publishedAt:z.string().nullable(),
    cover:z.object({publicPath:text,alt:text,width:z.literal(800),height:z.literal(500),mimeType:z.enum(['image/jpeg','image/png']),checksum:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().positive()}),
    blocks:z.array(block).min(1),sourceLinks:z.array(z.object({title:text,publisher:text,url:z.url().refine(url=>/^https?:/.test(url))})),
  }).optional(),
  decisions:z.array(z.object({source:text,kind:z.enum(['original','similar','new','excluded','unresolved']),cardId:text.optional(),reason:text.optional()})),notes:z.string(),
});
export function parseDraft(value: unknown): ContentDraft {
  const parsed=draftSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('invalid_content_draft');
  if(new Set(parsed.data.banks.map(b=>b.bankId)).size!==parsed.data.banks.length) throw new BadRequestException('duplicate_bank');
  if(parsed.data.hotspotUpdates && (parsed.data.hotspot || parsed.data.article)) throw new BadRequestException('historical_hotspots_exclusive');
  return parsed.data;
}
