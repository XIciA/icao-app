#!/usr/bin/env node
// Native and the formal Web runtime import the authoritative source directly.
// The legacy Vercel runtime index is frozen and must not be overwritten.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
execFileSync(process.execPath, [fileURLToPath(new URL('./validate-opi-hotspots.mjs', import.meta.url))], { stdio: 'inherit' });
