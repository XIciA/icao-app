#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(scriptDir, '../content/question-banks/opi-hotspots.json');
const runtimePath = path.resolve(scriptDir, '../src/features/content/hotspot/data/opi-hotspots.json');

if (!fs.existsSync(sourcePath)) throw new Error('opi_hotspot_source_missing');
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
fs.copyFileSync(sourcePath, runtimePath);
console.log(`OPI hotspot runtime index built at ${runtimePath}`);
