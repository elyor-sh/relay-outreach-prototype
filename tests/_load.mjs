/**
 * Test helper: load the browser source files into an isolated VM context.
 * The modules are plain scripts (no ESM) so the shipped single-file build
 * needs no bundler — this helper is the Node-side counterpart.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function load(...files) {
  const ctx = vm.createContext({ console, Intl });
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

/** Engine + Data with demo leads and AI drafts applied — a realistic campaign. */
export function demoCampaign(lang = 'ru') {
  const ctx = load('engine.js', 'data.js');
  const { Engine, Data } = vm.runInContext('({ Engine, Data })', ctx);
  const c = Data.defaultCampaign(lang);
  c.leads = Data.demoLeads();
  const { drafts } = Data.composeDrafts({ goal: Data.QUICK_GOALS[0].text[lang === 'en' ? 1 : 0], tone: 'friendly', lang });
  for (const s of c.steps) {
    const d = drafts[s.tpl];
    s.text = d.text;
    if (d.subject) s.subject = d.subject;
  }
  return { Engine, Data, c };
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
