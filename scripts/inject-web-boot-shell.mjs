import { brotliCompressSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_BOOT_HTML_MAX_BYTES = 16 * 1024;
export const WEB_BOOT_BROTLI_MAX_BYTES = 4 * 1024;
export const WEB_BOOT_SLOW_DELAY_MS = 10_000;
export const WEB_BOOT_SENTENCE_INTERVAL_MS = 3_000;

export const WEB_BOOT_IDS = {
  controller: 'icao-web-boot-controller',
  mainPreload: 'icao-web-boot-main-preload',
  sentenceData: 'icao-web-boot-sentences',
  shell: 'icao-web-boot-shell',
  style: 'icao-web-boot-style',
};

const root = resolve(import.meta.dirname, '..');
const defaultIndexPath = join(root, 'dist/index.html');
const runtimeQuestionBankPath = 'src/features/question-bank/data/question-bank.json';
const sentenceSelections = [
  {
    level: '三级',
    ids: [
      'sentence900-main-005',
      'sentence900-main-046',
      'sentence900-main-118',
      'sentence900-main-141',
      'sentence900-main-183',
    ],
  },
  {
    level: '四级',
    ids: [
      'sentence900-main-271',
      'sentence900-main-384',
      'sentence900-main-403',
      'sentence900-main-589',
      'sentence900-main-676',
    ],
  },
  {
    level: '五级',
    ids: [
      'sentence900-main-428',
      'sentence900-main-794',
      'sentence900-main-873',
      'sentence900-main-874',
      'sentence900-main-887',
    ],
  },
];

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function compactCss(source) {
  return source
    .replace(/\s+/gu, ' ')
    .replace(/\s*([{}:;,])\s*/gu, '$1')
    .trim();
}

async function loadBootSentences() {
  const source = JSON.parse(await readFile(join(root, runtimeQuestionBankPath), 'utf8'));
  const selectedIds = new Set(sentenceSelections.flatMap((selection) => selection.ids));
  const cards = new Map();

  function collect(value) {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && selectedIds.has(value.id)) {
      if (cards.has(value.id)) throw new Error(`web_boot_sentence_duplicate:${value.id}`);
      cards.set(value.id, value);
    }
    Object.values(value).forEach(collect);
  }

  collect(source);
  const groups = sentenceSelections.map((selection) => (
    selection.ids.map((id) => {
      const card = cards.get(id);
      if (!card || typeof card.audioText !== 'string' || typeof card.audioTextZh !== 'string') {
        throw new Error(`web_boot_sentence_missing:${runtimeQuestionBankPath}:${id}`);
      }
      return { e: card.audioText, l: selection.level, z: card.audioTextZh };
    })
  ));

  return groups[0].flatMap((_, index) => groups.map((group) => group[index]));
}

const style = compactCss(`
  html, body { background: #FBFAF7; }
  #${WEB_BOOT_IDS.shell} {
    background: #FBFAF7;
    bottom: 0;
    color: #11161F;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    inset: 0;
    left: 0;
    overflow: auto;
    position: fixed;
    right: 0;
    top: 0;
    transition: opacity 140ms ease;
    z-index: 2147483646;
  }
  #${WEB_BOOT_IDS.shell}, #${WEB_BOOT_IDS.shell} * { box-sizing: border-box; }
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--exit { opacity: 0; pointer-events: none; }
  .icao-web-boot-frame { height: 100%; position: relative; width: 100%; }
  .icao-web-boot-loader {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
    left: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    transition: top 220ms ease, transform 220ms ease;
    white-space: nowrap;
  }
  .icao-web-boot-mark {
    align-items: center;
    background: rgba(31, 94, 217, 0.10);
    border-radius: 22px;
    color: #1F5ED9;
    display: flex;
    font-family: "Songti SC", STSong, SimSun, serif;
    font-size: 15px;
    font-weight: 600;
    height: 72px;
    justify-content: center;
    width: 72px;
  }
  .icao-web-boot-spinner {
    animation: icao-web-boot-spin 900ms linear infinite;
    border: 2px solid rgba(31, 94, 217, 0.20);
    border-radius: 999px;
    border-top-color: #1F5ED9;
    height: 19px;
    width: 19px;
  }
  .icao-web-boot-opening, .icao-web-boot-slow, .icao-web-boot-zh {
    color: #5D636F;
    font-size: 12px;
    line-height: 19px;
    margin: 0;
  }
  .icao-web-boot-slow {
    left: 50%;
    max-width: 520px;
    opacity: 0;
    overflow-wrap: anywhere;
    position: absolute;
    text-align: center;
    top: 42%;
    transform: translateX(-50%);
    transition: opacity 220ms ease;
    visibility: hidden;
    white-space: normal;
    width: calc(100% - 48px);
  }
  .icao-web-boot-sentence {
    bottom: max(28px, 8vh);
    left: 50%;
    opacity: 0;
    position: absolute;
    transform: translate(-50%, 4px);
    transition: opacity 220ms ease, transform 220ms ease;
    visibility: hidden;
    white-space: normal;
    width: calc(100% - 64px);
    max-width: 520px;
  }
  .icao-web-boot-level {
    color: #1F5ED9;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.5px;
    line-height: 14px;
  }
  .icao-web-boot-rule { background: rgba(31, 94, 217, 0.20); height: 1px; margin: 14px 0 18px; }
  .icao-web-boot-en {
    color: #11161F;
    font-family: "Songti SC", STSong, SimSun, Georgia, serif;
    font-size: 19px;
    font-weight: 600;
    line-height: 30px;
    margin: 0;
    min-height: 90px;
    overflow-wrap: anywhere;
  }
  .icao-web-boot-zh { margin-top: 12px; min-height: 38px; }
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-loader {
    top: clamp(72px, 18vh, 168px);
    transform: translateX(-50%);
  }
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-frame { min-height: 560px; }
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-slow,
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-sentence {
    opacity: 1;
    visibility: visible;
  }
  #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-sentence { transform: translateX(-50%); }
  #${WEB_BOOT_IDS.shell} .icao-web-boot-sentence--changing { opacity: 0; transform: translate(-50%, 4px); }
  @keyframes icao-web-boot-spin { to { transform: rotate(360deg); } }
  @media (max-width: 350px) {
    .icao-web-boot-sentence { bottom: 24px; width: calc(100% - 40px); }
    .icao-web-boot-en { font-size: 17px; line-height: 26px; min-height: 104px; }
  }
  @media (max-height: 700px) {
    #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-loader { top: 54px; }
    .icao-web-boot-slow { top: 250px; }
    .icao-web-boot-sentence { bottom: 20px; }
    .icao-web-boot-en { font-size: 16px; line-height: 24px; min-height: 96px; }
  }
  @media (max-width: 260px) {
    #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-frame {
      align-items: stretch;
      display: flex;
      flex-direction: column;
      gap: 28px;
      height: auto;
      padding: 36px 20px 28px;
    }
    #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-loader,
    #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-slow,
    #${WEB_BOOT_IDS.shell}.icao-web-boot-shell--slow .icao-web-boot-sentence {
      left: auto;
      position: static;
      right: auto;
      top: auto;
      transform: none;
      width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    #${WEB_BOOT_IDS.shell}, #${WEB_BOOT_IDS.shell} * { animation: none !important; transition: none !important; }
  }
`);

const shell = `<div id="${WEB_BOOT_IDS.shell}" data-sentence-interval="${WEB_BOOT_SENTENCE_INTERVAL_MS}" data-slow-delay="${WEB_BOOT_SLOW_DELAY_MS}" role="status" aria-live="polite" aria-atomic="true"><div class="icao-web-boot-frame"><div class="icao-web-boot-loader"><div class="icao-web-boot-mark" aria-hidden="true">ICAO</div><div class="icao-web-boot-spinner" aria-hidden="true"></div><p class="icao-web-boot-opening">正在打开学习空间…</p></div><p class="icao-web-boot-slow" id="icao-web-boot-slow-status"></p><section class="icao-web-boot-sentence" aria-hidden="true"><span class="icao-web-boot-level" id="icao-web-boot-level"></span><div class="icao-web-boot-rule"></div><p class="icao-web-boot-en" id="icao-web-boot-en"></p><p class="icao-web-boot-zh" id="icao-web-boot-zh"></p></section></div></div>`;

const controller = `(function(){'use strict';var s=document.getElementById('${WEB_BOOT_IDS.shell}'),r=document.getElementById('root'),d=document.getElementById('${WEB_BOOT_IDS.sentenceData}');if(!s||!r||!d)return;var q=[],i=0,slow=false,done=false,slowTimer=0,cycleTimer=0,swapTimer=0,removeTimer=0,reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,card=s.querySelector('.icao-web-boot-sentence'),status=document.getElementById('icao-web-boot-slow-status'),level=document.getElementById('icao-web-boot-level'),en=document.getElementById('icao-web-boot-en'),zh=document.getElementById('icao-web-boot-zh');function mark(n){try{if(window.performance&&typeof performance.mark==='function')performance.mark(n)}catch(e){}}mark('icao-shell-visible');function clearCycle(){if(cycleTimer){clearInterval(cycleTimer);cycleTimer=0}if(swapTimer){clearTimeout(swapTimer);swapTimer=0}}function render(){var x=q[i];if(!x)return;level.textContent='900 句 · '+x.l;en.textContent=x.e;zh.textContent=x.z}function next(){if(done||!q.length)return;card.classList.add('icao-web-boot-sentence--changing');swapTimer=setTimeout(function(){i=(i+1)%q.length;render();card.classList.remove('icao-web-boot-sentence--changing');swapTimer=0},140)}function startCycle(){if(!slow||done||reduced||document.hidden||cycleTimer)return;cycleTimer=setInterval(next,${WEB_BOOT_SENTENCE_INTERVAL_MS})}function showSlow(){if(done)return;slow=true;status.innerHTML='加载时间比平时稍长，我们仍在继续加载<br>无需重复刷新';try{q=JSON.parse(d.textContent||'[]')}catch(e){q=[]}if(q.length)render();s.classList.add('icao-web-boot-shell--slow');startCycle()}function ready(){return r.childElementCount>0&&!r.querySelector('[data-testid="global-loading-screen"]')}function exit(){if(done||!ready())return;done=true;mark('icao-app-ready');clearTimeout(slowTimer);clearCycle();clearTimeout(removeTimer);document.removeEventListener('visibilitychange',visibility);observer.disconnect();s.style.pointerEvents='none';s.classList.add('icao-web-boot-shell--exit');removeTimer=setTimeout(function(){s.remove()},reduced?0:160)}function check(){if(ready())requestAnimationFrame(exit)}function visibility(){if(document.hidden)clearCycle();else startCycle()}var observer=new MutationObserver(check);document.addEventListener('visibilitychange',visibility);slowTimer=setTimeout(showSlow,${WEB_BOOT_SLOW_DELAY_MS});if(ready())requestAnimationFrame(exit);else observer.observe(r,{attributes:true,childList:true,subtree:true});})();`;

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}

export function injectWebBootShell(source, sentences) {
  const markers = Object.values(WEB_BOOT_IDS).map((id) => `id="${id}"`);
  const present = markers.filter((marker) => source.includes(marker));
  if (present.length === markers.length) return source;
  if (present.length > 0) throw new Error(`web_boot_partial_injection:${present.join(',')}`);

  const rootAnchor = '<div id="root"></div>';
  if (occurrences(source, rootAnchor) !== 1) throw new Error('web_boot_root_anchor_invalid');
  if (occurrences(source, '</head>') !== 1) throw new Error('web_boot_head_anchor_invalid');
  if (occurrences(source, '</body>') !== 1) throw new Error('web_boot_body_anchor_invalid');
  const mainScript = source.match(/<script src="(\/_expo\/static\/js\/web\/index-[^"]+\.js)" defer><\/script>/u);
  if (!mainScript) throw new Error('web_boot_main_script_invalid');

  let output = source.replace(/<html lang="[^"]*">/u, '<html lang="zh-CN">');
  if (!output.includes('<html lang="zh-CN">')) throw new Error('web_boot_html_lang_invalid');
  output = output.replace(
    '</head>',
    `<link id="${WEB_BOOT_IDS.mainPreload}" rel="preload" as="script" href="${mainScript[1]}"><noscript><style>#${WEB_BOOT_IDS.shell}{display:none!important}</style></noscript><style id="${WEB_BOOT_IDS.style}">${style}</style></head>`,
  );
  output = output.replace(rootAnchor, `${shell}${rootAnchor}`);
  output = output.replace(
    '</body>',
    `<script id="${WEB_BOOT_IDS.sentenceData}" type="application/json">${escapeScriptJson(sentences)}</script><script id="${WEB_BOOT_IDS.controller}">${controller}</script></body>`,
  );
  output = output.replace('You need to enable JavaScript to run this app.', '请启用 JavaScript 后继续使用。');
  return output;
}

async function main() {
  const indexPath = process.env.ICAO_WEB_BOOT_INDEX_PATH
    ? resolve(process.env.ICAO_WEB_BOOT_INDEX_PATH)
    : defaultIndexPath;
  const source = await readFile(indexPath, 'utf8');
  const alreadyInjected = Object.values(WEB_BOOT_IDS).every((id) => source.includes(`id="${id}"`));
  const sentences = alreadyInjected ? [] : await loadBootSentences();
  const output = injectWebBootShell(source, sentences);
  const rawBytes = Buffer.byteLength(output);
  const brotliBytes = brotliCompressSync(Buffer.from(output)).length;
  if (rawBytes > WEB_BOOT_HTML_MAX_BYTES) throw new Error(`web_boot_html_budget_exceeded:${rawBytes}`);
  if (brotliBytes > WEB_BOOT_BROTLI_MAX_BYTES) throw new Error(`web_boot_brotli_budget_exceeded:${brotliBytes}`);
  if (output !== source) await writeFile(indexPath, output, 'utf8');
  console.log(`web_boot_shell_injected sentences=${alreadyInjected ? 15 : sentences.length} raw=${rawBytes} brotli=${brotliBytes}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
