import { createContext } from 'react';
import type { CommerceRuntimeValue } from './commerce-runtime-types';
export const CommerceRuntimeContext = createContext<CommerceRuntimeValue | undefined>(undefined);
