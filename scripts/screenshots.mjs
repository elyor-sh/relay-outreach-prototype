#!/usr/bin/env node
/**
 * Curated screenshots for the README (docs/img/*.png).
 *   node scripts/screenshots.mjs
 * Drives the built index.html with ?fast=1 so animations finish quickly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'img');
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name, el) => {
  await wait(700); // let entrance animations settle
  await page.evaluate(() => document.querySelectorAll('.toast-wrap').forEach((t) => { t.style.display = 'none'; }));
  if (el) await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.evaluate(() => document.querySelectorAll('.toast-wrap').forEach((t) => { t.style.display = ''; }));
  console.log(`✓ docs/img/${name}.png`);
};

await page.goto(`${pathToFileURL(path.join(root, 'index.html')).href}?reset=1&voice=sim&fast=1`);
await tid('source-demo').click();
await shot('01-simple-who', page.locator('.wiz-card'));
await tid('wiz-next').click();
await tid('quick-0').click();
await tid('generate').click();
await tid('drafts').waitFor();
await shot('02-simple-ai-drafts', tid('drafts'));
await tid('wiz-next').click();
await shot('03-simple-track', page.locator('.wiz-card'));
await shot('04-simple-autopilot', tid('autopilot'));
await tid('launch').click();
await tid('live').waitFor();
await page.evaluate(() => { window.Relay.state.sim.t += 60 * 40; window.Relay.render(); });
await wait(300);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('05-live-simple');
await tid('skip').click();
await tid('tab-inbox').click();
await page.locator('[data-testid="threads"] li button').first().click();
await shot('06-inbox');
await tid('mode-pro').click();
await wait(900);
await tid('tab-builder').click();
await page.locator('[data-testid="step-s1"] .step-head').click();
await tid('tab-s1-channel').click();
await page.locator('label.tgl', { has: page.locator('[data-bind="campaign.channels.email.trackOpens"]') }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('07-pro-email-pixel-off');
await page.locator('.risk .chk .btn-link').first().click();
await page.locator('.risk .chk .btn-link').first().click();
await page.locator('[data-testid="step-s3"] .step-head').click();
await page.locator('[data-testid="text-s3"]').fill(`${await page.locator('[data-testid="text-s3"]').inputValue()} Кейс: relay.app/case`);
await wait(200);
await shot('08-pro-messenger-link', page.locator('[data-testid="step-s3"]'));
await page.locator('[data-testid="step-s6"] .step-head').click();
await tid('tab-s6-channel').click();
await shot('09-pro-sms', page.locator('[data-testid="step-s6"]'));
await page.locator('[data-testid="step-s5"] .step-head').click();
await tid('tab-s5-channel').click();
await shot('10-pro-call', page.locator('[data-testid="step-s5"]'));
await tid('tab-live').click();
await tid('live-log').click();
await shot('11-pro-live-log');
await tid('analytics').click();
await shot('12-analytics');
await browser.close();
