import { BookOpen, Check, ChevronDown, ChevronRight, List, Play, RotateCcw, Search, Star, Volume2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

type WordStatus = 'new' | 'known' | 'vague' | 'forgot' | 'wrong';
type Word = { id: string; word: string; phonetic: string; meaning: string };
type Book = { id: string; name: string; description: string; words: Word[] };

const previewWords: Word[] = [
  ['p1', 'altitude', '/ˈæltɪtuːd/', 'n. 高度；海拔'], ['p2', 'runway', '/ˈrʌnweɪ/', 'n. 跑道'],
  ['p3', 'taxiway', '/ˈtæksiweɪ/', 'n. 滑行道'], ['p4', 'cockpit', '/ˈkɑːkpɪt/', 'n. 驾驶舱'],
  ['p5', 'heading', '/ˈhedɪŋ/', 'n. 航向'], ['p6', 'approach', '/əˈproʊtʃ/', 'n. 进近 v. 接近'],
  ['p7', 'takeoff', '/ˈteɪkɔːf/', 'n. 起飞'], ['p8', 'landing', '/ˈlændɪŋ/', 'n. 着陆；降落'],
  ['p9', 'visibility', '/ˌvɪzəˈbɪləti/', 'n. 能见度'], ['p10', 'altimeter', '/ælˈtɪmɪtər/', 'n. 高度表'],
].map(([id, word, phonetic, meaning]) => ({ id, word, phonetic, meaning }));
const icao4Words: Word[] = [
  ['f1', 'clearance', '/ˈklɪrəns/', 'n. 放行许可；间隙'], ['f2', 'turbulence', '/ˈtɜːrbjələns/', 'n. 颠簸；湍流'],
  ['f3', 'diversion', '/daɪˈvɜːrʒn/', 'n. 备降；改航'], ['f4', 'mandatory', '/ˈmændətɔːri/', 'adj. 强制的；必须的'],
  ['f5', 'vicinity', '/vəˈsɪnəti/', 'n. 附近；周边地区'], ['f6', 'affirm', '/əˈfɜːrm/', 'v.（通话）是；确认'],
  ['f7', 'negative', '/ˈneɡətɪv/', 'adj.（通话）否；不是'], ['f8', 'readback', '/ˈriːdbæk/', 'n. 复诵；回读'],
  ['f9', 'squawk', '/skwɔːk/', 'v. 设置应答机编码'], ['f10', 'standby', '/ˈstændbaɪ/', 'v. 稍等；等候'],
].map(([id, word, phonetic, meaning]) => ({ id, word, phonetic, meaning }));
const icao5Words: Word[] = [
  ['s1', 'deteriorate', '/dɪˈtɪriəreɪt/', 'v. 恶化；变坏；退化'], ['s2', 'obsolete', '/ˌɑːbsəˈliːt/', 'adj. 过时的；废弃的'],
  ['s3', 'precipitation', '/prɪˌsɪpɪˈteɪʃn/', 'n. 降水；降水量'], ['s4', 'depressurization', '/diːˌpreʃəraɪˈzeɪʃn/', 'n. 释压；减压'],
  ['s5', 'intercept', '/ˌɪntərˈsept/', 'v. 拦截；截获'], ['s6', 'contingency', '/kənˈtɪndʒənsi/', 'n. 意外情况；应急事件'],
  ['s7', 'jeopardize', '/ˈdʒepərdaɪz/', 'v. 危及；使陷入危险'], ['s8', 'alleviate', '/əˈliːvieɪt/', 'v. 缓解；减轻'],
  ['s9', 'deviation', '/ˌdiːviˈeɪʃn/', 'n. 偏离；偏差'], ['s10', 'expedite', '/ˈekspədaɪt/', 'v. 加快；加速'],
].map(([id, word, phonetic, meaning]) => ({ id, word, phonetic, meaning }));
const books: Book[] = [
  { id: 'preview', name: '预习', description: '适合下分院前提前熟悉 ICAO 基础词汇。帮助建立陆空通话和飞行英语的基本词汇印象。', words: previewWords },
  { id: 'icao4', name: 'ICAO 4 必会', description: '整理 ICAO 4 级常见高频词汇。适合备考 4 级时集中掌握核心表达。', words: icao4Words },
  { id: 'icao5', name: 'ICAO 5 冲刺', description: '面向 ICAO 5 级提升阶段。帮助积累更准确、更自然的表达词汇。', words: icao5Words },
];
const initialStatuses: Record<string, WordStatus> = { p1: 'known', p2: 'known', p3: 'vague' };
const statusLabels: Record<WordStatus, string> = { new: '未学', known: '认识', vague: '模糊', forgot: '忘记', wrong: '记错' };

type Step = 'books' | 'detail' | 'list' | 'study';
export function VocabScreen() {
  const [step, setStep] = useState<Step>('books');
  const [selected, setSelected] = useState<string[]>([]);
  const [bookId, setBookId] = useState('preview');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, WordStatus>>(initialStatuses);
  const [favorites, setFavorites] = useState(new Set(['p2']));
  const book = books.find((item) => item.id === bookId) ?? books[0];
  const learned = book.words.filter((word) => (statuses[word.id] ?? 'new') !== 'new').length;

  const start = (id = selected[0] ?? bookId) => { setBookId(id); setIndex(0); setRevealed(false); setStep('study'); };
  const choose = (status: WordStatus) => {
    const word = book.words[index];
    setStatuses((current) => ({ ...current, [word.id]: status }));
    setRevealed(true);
  };
  const next = () => { setIndex((current) => (current + 1) % book.words.length); setRevealed(false); };
  const toggleFavorite = (id: string) => setFavorites((current) => { const copy = new Set(current); if (copy.has(id)) copy.delete(id); else copy.add(id); return copy; });

  if (step === 'study') return <StudyView book={book} favorite={favorites.has(book.words[index].id)} index={index} onBack={() => setStep('detail')} onChoose={choose} onMarkWrong={() => setStatuses((current) => ({ ...current, [book.words[index].id]: 'wrong' }))} onNext={next} onToggleFavorite={() => toggleFavorite(book.words[index].id)} revealed={revealed} />;
  if (step === 'list') return <WordList book={book} favorites={favorites} onBack={() => setStep('detail')} onToggleFavorite={toggleFavorite} statuses={statuses} />;
  if (step === 'detail') return <BookDetail book={book} learned={learned} onBack={() => setStep('books')} onReset={() => { setStatuses((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !book.words.some((word) => word.id === id)))); setIndex(0); }} onStudy={() => start(book.id)} onViewWords={() => setStep('list')} statuses={statuses} favorites={favorites} />;

  return <BookSelect selected={selected} statuses={statuses} onBack={undefined} onStart={() => start()} onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onViewDetail={(id) => { setBookId(id); setStep('detail'); }} />;
}

function BookSelect({ selected, statuses, onStart, onToggle, onViewDetail }: { selected: string[]; statuses: Record<string, WordStatus>; onBack?: () => void; onStart: () => void; onToggle: (id: string) => void; onViewDetail: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  return <Screen contentStyle={styles.zero}><TopBar title="单词学习" /><ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} style={styles.scroll}>
    <View style={styles.centerHeader}><AppText variant="pageTitle">单词学习</AppText><AppText style={styles.center}>选择一本或多本词书，立即开始学习。</AppText></View>
    <View style={styles.stack}>{books.map((book) => { const active = selected.includes(book.id); const learned = book.words.filter((word) => (statuses[word.id] ?? 'new') !== 'new').length; return <Pressable accessibilityLabel={`选择${book.name}`} key={book.id} onPress={() => onToggle(book.id)}><Card elevated style={[styles.bookCard, active && styles.selectedCard]}><View style={[styles.bookIcon, active && styles.selectedIcon]}>{active ? <Check color={colors.primaryForeground} size={20} /> : <BookOpen color={colors.primary} size={20} />}</View><View style={styles.grow}><View style={styles.rowBetween}><AppText variant="sectionTitle">{book.name}</AppText><AppText variant="caption">{book.words.length} 词</AppText></View><AppText style={styles.description}>{book.description}</AppText><AppText variant="micro">已学习 {learned} / {book.words.length}</AppText><Progress value={learned / book.words.length} /><Pressable accessibilityLabel={`查看${book.name}详情`} onPress={(event) => { event.stopPropagation(); onViewDetail(book.id); }} style={styles.link}><AppText color={colors.primary} variant="button">查看详情</AppText><ChevronRight color={colors.primary} size={15} /></Pressable></View></Card></Pressable>; })}</View>
  </ScrollView><View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}><AppText style={styles.center}>{selected.length ? `已选择 ${selected.length} 本词书` : '请选择至少一本词书'}</AppText><Button disabled={!selected.length} leading={<Play color={colors.primaryForeground} size={16} />} onPress={onStart} size="lg">开始学习</Button></View></Screen>;
}

function BookDetail({ book, learned, statuses, favorites, onBack, onStudy, onReset, onViewWords }: { book: Book; learned: number; statuses: Record<string, WordStatus>; favorites: Set<string>; onBack: () => void; onStudy: () => void; onReset: () => void; onViewWords: () => void }) {
  const count = (status: WordStatus) => book.words.filter((word) => (statuses[word.id] ?? 'new') === status).length;
  const stats = [['单词总数', book.words.length, colors.foreground], ['认识', count('known'), colors.primary], ['模糊', count('vague'), colors.primary], ['忘记', count('forgot'), colors.accent], ['记错', count('wrong'), colors.destructive], ['收藏', book.words.filter((w) => favorites.has(w.id)).length, colors.foreground]] as const;
  return <Screen scroll contentStyle={styles.zero}><TopBar title="单词学习" onBack={onBack} /><View style={styles.page}><Pressable onPress={onBack} style={styles.backLink}><AppText variant="caption">← 返回词书选择</AppText></Pressable><Card style={styles.detailCard}><AppText variant="pageTitle">{book.name}</AppText><AppText style={styles.description}>{book.description}</AppText><View style={styles.rowBetween}><AppText variant="caption">学习进度</AppText><AppText variant="caption">{learned} / {book.words.length}</AppText></View><Progress value={learned / book.words.length} /></Card><View style={styles.stats}>{stats.map(([label, value, color]) => <Card key={label} style={styles.stat}><AppText variant="caption">{label}</AppText><AppText color={color} style={styles.statValue} variant="pageTitle">{value}</AppText></Card>)}</View><Button leading={<Play color={colors.primaryForeground} size={16} />} onPress={onStudy} size="lg">{learned ? '继续学习' : '开始学习'}</Button><Button leading={<RotateCcw color={colors.foreground} size={16} />} onPress={onReset} size="lg" variant="outline">重新学习</Button><Button leading={<List color={colors.foreground} size={16} />} onPress={onViewWords} size="lg" variant="outline">查看单词列表</Button></View></Screen>;
}

function WordList({ book, statuses, favorites, onBack, onToggleFavorite }: { book: Book; statuses: Record<string, WordStatus>; favorites: Set<string>; onBack: () => void; onToggleFavorite: (id: string) => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | WordStatus | 'favorite'>('all'); const [expanded, setExpanded] = useState<string>();
  const visible = useMemo(() => book.words.filter((word) => { const status = statuses[word.id] ?? 'new'; return (filter === 'all' || (filter === 'favorite' ? favorites.has(word.id) : status === filter)) && (`${word.word} ${word.meaning}`.toLowerCase().includes(query.trim().toLowerCase())); }), [book, favorites, filter, query, statuses]);
  const filters = [['all', '全部'], ['new', '未学'], ['known', '认识'], ['vague', '模糊'], ['forgot', '忘记'], ['wrong', '记错'], ['favorite', '收藏']] as const;
  return <Screen scroll contentStyle={styles.zero}><TopBar title="单词学习" onBack={onBack} /><View style={styles.page}><AppText variant="pageTitle">{book.name}</AppText><View style={styles.search}><Search color={colors.mutedForeground} size={17} /><TextInput accessibilityLabel="搜索单词或释义" onChangeText={setQuery} placeholder="搜索单词或释义" placeholderTextColor={colors.mutedForeground} style={styles.input} value={query} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.filters}>{filters.map(([key, label]) => <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterActive]}><AppText color={filter === key ? colors.primaryForeground : colors.mutedForeground} variant="button">{label}</AppText></Pressable>)}</View></ScrollView><View style={styles.stack}>{visible.map((word) => { const open = expanded === word.id; const status = statuses[word.id] ?? 'new'; return <Card key={word.id} style={styles.wordRow}><Pressable onPress={() => setExpanded(open ? undefined : word.id)} style={styles.wordMain}><View style={styles.grow}><View style={styles.inline}><AppText variant="sectionTitle">{word.word}</AppText><Tag>{statusLabels[status]}</Tag></View>{!open ? <AppText variant="caption">{word.meaning}</AppText> : null}</View><Pressable accessibilityLabel={favorites.has(word.id) ? '取消收藏' : '收藏'} onPress={(event) => { event.stopPropagation(); onToggleFavorite(word.id); }}><Star color={favorites.has(word.id) ? colors.accent : colors.mutedForeground} fill={favorites.has(word.id) ? colors.accent : 'transparent'} size={18} /></Pressable><ChevronDown color={colors.mutedForeground} size={17} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /></Pressable>{open ? <View style={styles.wordDetail}><AppText style={styles.phonetic}>{word.phonetic}</AppText><AppText>{word.meaning}</AppText></View> : null}</Card>; })}{!visible.length ? <AppText style={styles.empty}>没有符合条件的单词</AppText> : null}</View></View></Screen>;
}

function StudyView({ book, index, favorite, revealed, onBack, onChoose, onMarkWrong, onNext, onToggleFavorite }: { book: Book; index: number; favorite: boolean; revealed: boolean; onBack: () => void; onChoose: (status: WordStatus) => void; onMarkWrong: () => void; onNext: () => void; onToggleFavorite: () => void }) {
  const word = book.words[index];
  return <Screen contentStyle={styles.zero}><TopBar title="单词学习" /><View style={styles.study}><View style={styles.studyTop}><Pressable accessibilityLabel="退出学习" onPress={onBack}><AppText variant="pageTitle">←</AppText></Pressable><AppText variant="button">{index + 1} / {book.words.length}</AppText><Pressable accessibilityLabel={favorite ? '取消收藏' : '收藏'} onPress={onToggleFavorite}><Star color={favorite ? colors.accent : colors.mutedForeground} fill={favorite ? colors.accent : 'transparent'} size={21} /></Pressable></View><Progress value={(index + 1) / book.words.length} /><View style={styles.wordCenter}><AppText style={styles.studyWord} variant="pageTitle">{word.word}</AppText><View style={styles.inline}>{revealed ? <AppText style={styles.phonetic}>{word.phonetic}</AppText> : null}<Pressable accessibilityLabel="播放发音" style={styles.sound}><Volume2 color={colors.primary} size={19} /></Pressable></View>{revealed ? <AppText style={styles.meaning} variant="sectionTitle">{word.meaning}</AppText> : <AppText variant="caption">先回忆中文释义</AppText>}</View>{revealed ? <View style={styles.studyActions}><Button onPress={onMarkWrong} size="lg" variant="outline">记错了</Button><Button onPress={onNext} size="lg">下一词</Button></View> : <View style={styles.studyActionsThree}><Button onPress={() => onChoose('forgot')} size="lg" variant="outline">忘记了</Button><Button onPress={() => onChoose('vague')} size="lg" variant="secondary">模糊</Button><Button onPress={() => onChoose('known')} size="lg">认识</Button></View>}</View></Screen>;
}

function Progress({ value }: { value: number }) { return <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>; }

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0 }, scroll: { flex: 1 }, page: { gap: spacing[4], padding: spacing[5], paddingBottom: spacing[6] }, centerHeader: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] }, center: { textAlign: 'center' }, stack: { gap: spacing[3] }, bookCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], padding: spacing[5] }, selectedCard: { borderColor: colors.primary }, bookIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 44, justifyContent: 'center', width: 44 }, selectedIcon: { backgroundColor: colors.primary }, grow: { flex: 1, gap: spacing[2] }, rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, description: { color: colors.mutedForeground, lineHeight: 24 }, progress: { backgroundColor: colors.secondary, borderRadius: radii.full, height: 7, overflow: 'hidden' }, progressFill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' }, link: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[1], paddingTop: spacing[1] }, sticky: { backgroundColor: colors.background72, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[3] }, backLink: { alignSelf: 'flex-start' }, detailCard: { gap: spacing[3], padding: spacing[5] }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }, stat: { gap: spacing[1], width: '48%' }, statValue: { fontSize: 26 }, search: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4] }, input: { color: colors.foreground, flex: 1, fontSize: 14, height: 46 }, filters: { flexDirection: 'row', gap: spacing[2] }, filter: { borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[4], paddingVertical: spacing[2] }, filterActive: { backgroundColor: colors.primary, borderColor: colors.primary }, wordRow: { padding: 0, overflow: 'hidden' }, wordMain: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], padding: spacing[4] }, inline: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, wordDetail: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[2], padding: spacing[4] }, phonetic: { color: colors.mutedForeground, fontFamily: fonts.monoRegular }, empty: { borderColor: colors.border, borderRadius: radii.xl, borderStyle: 'dashed', borderWidth: 1, padding: spacing[6], textAlign: 'center' }, study: { flex: 1, padding: spacing[5] }, studyTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[3] }, wordCenter: { alignItems: 'center', flex: 1, gap: spacing[4], justifyContent: 'center' }, studyWord: { fontSize: 38 }, sound: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 }, meaning: { fontSize: 20, textAlign: 'center' }, studyActions: { flexDirection: 'row', gap: spacing[3] }, studyActionsThree: { flexDirection: 'row', gap: spacing[2] },
});
