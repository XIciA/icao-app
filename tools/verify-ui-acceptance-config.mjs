import { readFile } from 'node:fs/promises';

const flag = 'EXPO_PUBLIC_ICAO_UI_ACCEPTANCE';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const scripts = packageJson.scripts ?? {};
const envExample = await readFile('.env.example', 'utf8');

if (!scripts['web:export']?.includes(`${flag}=0`)) {
  throw new Error('The production Web export must force UI acceptance mode off.');
}
if (!scripts['web:acceptance']?.includes(`${flag}=1`)) {
  throw new Error('The local Web acceptance command must explicitly enable UI acceptance mode.');
}
if (!scripts['web:acceptance:export']?.includes(`${flag}=1`)) {
  throw new Error('The local Web acceptance export must explicitly enable UI acceptance mode.');
}
for (const name of ['web', 'web:acceptance', 'web:acceptance:export', 'web:export']) {
  if (!scripts[name]?.includes('--clear')) {
    throw new Error(`${name} must clear Metro cache before switching UI acceptance mode.`);
  }
}
if (!envExample.includes(`${flag}=0`)) {
  throw new Error('The example environment must default UI acceptance mode to off.');
}

console.log('UI acceptance configuration verified');
