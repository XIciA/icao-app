import { createContext } from 'react';
import type { View } from 'react-native';
export const GuideScrollContext = createContext<((node: View, step: string) => void) | null>(null);
