#!/usr/bin/env node
/**
 * Records the product demo video (≈ 2:40) straight from the built prototype.
 *
 *   node scripts/record-demo.mjs            → demo/relay-demo.mp4 (1920×1080, H.264)
 *
 * How it works
 *  - Playwright drives the real index.html in headless Chrome (no mocks).
 *  - Chrome DevTools Protocol screencast streams JPEG frames with timestamps.
 *  - A fake cursor, click ripples and bilingual captions are injected as an
 *    overlay outside #app, so the app itself is untouched.
 *  - ffmpeg (ffmpeg-static) turns the variable-rate frame stream into a
 *    constant 30 fps MP4 using the concat demuxer with per-frame durations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpeg from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'demo', 'relay-demo.mp4');
const FRAMES = path.join('/tmp', 'relay-frames');
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const W = 1600;
const H = 900;
const DPR = 1.2; // 1600×900 CSS px → 1920×1080 video

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const stamp = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${label}`);

/* ----------------------------- captions ----------------------------- */

const CAP = {
  s1: ['Простой режим · 1. Кому пишем', 'Демо-база: 48 руководителей, 7 стран, 9 часовых поясов. Пояс определяем по коду номера.', 'Simple mode · Step 1 — who we write to'],
  s2: ['2. О чём договориться — голосом', 'Диктуем цель → ИИ пишет сообщения под каждый канал с учётом его правил.', 'Step 2 — the goal by voice, AI drafts per channel'],
  s3: ['3. Дорожка шагов по дням', 'Ветки простыми словами: «если прочитал, но молчит», «если открыл ссылку». Выходные — перенос.', 'Step 3 — a visual day-by-day track'],
  ap: ['Защита работает на автопилоте', 'Автостоп при ответе в любом канале · рабочие часы получателя · WhatsApp → Telegram → Signal → SMS', 'Protection on autopilot — nothing to configure'],
  live1: ['Запуск: движок проигрывает кампанию', 'У получателя ночь → ждём 9:00 по его времени. Каждое решение автопилота — в ленте простыми словами.', 'Live — a deterministic engine plays the campaign'],
  live2: ['Ответ в любом канале → стоп всей цепочки', 'Лимит LinkedIn → остаток завтра · нет WhatsApp → Telegram · выходные → понедельник', 'A reply anywhere stops the whole chain'],
  inbox: ['Единое окно входящих со светофором', 'Все каналы в одном списке · ИИ размечает намерение · вся история касаний и момент автостопа', 'Unified inbox with a lead traffic light'],
  pro: ['PRO-режим: та же кампания, все рычаги', 'Одна модель данных — переключение режима ничего не теряет. Справа: карта логики, риск и прогноз.', 'PRO mode — same campaign, every knob'],
  email: ['Email: ротация ящиков · лимиты · прогрев · пиксель', 'Выключили пиксель → ветка «прочитал» стала неизмеримой → предполётная проверка предлагает фикс.', 'Email — rotation, caps, warm-up, pixel off'],
  li: ['LinkedIn: лайк-разогрев · лимит инвайтов · прокси', 'Подняли лимит → риск бана растёт на глазах → «Снизить до 20» в один клик.', 'LinkedIn — like warm-up, daily invite cap, proxy'],
  msg: ['WhatsApp · Telegram · Signal', 'Ссылка в первом сообщении вырезается · «печатает…» · голосовые и кружочки · жёсткий лимит на номер', 'Messengers — no first-message links, typing, voice & video notes, per-number caps'],
  sms: ['SMS: 160 / 70 символов · пояс по коду · стоп-слова', 'Кириллица → UCS-2 → 70 символов на SMS. +7 383 → Новосибирск, UTC+7.', 'SMS — segments, timezone by phone code, stop words'],
  call: ['Звонок: местный номер · автоответчик · ИИ → менеджер', 'Местный Caller ID · AMD · ИИ-голос квалифицирует и тёплым переводом отдаёт менеджеру.', 'Calls — local caller ID, voicemail detection, AI → manager'],
  plive: ['PRO-мониторинг: журнал и ресурсы', 'Каждое решение движка — в журнале; загрузка ящиков и номеров против лимитов.', 'PRO live — event log and resource caps'],
  an: ['Продуктовая аналитика встроена', 'События трекинг-плана: time-to-launch, переключения режимов, PRO-настройки, фиксы.', 'Built-in product analytics (tracking plan)'],
};

const OVERLAY_CSS = `
#rec-cursor{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:30px;height:30px;transform:translate(800px,450px);transition:transform .6s cubic-bezier(.45,.05,.2,1);filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
#rec-ripple{position:fixed;z-index:2147483645;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #8B5CF6;opacity:0}
#rec-ripple.go{animation:recRipple .55s ease-out}
@keyframes recRipple{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
#rec-cap{position:fixed;left:24px;bottom:22px;z-index:2147483640;pointer-events:none;max-width:640px;padding:13px 18px 12px;border-radius:18px;background:rgba(12,14,26,.86);color:#fff;backdrop-filter:blur(10px);box-shadow:0 24px 60px -20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08);font-family:Inter,system-ui,sans-serif;transform:translateY(20px);opacity:0;transition:all .45s cubic-bezier(.2,.8,.2,1)}
#rec-cap.on{transform:none;opacity:1}
#rec-cap .k{display:inline-block;margin-bottom:6px;padding:2px 9px;border-radius:999px;background:linear-gradient(135deg,#6366F1,#EC4899);font-size:12px;font-weight:800;letter-spacing:.04em}
#rec-cap b{display:block;font-size:20px;line-height:1.2;letter-spacing:-.01em}
#rec-cap p{margin:5px 0 0;font-size:14px;line-height:1.4;color:rgba(255,255,255,.82)}
#rec-cap small{display:block;margin-top:6px;font-size:12px;color:rgba(255,255,255,.5);letter-spacing:.02em}
#rec-card{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(900px 500px at 50% 40%,rgba(99,102,241,.45),transparent 70%),#070912;color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center;transition:opacity .7s}
#rec-card.off{opacity:0}
#rec-card .logo{width:96px;height:96px;margin:0 auto 22px;border-radius:28px;display:grid;place-items:center;background:linear-gradient(135deg,#6366F1,#8B5CF6 55%,#EC4899);box-shadow:0 30px 80px -20px rgba(139,92,246,.9)}
#rec-card h1{margin:0;font-size:64px;letter-spacing:-.04em;font-weight:800}
#rec-card h2{margin:10px 0 0;font-size:26px;font-weight:600;color:rgba(255,255,255,.88)}
#rec-card p{margin:18px 0 0;font-size:16px;color:rgba(255,255,255,.55)}
#rec-card ul{display:flex;gap:12px;justify-content:center;margin:26px 0 0;padding:0;list-style:none}
#rec-card li{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);font-size:15px}
`;

const LOGO = '<svg width="54" height="54" viewBox="0 0 32 32"><circle cx="11" cy="21" r="2.6" fill="#fff"/><path d="M11 14.5a6.5 6.5 0 0 1 6.5 6.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M11 8.5A12.5 12.5 0 0 1 23.5 21" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/></svg>';
const CURSOR = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5 19.5 13l-7 1.2 4.2 7.6-3 1.6-4.2-7.7L4 20.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/* ----------------------------- browser ----------------------------- */

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'ru-RU' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${pathToFileURL(path.join(root, 'index.html')).href}?reset=1&voice=sim`);
await page.waitForSelector('[data-testid="source-demo"]');
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.evaluate(({ css, cursor }) => {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  const svg = new DOMParser().parseFromString(cursor, 'image/svg+xml').documentElement;
  c.appendChild(document.importNode(svg, true));
  const r = document.createElement('div');
  r.id = 'rec-ripple';
  const cap = document.createElement('div');
  cap.id = 'rec-cap';
  document.body.append(c, r, cap);
}, { css: OVERLAY_CSS, cursor: CURSOR });

/* ----------------------------- capture ----------------------------- */

const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = path.join(FRAMES, `f${String(frames.length).padStart(6, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, ts: metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

/* ----------------------------- helpers ----------------------------- */

const tid = (id) => page.locator(`[data-testid="${id}"]`);
let cur = { x: W / 2, y: H / 2 };

async function cursorTo(x, y, ms = 650) {
  await page.evaluate(([px, py, d]) => {
    const c = document.getElementById('rec-cursor');
    c.style.transitionDuration = `${d}ms`;
    c.style.transform = `translate(${px - 4}px, ${py - 3}px)`;
  }, [x, y, ms]);
  await page.mouse.move(x, y, { steps: 6 });
  cur = { x, y };
  await sleep(ms + 40);
}

async function reveal(loc, block = 'center') {
  await loc.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await sleep(650);
}

async function point(loc, { fx = 0.5, fy = 0.5, ms = 650, scroll = true } = {}) {
  if (scroll) {
    const inView = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top > 70 && r.bottom < innerHeight - 10; });
    if (!inView) await reveal(loc);
  }
  const b = await loc.boundingBox();
  await cursorTo(b.x + b.width * fx, b.y + b.height * fy, ms);
  return b;
}

async function ripple() {
  await page.evaluate(([x, y]) => {
    const r = document.getElementById('rec-ripple');
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    r.classList.remove('go');
    void r.offsetWidth;
    r.classList.add('go');
  }, [cur.x, cur.y]);
}

async function click(loc, opts = {}) {
  await point(loc, opts);
  await ripple();
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(opts.after ?? 450);
}

async function caption(key, k) {
  const [title, sub, en] = CAP[key];
  await page.evaluate(([kk, a, b, c]) => {
    const el = document.getElementById('rec-cap');
    el.classList.remove('on');
    setTimeout(() => {
      const parts = [['span', 'k', kk], ['b', '', a], ['p', '', b], ['small', '', c]].map(([tag, cls, text]) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        n.textContent = text;
        return n;
      });
      el.replaceChildren(...parts);
      el.classList.add('on');
    }, 260);
  }, [k, title, sub, en]);
  await sleep(300);
  stamp(`caption: ${title}`);
}

async function hideCaption() {
  await page.evaluate(() => document.getElementById('rec-cap').classList.remove('on'));
}

/** Full-screen title / end card built from plain data (no HTML strings). */
async function card({ title, subtitle, chips, footer }, ms) {
  await page.evaluate(([d, logo]) => {
    const mk = (tag, text, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
    const el = mk('div');
    el.id = 'rec-card';
    const inner = mk('div');
    const logoBox = mk('div', '', 'logo');
    logoBox.appendChild(document.importNode(new DOMParser().parseFromString(logo, 'image/svg+xml').documentElement, true));
    const ul = mk('ul');
    for (const c of d.chips) ul.appendChild(mk('li', c));
    inner.append(logoBox, mk('h1', d.title), mk('h2', d.subtitle), ul, mk('p', d.footer));
    el.appendChild(inner);
    document.body.appendChild(el);
  }, [{ title, subtitle, chips, footer }, LOGO]);
  await sleep(ms);
}

async function uncard() {
  await page.evaluate(() => { const el = document.getElementById('rec-card'); el.classList.add('off'); setTimeout(() => el.remove(), 800); });
  await sleep(700);
}

async function slideRange(sel, to, ms = 1400) {
  const loc = page.locator(sel);
  const b = await point(loc, { ms: 500 });
  const [min, max, from] = await loc.evaluate((el) => [Number(el.min), Number(el.max), Number(el.value)]);
  const xOf = (v) => b.x + 10 + ((v - min) / (max - min)) * (b.width - 20);
  await cursorTo(xOf(from), b.y + b.height / 2, 350);
  const steps = Math.abs(to - from);
  for (let i = 1; i <= steps; i++) {
    const v = from + Math.sign(to - from) * i;
    await loc.evaluate((el, val) => { el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await page.evaluate(([x, y]) => { const c = document.getElementById('rec-cursor'); c.style.transitionDuration = '0ms'; c.style.transform = `translate(${x - 4}px, ${y - 3}px)`; }, [xOf(v), b.y + b.height / 2]);
    cur = { x: xOf(v), y: b.y + b.height / 2 };
    await sleep(ms / steps);
  }
}

async function typeInto(loc, text, { clear = false, delay = 55 } = {}) {
  await click(loc, { after: 150 });
  if (clear) {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  } else {
    await loc.evaluate((el) => { el.selectionStart = el.selectionEnd = el.value.length; });
  }
  await page.keyboard.type(text, { delay });
}

const stepHead = (id) => page.locator(`[data-testid="step-${id}"] .step-head`);
const toggleFor = (bind) => page.locator('label.tgl', { has: page.locator(`[data-bind="${bind}"]`) }).locator('.tgl-track');

/* =============================== SCRIPT =============================== */

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
stamp('recording');

// Title card
await card({
  title: 'Relay',
  subtitle: 'Мультиканальный аутрич · Простой и PRO-режим в одном окне',
  chips: ['7 каналов', 'запуск в 3 шага', 'защита на автопилоте', 'единые входящие'],
  footer: 'Clickable prototype · Product Analyst & Prototyper (AI-Driven)',
}, 3200);
await uncard();

// ---------- Simple · step 1
await caption('s1', 'ПРОСТОЙ · 1/3');
await sleep(900);
await click(tid('source-demo'), { after: 900 });
await sleep(2100);
await click(tid('wiz-next'), { after: 700 });

// ---------- Simple · step 2 (voice → AI drafts)
await caption('s2', 'ПРОСТОЙ · 2/3');
await click(tid('mic'), { after: 200 });
await page.waitForFunction(() => !window.Relay.state.ui.voice, null, { timeout: 15000 });
await sleep(500);
await click(tid('generate'), { after: 200 });
await tid('drafts').waitFor({ timeout: 10000 });
await sleep(2100);
await point(page.locator('[data-key="d-s3"]'), { ms: 700, scroll: false });
await sleep(1200);
await click(tid('wiz-next'), { after: 700 });

// ---------- Simple · step 3 (track + autopilot)
await caption('s3', 'ПРОСТОЙ · 3/3');
await reveal(tid('track'), 'center');
await sleep(900);
await click(tid('node-s3'), { after: 600 });
await sleep(2400);
await click(page.locator('.sheet-foot .btn-primary'), { after: 500 });
await caption('ap', 'АВТОПИЛОТ');
await reveal(tid('autopilot'), 'center');
await point(page.locator('.ap-card').nth(0), { fy: 0.3, ms: 700, scroll: false });
await sleep(1300);
await point(page.locator('.ap-card').nth(1), { fy: 0.3, ms: 600, scroll: false });
await sleep(1300);
await point(page.locator('.ap-card').nth(2), { fy: 0.3, ms: 600, scroll: false });
await sleep(1200);

// ---------- Launch → live
await click(tid('launch'), { after: 200 });
await hideCaption();
await sleep(2300);
await caption('live1', 'МОНИТОРИНГ');
await cursorTo(1180, 160, 700);
await sleep(4600);
await click(page.locator('.live-ctrls .seg button').nth(2), { after: 300 });
await caption('live2', 'МОНИТОРИНГ');
await cursorTo(640, 560, 900);
await sleep(10600);

// ---------- Inbox
await caption('inbox', 'ВХОДЯЩИЕ');
await click(tid('tab-inbox'), { after: 900 });
await click(tid('lamp-green'), { after: 700 });
await click(page.locator('[data-testid="threads"] li button').first(), { after: 600 });
await page.evaluate(() => { const b = document.querySelector('.thread-body'); b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); });
await sleep(2200);
await point(page.locator('.lc-sec.ai'), { ms: 700, scroll: false });
await sleep(1400);
await click(tid('ai-draft'), { after: 1800 });
await click(tid('send'), { after: 1300 });

// ---------- Switch to PRO (circular view transition)
await caption('pro', 'PRO');
await click(tid('mode-pro'), { after: 1600 });
await click(tid('tab-builder'), { after: 900 });
await click(page.locator('[data-testid="rules"] .panel-head'), { after: 2300 });
await click(page.locator('[data-testid="rules"] .panel-head'), { after: 500 });

// Email
await caption('email', 'PRO · EMAIL');
await click(stepHead('s1'), { after: 700 });
await click(tid('tab-s1-channel'), { after: 1500 });
await reveal(toggleFor('campaign.channels.email.trackOpens'), 'center');
await click(toggleFor('campaign.channels.email.trackOpens'), { after: 900 });
await point(page.locator('.lm-arc.is-bad').first(), { ms: 800, scroll: false });
await sleep(1800);
await click(page.locator('.risk .chk .btn-link').first(), { after: 1400 });
await click(page.locator('.risk .chk .btn-link').first(), { after: 1200 });

// LinkedIn
await caption('li', 'PRO · LINKEDIN');
await click(stepHead('s2'), { after: 700 });
await click(tid('tab-s2-channel'), { after: 1100 });
await slideRange('[data-bind="campaign.channels.linkedin.inviteLimit"]', 38, 1600);
await sleep(700);
await point(tid('risk-score'), { ms: 700, scroll: false });
await sleep(1300);
await click(page.locator('.risk .chk .btn-link').first(), { after: 1200 });

// Messengers
await caption('msg', 'PRO · МЕССЕНДЖЕРЫ');
await click(stepHead('s3'), { after: 700 });
await typeInto(tid('text-s3'), ' Кейс: relay.app/case', { delay: 60 });
await sleep(700);
await point(page.locator('[data-testid="step-s3"] .pv-strip'), { ms: 700, scroll: false });
await sleep(1600);
await click(tid('tab-s3-channel'), { after: 1200 });
await click(tid('msgr-telegram'), { after: 900 });
await reveal(page.locator('[data-key="msgr-telegram"]'), 'center');
await point(toggleFor('campaign.channels.telegram.videoNotes'), { ms: 600, scroll: false });
await sleep(1300);

// SMS
await caption('sms', 'PRO · SMS');
await click(stepHead('s6'), { after: 700 });
await click(tid('tab-s6-channel'), { after: 1000 });
await point(page.locator('.sms-meter'), { ms: 600 });
await sleep(900);
await typeInto(tid('tz-probe'), '+7 383 555 12 34', { clear: true, delay: 50 });
await sleep(1200);
await typeInto(page.locator('[data-bind="ui.newStopWord"]'), 'хватит', { clear: true, delay: 70 });
await page.keyboard.press('Enter');
await sleep(1200);

// Call
await caption('call', 'PRO · ЗВОНОК');
await click(stepHead('s5'), { after: 700 });
await click(tid('tab-s5-channel'), { after: 1000 });
await point(page.locator('[data-testid="step-s5"] .cs-block').nth(1), { fy: 0.3, ms: 700 });
await sleep(1000);
await point(page.locator('[data-testid="step-s5"] .cs-block').nth(2), { fy: 0.3, ms: 700 });
await sleep(1300);

// PRO live
await caption('plive', 'PRO · МОНИТОРИНГ');
await click(tid('tab-live'), { after: 900 });
await click(tid('live-log'), { after: 800 });
await click(page.locator('.log-filters .chip').nth(2), { after: 1800 });
await click(tid('live-resources'), { after: 2000 });

// Analytics
await caption('an', 'АНАЛИТИКА');
await click(tid('analytics'), { after: 2600 });
await hideCaption();

// End card
await card({
  title: 'Relay',
  subtitle: 'Один HTML-файл · без зависимостей · работает офлайн',
  chips: ['детерминированный движок', 'RU / EN', 'unit + e2e тесты', 'продуктовая документация'],
  footer: 'index.html · README.md · docs/',
}, 3400);

await cdp.send('Page.stopScreencast');
stamp(`captured ${frames.length} frames`);
await browser.close();
if (errors.length) console.warn('page errors:', errors);

/* ----------------------------- encode ----------------------------- */

const list = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const dur = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : 0.5;
  list.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`);
}
list.push(`file '${frames[frames.length - 1].file}'`);
const listFile = path.join(FRAMES, 'list.ffconcat');
fs.writeFileSync(listFile, list.join('\n'));
const total = frames[frames.length - 1].ts - frames[0].ts;
stamp(`encoding ${total.toFixed(1)} s of video`);
const res = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', `fps=30,scale=${W * DPR}:${H * DPR}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', OUT,
], { stdio: 'inherit' });
if (res.status !== 0) process.exit(res.status || 1);
const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
stamp(`✓ ${path.relative(root, OUT)} — ${mb} MB, ${total.toFixed(1)} s`);
