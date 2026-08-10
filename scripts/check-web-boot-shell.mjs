import { brotliCompressSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  WEB_BOOT_BROTLI_MAX_BYTES,
  WEB_BOOT_HTML_MAX_BYTES,
  WEB_BOOT_IDS,
  WEB_BOOT_SENTENCE_INTERVAL_MS,
  WEB_BOOT_SLOW_DELAY_MS,
} from './inject-web-boot-shell.mjs';

const root = resolve(import.meta.dirname, '..');
const indexPath = join(root, 'dist/index.html');
const source = await readFile(indexPath, 'utf8');

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function occurrences(value) {
  return source.split(value).length - 1;
}

for (const id of Object.values(WEB_BOOT_IDS)) {
  assert(occurrences(`id="${id}"`) === 1, `web_boot_marker_invalid:${id}`);
}
assert(occurrences('<div id="root"></div>') === 1, 'web_boot_root_invalid');
assert(source.includes('<html lang="zh-CN">'), 'web_boot_lang_invalid');
assert(source.includes('role="status" aria-live="polite" aria-atomic="true"'), 'web_boot_accessibility_invalid');
assert(source.includes('aria-hidden="true"><span class="icao-web-boot-level"'), 'web_boot_sentence_a11y_invalid');
assert(source.includes(`<noscript><style>#${WEB_BOOT_IDS.shell}{display:none!important}</style></noscript>`), 'web_boot_noscript_fallback_missing');
assert(source.includes(`data-slow-delay="${WEB_BOOT_SLOW_DELAY_MS}"`), 'web_boot_slow_delay_invalid');
assert(source.includes(`data-sentence-interval="${WEB_BOOT_SENTENCE_INTERVAL_MS}"`), 'web_boot_sentence_interval_invalid');
assert(source.includes('prefers-reduced-motion:reduce'), 'web_boot_reduced_motion_missing');
assert(source.includes('new MutationObserver'), 'web_boot_handoff_missing');
assert(source.includes('[data-testid=\"global-loading-screen\"]'), 'web_boot_loading_handoff_missing');
assert(source.includes("mark('icao-shell-visible')"), 'web_boot_shell_visible_mark_missing');
assert(source.includes("mark('icao-app-ready')"), 'web_boot_app_ready_mark_missing');
assert(source.includes('clearInterval(cycleTimer)'), 'web_boot_timer_cleanup_missing');
assert(!source.includes('重新加载'), 'web_boot_reload_action_forbidden');

const mainScript = source.match(/<script src="\/_expo\/static\/js\/web\/index-[^"]+\.js" defer><\/script>/u);
assert(mainScript, 'web_boot_main_script_invalid');
const mainScriptSrc = mainScript[0].match(/src="([^"]+)"/u)?.[1];
const preload = `<link id="${WEB_BOOT_IDS.mainPreload}" rel="preload" as="script" href="${mainScriptSrc}">`;
assert(source.includes(preload), 'web_boot_main_preload_invalid');
const preloadIndex = source.indexOf(preload);
const styleIndex = source.indexOf(`id="${WEB_BOOT_IDS.style}"`);
const shellIndex = source.indexOf(`id="${WEB_BOOT_IDS.shell}"`);
const rootIndex = source.indexOf('<div id="root"></div>');
const mainScriptIndex = source.indexOf(mainScript[0]);
const dataIndex = source.indexOf(`id="${WEB_BOOT_IDS.sentenceData}"`);
const controllerIndex = source.indexOf(`id="${WEB_BOOT_IDS.controller}"`);
assert(shellIndex < rootIndex, 'web_boot_shell_order_invalid');
assert(preloadIndex < styleIndex && styleIndex < shellIndex, 'web_boot_preload_order_invalid');
assert(rootIndex < mainScriptIndex, 'web_boot_main_script_order_invalid');
assert(mainScriptIndex < dataIndex && dataIndex < controllerIndex, 'web_boot_data_order_invalid');

const dataMatch = source.match(new RegExp(`<script id="${WEB_BOOT_IDS.sentenceData}" type="application/json">([\\s\\S]*?)<\\/script>`));
assert(dataMatch, 'web_boot_sentence_data_missing');
const sentences = JSON.parse(dataMatch[1]);
assert(Array.isArray(sentences) && sentences.length === 15, 'web_boot_sentence_count_invalid');
for (const level of ['三级', '四级', '五级']) {
  assert(sentences.filter((sentence) => sentence.l === level).length === 5, `web_boot_sentence_level_invalid:${level}`);
}
assert(sentences.every((sentence) => (
  typeof sentence.e === 'string' && sentence.e.length > 0
  && typeof sentence.z === 'string' && sentence.z.length > 0
)), 'web_boot_sentence_content_invalid');

const bootSource = source.slice(source.indexOf(`<style id="${WEB_BOOT_IDS.style}"`));
for (const forbidden of [
  '@font-face',
  '<img',
  '<audio',
  '<video',
  'fetch(',
  'XMLHttpRequest',
  'new Image',
  'new Audio',
  'WebSocket',
  'import(',
  'url(',
]) {
  assert(!bootSource.includes(forbidden), `web_boot_forbidden_dependency:${forbidden}`);
}

const rawBytes = Buffer.byteLength(source);
const brotliBytes = brotliCompressSync(Buffer.from(source)).length;
assert(rawBytes <= WEB_BOOT_HTML_MAX_BYTES, `web_boot_html_budget_exceeded:${rawBytes}`);
assert(brotliBytes <= WEB_BOOT_BROTLI_MAX_BYTES, `web_boot_brotli_budget_exceeded:${brotliBytes}`);
console.log(`web_boot_shell_check_ok sentences=${sentences.length} raw=${rawBytes} brotli=${brotliBytes}`);
