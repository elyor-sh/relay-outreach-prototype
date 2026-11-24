import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { load } from './_load.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = load('i18n.js');
const I18N = vm.runInContext('I18N', ctx);
const t = vm.runInContext('t', ctx);

/** Russian-only grammar: `g.f` is the feminine verb suffix («ответил{a}»), English needs none. */
const RU_ONLY_KEYS = new Set(['g.f']);
const RU_ONLY_PARAMS = new Set(['{a}']);

test('every key has a non-empty RU and EN string', () => {
  for (const [k, v] of Object.entries(I18N)) {
    assert.ok(Array.isArray(v) && v.length === 2, k);
    assert.ok(v[0], `${k} has an empty RU translation`);
    if (!RU_ONLY_KEYS.has(k)) assert.ok(v[1], `${k} has an empty EN translation`);
  }
});

test('placeholders match between languages', () => {
  const ph = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].filter((p) => !RU_ONLY_PARAMS.has(p)).sort().join();
  for (const [k, [ru, en]] of Object.entries(I18N)) assert.equal(ph(ru), ph(en), k);
});

test('plural forms: 3 for RU, 2 for EN', () => {
  for (const [k, [ru, en]] of Object.entries(I18N)) {
    if (!ru.includes('|') && !en.includes('|')) continue;
    assert.equal(ru.split('|').length, 3, `${k} (ru)`);
    assert.equal(en.split('|').length, 2, `${k} (en)`);
  }
  assert.equal(t('lb.days', { n: 1 }), '1 день');
  assert.equal(t('lb.days', { n: 3 }), '3 дня');
  assert.equal(t('lb.days', { n: 8 }), '8 дней');
  assert.equal(t('lb.days', { n: 21 }), '21 день');
});

test('every static t(\'key\') used in the app exists in the dictionary', () => {
  const dir = path.join(root, 'src');
  const files = ['app/core.js', 'app/views-common.js', 'app/views-simple.js', 'app/views-pro.js', 'app/views-live.js', 'app/views-inbox.js', 'app/actions.js', 'app/render.js'];
  const missing = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of code.matchAll(/\bt\('([\w.]+)'/g)) if (!I18N[m[1]]) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});
