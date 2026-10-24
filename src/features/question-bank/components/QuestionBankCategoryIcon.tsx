import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { BookOpenText, CaseUpper, CloudSun, Cog, Headphones, ImageIcon, Layers, ListChecks, Plane, RadioTower, Route, TriangleAlert, UserRound } from '@/components/ui/icons';
import { colors, fonts } from '@/theme';
import type { QuestionBankId } from '../types';
import { AirlineMark, hasAirlineMark } from './AirlineMark';

const symbols = { plane: Plane, tower: RadioTower, weather: CloudSun, emergency: TriangleAlert, abbreviations: CaseUpper, human: UserRound, operations: Route, systems: Cog, other: Layers, image: ImageIcon, training: ListChecks, listening: Headphones, book: BookOpenText };
type SymbolName = keyof typeof symbols;
type CategoryGlyph = { symbol: SymbolName; duration?: '10s' | '20s' } | { level: '3' | '4' | '5' };

// Stable IDs keep the meaning intact when a scoped directory is filtered, reordered or renamed.
const glyphs: Partial<Record<QuestionBankId, Record<string, CategoryGlyph>>> = {
  listening: {
    'listening-category-01': { symbol: 'plane', duration: '10s' },
    'listening-category-02': { symbol: 'tower', duration: '20s' },
    'listening-category-03': { symbol: 'plane', duration: '20s' },
    'listening-category-04': { symbol: 'tower', duration: '10s' },
  },
  sentences900: { 'sentence900-3级': { level: '3' }, 'sentence900-4级': { level: '4' }, 'sentence900-5级': { level: '5' } },
  radiotelephony: { 'atc-scoring-points': { symbol: 'training' } },
  opi: {
    'opi-category-01': { symbol: 'weather' }, 'opi-category-02': { symbol: 'emergency' },
    'opi-category-03': { symbol: 'abbreviations' }, 'opi-category-04': { symbol: 'human' },
    'opi-category-05': { symbol: 'operations' }, 'opi-category-06': { symbol: 'systems' },
    'opi-category-07': { symbol: 'other' }, 'opi-category-08': { symbol: 'image' },
  },
  storytelling: { 'story-category-1': { symbol: 'plane' }, 'story-category-2': { symbol: 'tower' } },
};
const fallback: Record<QuestionBankId, SymbolName> = { listening: 'listening', sentences900: 'book', radiotelephony: 'tower', opi: 'book', storytelling: 'book' };

// Oxanium Light outlines, same family as the approved wide rounded 9; no runtime font loading.
// Source: google/fonts/ofl/oxanium (SIL OFL, assets/licenses/Oxanium-OFL.txt).
const levelPaths = {
  '3': 'M77 30V61H365Q444 61 444 139V255Q444 334 365 334H151V394H365Q444 394 444 473V551Q444 629 365 629H87V660L126 690H362Q511 690 511 541V466Q511 426 486 401L451 366L486 331Q511 306 511 266V149Q511 0 362 0H116Z',
  '4': 'M67 137V192L304 690H359L368 673L141 197H444V430H511V0H444V137Z',
  '5': 'M57 30V61H365Q444 61 444 139V265Q444 344 365 344H67V690H481V629H134V404H362Q511 404 511 255V149Q511 0 362 0H96Z',
};

export function QuestionBankCategoryIcon({ bankId, categoryId, categoryName }: { bankId: QuestionBankId; categoryId: string; categoryName: string }) {
  if (bankId === 'radiotelephony' && hasAirlineMark(categoryName)) return <AirlineMark code={categoryName} />;
  const glyph = glyphs[bankId]?.[categoryId] ?? { symbol: fallback[bankId] };
  return <View style={[styles.glyph, 'duration' in glyph && styles.durationGlyph]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {'level' in glyph ? <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden={true} testID={`category-level-${glyph.level}`}>
      <Path d={levelPaths[glyph.level]} fill={colors.primary} transform="translate(3.62 22) scale(0.028986 -0.028986)" />
    </Svg> : (() => {
      const Icon = symbols[glyph.symbol];
      return <><Icon testID={`category-symbol-${glyph.symbol}`} size={22} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" color={colors.primary} />
        {glyph.duration ? <AppText testID="category-duration" maxFontSizeMultiplier={1} style={styles.duration}>{glyph.duration}</AppText> : null}</>;
    })()}
  </View>;
}

const styles = StyleSheet.create({
  glyph: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  durationGlyph: { justifyContent: 'flex-start' },
  duration: { position: 'absolute', right: -2, bottom: -3, backgroundColor: colors.primary10, borderRadius: 3, paddingHorizontal: 2, color: colors.primary, fontFamily: fonts.monoRegular, fontSize: 10, lineHeight: 12 },
});
