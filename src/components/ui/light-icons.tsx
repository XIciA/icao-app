import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

// Approved E study: open 26-unit silhouettes, 1.5-unit lines, 12% local planes.
// Containers supply the pale circular background; glyphs remain reusable at any size.
function createLightIcon(name: string, outline: string, plane: ReactNode): LucideIcon {
  const Icon = forwardRef<Svg, LucideProps>(function LightIcon({
    color = colors.primary, size = 24, strokeWidth = 1.5,
    absoluteStrokeWidth, children, ...props
  }, ref) {
    const numericSize = typeof size === 'number' ? size : Number(size);
    const weight = absoluteStrokeWidth && Number.isFinite(numericSize) && numericSize > 0
      ? Number(strokeWidth) * 26 / numericSize : strokeWidth;
    return (
      <Svg ref={ref} width={size} height={size} viewBox="0 0 26 26" fill="none"
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...props}>
        <G fill={color} fillOpacity={0.12}>{plane}</G>
        <Path d={outline} stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
        {children}
      </Svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const Headphones = createLightIcon("Headphones", "M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v7h4v-7zm16 0h1v7h-4v-7zM10 12v5m4-7v9", <><Rect x="2.8" y="12" width="4.2" height="7" rx="1.5" /><Rect x="17" y="12" width="4.2" height="7" rx="1.5" /></>);
export const MessageSquareQuote = createLightIcon("MessageSquareQuote", "M5 4h16v13H10l-5 4V4zm3 4h3v4l-2 2m5-6h3v4l-2 2M2 8v12", <><Path d="M5 4h16v13H10l-5 4z" /></>);
export const RadioTower = createLightIcon("RadioTower", "M9 13h6l2 9H7zm-2-6h10l-2 6H9zM6 7V4h12v3M12 1v3M3 6a9 9 0 0 0 0 8m18-8a9 9 0 0 1 0 8M10 18h4", <><Path d="M7 4h10v3l-2 6H9L7 7zm2 9h6l2 9H7z" /></>);
export const Mic2 = createLightIcon("Mic2", "M9 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-6 9v1a6 6 0 0 0 12 0m-6 6v4m-4 0h8M16 3h6v8l-3-2h-3M8 6h2m-2 3h2", <><Rect x="6" y="2" width="6" height="13" rx="3" /></>);
export const BookOpenText = createLightIcon("BookOpenText", "M12 6C9 3 5 3 2 4v16c4-1 7 0 10 2 3-2 6-3 10-2V4c-4-1-7 0-10 2v16M5 8h4m-4 4h4m-4 4h3m7-7v7m3-9v11", <><Path d="M12 6q5-4 10-2v16q-5-1-10 2z" /></>);
export const BookMarked = createLightIcon("BookMarked", "M5 3h14v19H5a2 2 0 0 1 0-4h14M5 3a2 2 0 0 0-2 2v15m5-7 3-7 3 7m-5-2h4M16 3v6l-2-1-2 1V3", <><Path d="M5 3h14v15H5z" /></>);
export const Radio = createLightIcon("Radio", "M8 2h8a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm2 6 6 4-6 4zM10 19h4M2 9v6m20-6v6", <><Path d="m10 8 6 4-6 4z" /></>);
export const Bot = createLightIcon("Bot", "M7 3H4v19h11M7 3V1h7v4H7V3zm7 0h4v6M7 9h6m-6 4h3m-3 4h2M17 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2v3l2 1", <><Circle cx="17" cy="17" r="5" /></>);
export const Flame = createLightIcon("Flame", "M12 2c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8 0 4 1 5 2 6 2-4 2-7 1-11zM9 17h6m-6 3h4", <><Path d="M12 12c5 4 5 9 0 9s-5-5 0-9z" /></>);
export const FolderOpen = createLightIcon("FolderOpen", "M3 9V5h6l3 3h9v3M2 11h21l-3 10H4zM9 16h7m-3-3 3 3-3 3", <><Path d="M2 11h21l-3 10H4z" /></>);
export const MembershipMark = createLightIcon("MembershipMark", "M12 2 5 5v7c0 5 7 10 7 10s7-5 7-10V5zM5 10 1 8l2 7 3 2m13-7 4-2-2 7-3 2M12 7l1.5 3 3 .5-2.2 2.2.5 3.3-2.8-1.5L9.2 16l.5-3.3L7.5 10.5l3-.5z", <><Path d="m12 2 7 3v7c0 5-7 10-7 10S5 17 5 12V5z" /></>);
export const History = createLightIcon("History", "M4 8a9 9 0 1 1-1 7M4 3v5h5m3-2v7l4 2M5 19h.1", <><Circle cx="12" cy="12" r="8" /></>);
export const AnnotationMark = createLightIcon("AnnotationMark", "M6 3h12v19l-6-4-6 4V3zm3 9 1-3 5-5 2 2-5 5z", <><Path d="M6 3h12v19l-6-4-6 4z" /></>);
export const WordFavorites = createLightIcon("WordFavorites", "M5 3h12v11M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M3 17h8M7 13l3-7 3 7m-5-2h4M18 13l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z", <><Path d="m18 13 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z" /></>);
export const GuideMark = createLightIcon("GuideMark", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 5-3 7-7 3 3-7zM12 3v1m0 16v1M3 12h1m16 0h1", <><Path d="m17 7-3 7-7 3 3-7z" /></>);
export const Settings = createLightIcon("Settings", "m9 2 6 0 1 4 3 1 3 4-3 3 1 4-5 3-3-2-4 1-3-5 2-3-1-4 3-1zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", <><Circle cx="12" cy="12" r="4" /></>);
export const FeedbackMark = createLightIcon("FeedbackMark", "M13 19H9l-6 4V3h19v9M7 8h10m-10 4h6m1 8 1-4 6-6 3 3-6 6z", <><Path d="M13 19H9l-6 4V3h19v9z" /></>);
export const LineChart = createLightIcon("LineChart", "M16 3h-5V1H6v4h5V3zm0 0h3v19H3V3h3M7 18v-4m4 4v-7m4 7V9m1 0 6-6", <><Path d="M5 13h3v6H5zm5-4h3v10h-3zm5-3h3v13h-3z" /></>);
export const GraduationCap = createLightIcon("GraduationCap", "m2 7 10-5 10 5-10 5zm2 4v5l8 4 8-4v-5M4 19l8 4 8-4M22 7v8", <><Path d="m2 7 10-5 10 5-10 5z" /></>);
export const Library = createLightIcon("Library", "M3 4h4v17H3zm7-2h4v19h-4zm7 3 4-1 4 16-4 1zM4 8h2m5-2h2m-2 11h2", <><Path d="M3 4h4v17H3zm7-2h4v19h-4z" /></>);
export const Compass = createLightIcon("Compass", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 5-3 7-7 3 3-7z", <><Path d="m17 7-3 7-7 3 3-7z" /></>);
export const UserRound = createLightIcon("UserRound", "M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 22v-2a8 8 0 0 1 16 0v2", <><Circle cx="12" cy="6" r="4" /></>);
