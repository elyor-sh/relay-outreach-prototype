#!/usr/bin/env node
/**
 * End-to-end smoke test: drives the real built index.html in headless Chrome
 * through both modes and asserts the key product behaviours.
 *
 *   node scripts/e2e.mjs            # assertions + screenshots in /tmp/relay-e2e
 *
 * Uses playwright-core with the system Chrome (no browser download needed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS || '/tmp/relay-e2e';
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const url = `${pathToFileURL(path.join(root, 'index.html')).href}?reset=1&voice=sim&fast=1`;
await page.goto(url);
const snap = (n) => page.screenshot({ path: path.join(shots, `${n}.png`), fullPage: false });
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const S = () => page.evaluate(() => window.Relay.state);

try {
  /* ---------------- Simple mode: 3-step wizard ---------------- */
  await snap('01-simple-start');
  check('starts in Simple mode', (await page.getAttribute('html', 'data-mode')) === 'simple');
  await tid('source-demo').click();
  await tid('audience').waitFor();
  check('demo audience loaded', (await S()).campaign.leads.length === 48);
  await snap('02-audience');
  await tid('wiz-next').click();
  await tid('mic').click();
  await page.waitForFunction(() => !window.Relay.state.ui.voice, null, { timeout: 8000 });
  check('voice dictation fills the goal', (await S()).campaign.goal.length > 40);
  await tid('generate').click();
  await tid('drafts').waitFor({ timeout: 8000 });
  const st = await S();
  check('AI wrote every step', st.campaign.steps.every((s) => s.text.length > 10));
  check('no link in first messenger message', !/relay\.app/.test(st.campaign.steps.find((s) => s.channel === 'messenger').text));
  await snap('03-drafts');
  await tid('wiz-next').click();
  await tid('track').waitFor();
  await tid('autopilot').waitFor();
  await snap('04-track');
  await tid('node-s3').click();
  await tid('sheet').waitFor();
  await snap('05-sheet');
  await page.keyboard.press('Escape');
  await tid('launch').click();
  await tid('live').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await snap('06-live-simple');
  check('feed shows events', (await page.locator('[data-testid="feed"] li').count()) > 0);
  await tid('skip').click();
  await page.waitForTimeout(200);
  await snap('07-live-end');
  const proj = await page.evaluate(() => window.Relay.liveProj().metrics);
  check('simulation produced replies and auto-stops', proj.replied > 0 && proj.stops > 0, JSON.stringify({ replied: proj.replied, stops: proj.stops, night: proj.night }));

  /* ---------------- Inbox ---------------- */
  await tid('tab-inbox').click();
  await tid('inbox').waitFor();
  const threads = await page.locator('[data-testid="threads"] li button').count();
  check('inbox has threads', threads > 0, `${threads} threads`);
  await page.locator('[data-testid="threads"] li button').first().click();
  check('auto-stop divider visible in thread', (await page.locator('.stop-divider').count()) > 0);
  await tid('ai-draft').click();
  await page.waitForTimeout(300);
  await tid('send').click();
  await page.waitForTimeout(200);
  check('manual reply appended', (await page.locator('.msg.you').count()) === 1);
  await tid('lamp-green').click();
  await snap('08-inbox');

  /* ---------------- PRO mode ---------------- */
  await tid('mode-pro').click();
  await page.waitForTimeout(900);
  check('PRO mode active', (await page.getAttribute('html', 'data-mode')) === 'pro');
  await snap('09-inbox-pro');
  await tid('tab-builder').click();
  await tid('pro-builder').waitFor();
  await page.locator('[data-testid="step-s1"] .step-head').click();
  await tid('tab-s1-channel').click();
  await snap('10-pro-email');
  await page.locator('[data-bind="campaign.channels.email.trackOpens"]').evaluate((el) => el.click());
  await page.waitForTimeout(150);
  check('pixel off → warning on «opened» branch', (await page.locator('[data-testid="step-s3"] .issue').count()) > 0);
  await snap('11-pro-pixel-off');
  const risk0 = Number(await tid('risk-score').innerText());
  await page.locator('[data-testid="step-s2"] .step-head').click();
  await tid('tab-s2-channel').click();
  await page.locator('[data-bind="campaign.channels.linkedin.inviteLimit"]').fill('40');
  await page.waitForTimeout(150);
  const risk1 = Number(await tid('risk-score').innerText());
  check('risk score reacts to limits', risk1 > risk0, `${risk0} → ${risk1}`);
  const fixBtn = page.locator('.risk .btn-link', { hasText: /20/ }).first();
  await fixBtn.click();
  await page.waitForTimeout(150);
  check('one-click fix restores safe limit', (await S()).campaign.channels.linkedin.inviteLimit === 20);
  await page.locator('[data-testid="step-s6"] .step-head').click();
  await tid('tab-s6-channel').click();
  await snap('12-pro-sms');
  await page.locator('[data-testid="step-s3"] .step-head').click();
  await tid('tab-s3-channel').click();
  await snap('13-pro-messenger');
  await tid('tab-s3-message').click();
  await page.locator('[data-testid="text-s3"]').fill('Hi {{firstName}}! See https://relay.app/case');
  await page.waitForTimeout(150);
  check('link in first messenger message is flagged', (await page.locator('[data-testid="step-s3"] .note.warn').count()) > 0);
  await snap('14-pro-link');
  await page.locator('[data-testid="step-s5"] .step-head').click();
  await tid('tab-s5-channel').click();
  await snap('15-pro-call');
  await tid('tab-live').click();
  await tid('live-log').click();
  await snap('16-live-pro-log');
  await tid('live-resources').click();
  await snap('17-live-pro-res');
  await tid('live-leads').click();
  await snap('18-live-pro-leads');

  /* ---------------- i18n ---------------- */
  await tid('lang').click();
  await page.waitForTimeout(200);
  await tid('tab-builder').click();
  await page.waitForTimeout(200);
  await snap('19-pro-en');
  await tid('mode-simple').click();
  await page.waitForTimeout(900);
  await snap('20-simple-en');
  await tid('analytics').click();
  await tid('drawer').waitFor();
  await snap('21-analytics');
  const names = await page.evaluate(() => [...new Set(window.Relay.state.analytics.map((e) => e.name))]);
  check('tracking plan events emitted', ['campaign_launched', 'mode_switched', 'messages_generated', 'goal_input'].every((n) => names.includes(n)), names.length + ' event types');
} catch (e) {
  check('flow completed without exceptions', false, e.message.split('\n')[0]);
  await snap('99-failure');
}

const real = problems.filter((p) => !/fonts\.g|ERR_|net::/.test(p));
check('no console errors / missing i18n keys', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed · screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
