import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Native conversion of the frozen design tokens in icao设计稿/app/globals.css.
 * OKLCH values are converted to sRGB hex because React Native does not expose a
 * consistent cross-platform OKLCH parser.
 */
export const colors = {
  background: '#FBFAF7',
  foreground: '#11161F',
  card: '#FFFFFF',
  cardForeground: '#11161F',
  primary: '#1F5ED9',
  primaryForeground: '#FDFCF8',
  secondary: '#F4F2EC',
  secondaryForeground: '#11161F',
  muted: '#F4F2EC',
  mutedForeground: '#5D636F',
  accent: '#B77610',
  accentForeground: '#FDFCF8',
  destructive: '#DB2B33',
  destructiveForeground: '#FFFFFF',
  answerCorrect: '#34C98A',
  answerCorrectBackground: 'rgba(52, 201, 138, 0.10)',
  answerCorrectBorder: 'rgba(52, 201, 138, 0.45)',
  border: 'rgba(17, 22, 31, 0.09)',
  input: 'rgba(17, 22, 31, 0.12)',
  ring: '#1F5ED9',
  primary06: 'rgba(31, 94, 217, 0.06)',
  primary08: 'rgba(31, 94, 217, 0.08)',
  primary10: 'rgba(31, 94, 217, 0.10)',
  primary20: 'rgba(31, 94, 217, 0.20)',
  card80: 'rgba(255, 255, 255, 0.80)',
  background72: 'rgba(251, 250, 247, 0.72)',
  overlay: 'rgba(17, 22, 31, 0.30)',
} as const;

export const spacing = {
  0: 0,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const radii = {
  sm: 10,
  md: 13,
  lg: 16,
  xl: 22,
  xxl: 29,
  xxxl: 35,
  full: 999,
} as const;

export const fonts = {
  sansRegular: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  serifSemibold: 'NotoSerifSC_600SemiBold',
  monoRegular: 'GeistMono_400Regular',
} as const;

export const type = {
  pageTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.4,
    color: colors.foreground,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: colors.foreground,
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.15,
    color: colors.foreground,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.mutedForeground,
  } satisfies TextStyle,
  caption: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    lineHeight: 19,
    color: colors.mutedForeground,
  } satisfies TextStyle,
  micro: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    lineHeight: 14,
  } satisfies TextStyle,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  } satisfies ViewStyle,
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 6,
  } satisfies ViewStyle,
  modal: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 12,
  } satisfies ViewStyle,
} as const;

export const motion = {
  pressScale: 0.98,
  quick: 140,
  standard: 220,
} as const;
