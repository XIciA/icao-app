import type { PropsWithChildren } from 'react';
/** Platform resolver keeps the Android payment module out of the iOS runtime. */
export function AndroidCommerceRuntimeProvider({ children }: PropsWithChildren) { return children; }
