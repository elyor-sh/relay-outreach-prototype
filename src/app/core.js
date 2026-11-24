/**
 * Relay App — core: helpers, state, persistence, derived data, validation.
 *
 * Architecture (see docs/ARCHITECTURE.md):
 *   state  ──►  App() view functions  ──►  HTML string  ──►  Morph  ──►  DOM
 *     ▲                                                         │
 *     └──── actions (data-action) / bindings (data-bind) ◄─────┘
 *
 * One mutable `state` object is the single source of truth. Both modes (Simple
 * and PRO) render the very same campaign — switching modes never loses data.
 */

const SAVE_KEY = 'relay.prototype.v1';
const params = new URLSearchParams(location.search);
if (params.has('reset')) { try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* private mode */ } }

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape every dynamic value before it reaches markup. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const cls = (...xs) => xs.filter(Boolean).join(' ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const sumValues = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const L = (pair) => Data.L(pair, state.ui.lang);
const clone = (o) => JSON.parse(JSON.stringify(o));

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function freshState(lang) {
  return {
    v: 1,
    ui: {
      mode: 'simple', lang, view: 'builder', wizardStep: 1,
      source: null, pasteText: '',
      expanded: {}, stepTab: {}, msgrTab: 'whatsapp', rulesOpen: false,
      editStep: null, editingDraft: null, addMenu: false,
      gen: null, voice: null,
      inbox: { light: 'all', channel: 'all', q: '', selected: null, draft: '', draftChannel: '' },
      liveTab: 'leads', logFilter: 'all',
      drawer: false, toast: null, launching: false,
      previewLead: 0, tzProbe: '+1 415 555 0192', newStopWord: '',
    },
    campaign: Data.defaultCampaign(lang),
    sim: { launched: false, t: Engine.LAUNCH_T, playing: false, speed: 240, seed: 42, snapshot: null, launchId: 0 },
    inboxLocal: { read: {}, overrides: {}, sent: [], meetings: {} },
    analytics: [],
    session: { startedAt: Date.now(), firstInteractionAt: null, modeSwitches: 0, launchedAt: null },
  };
}

/** UI fields that are never restored after a reload (transient overlays, timers). */
const TRANSIENT_UI = ['gen', 'voice', 'toast', 'launching', 'editStep', 'editingDraft', 'addMenu', 'drawer'];

function loadState() {
  const lang = params.get('lang') === 'en' ? 'en' : 'ru';
  const fresh = freshState(lang);
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: fresh, restored: false };
    const saved = JSON.parse(raw);
    if (saved.v !== fresh.v) return { state: fresh, restored: false };
    const ui = { ...fresh.ui, ...saved.ui, inbox: { ...fresh.ui.inbox, ...(saved.ui || {}).inbox } };
    for (const k of TRANSIENT_UI) ui[k] = fresh.ui[k];
    const savedLang = ui.lang;
    if (params.get('lang')) ui.lang = lang;
    return {
      restored: true,
      langChanged: savedLang !== ui.lang ? savedLang : null,
      state: {
        ...fresh, ...saved, ui,
        campaign: mergeCampaign(fresh.campaign, saved.campaign),
        sim: { ...fresh.sim, ...saved.sim, playing: false },
        session: { ...fresh.session, startedAt: Date.now() },
      },
    };
  } catch (_) {
    return { state: fresh, restored: false };
  }
}

/**
 * Saved campaigns are merged over current defaults, so settings added in a
 * newer build (new channel knobs, rules) get sane values instead of `undefined`.
 */
function mergeCampaign(def, saved) {
  if (!saved) return def;
  const channels = { ...def.channels };
  for (const k of Object.keys(def.channels)) channels[k] = { ...def.channels[k], ...((saved.channels || {})[k] || {}) };
  return { ...def, ...saved, rules: { ...def.rules, ...(saved.rules || {}) }, channels };
}

const boot = loadState();
const state = boot.state;

let persistTimer = 0;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) { /* quota / private mode */ }
  }, 400);
}

/* ------------------------------------------------------------------ */
/* Memoised derived data                                               */
/* ------------------------------------------------------------------ */

/** Campaign revision — bumped on every campaign mutation, invalidates forecasts & checks. */
let rev = 0;
const memo = new Map();
function memoize(key, deps, fn) {
  const m = memo.get(key);
  if (m && m.deps === deps) return m.val;
  const val = fn();
  memo.set(key, { deps, val });
  return val;
}
function bump() { rev++; persistSoon(); }

/** Dry-run of the current settings — powers the PRO forecast and the Simple launch bar. */
/** Engine options shared by the forecast and the live run: inbound texts feed stop-word matching. */
const simOpts = (seed) => ({ seed, replyText: Data.replyTextAll });
const forecast = () => memoize('forecast', `${rev}:${state.sim.seed}`, () => Engine.simulate(state.campaign, simOpts(state.sim.seed)));

let liveRes = null;
let liveResId = -1;
/**
 * Frozen timeline of the launched campaign. The snapshot (campaign + seed) is
 * immutable after launch, so re-simulating it after a reload reproduces the
 * exact same history the inbox state refers to.
 */
function liveResult() {
  if (!state.sim.launched || !state.sim.snapshot) return null;
  if (!liveRes || liveResId !== state.sim.launchId) {
    const snap = state.sim.snapshot;
    liveRes = Engine.simulate(snap, simOpts(snap.seed ?? state.sim.seed));
    liveResId = state.sim.launchId;
  }
  return liveRes;
}

function liveProj() {
  const r = liveResult();
  if (!r) return null;
  const n = Engine.upperBound(r.events, state.sim.t);
  return memoize('proj', `${state.sim.launchId}:${n}`, () => Engine.project(r, state.sim.t));
}

const liveLeads = () => memoize('liveLeads', state.sim.launchId, () => {
  const map = Object.create(null);
  for (const l of (state.sim.snapshot ? state.sim.snapshot.leads : [])) map[l.id] = l;
  return map;
});
const leadById = (id) => liveLeads()[id] || state.campaign.leads.find((l) => l.id === id);

/** All events of the live run grouped by lead (chronological). */
const eventsByLead = () => memoize('byLead', state.sim.launchId, () => {
  const out = Object.create(null);
  for (const e of (liveResult() || { events: [] }).events) if (e.lead) (out[e.lead] || (out[e.lead] = [])).push(e);
  return out;
});

/* ------------------------------------------------------------------ */
/* Analytics (product instrumentation, visible in the Events drawer)   */
/* ------------------------------------------------------------------ */

let evtSeq = 0;
function track(name, props = {}) {
  const e = { id: `${Date.now().toString(36)}-${++evtSeq}`, ts: Date.now(), name, props: { ...props, mode: state.ui.mode } };
  state.analytics.push(e);
  if (state.analytics.length > 300) state.analytics.shift();
  if (!state.session.firstInteractionAt && name !== 'app_opened') state.session.firstInteractionAt = Date.now();
  persistSoon();
}

const settingTimers = new Map();
/** Debounced "setting_changed" so dragging a slider produces one event, not fifty. */
function trackSetting(path, value) {
  clearTimeout(settingTimers.get(path));
  settingTimers.set(path, setTimeout(() => {
    track('setting_changed', { path: path.replace(/^campaign\./, ''), value: typeof value === 'string' && value.length > 40 ? `${value.slice(0, 40)}…` : value });
  }, 700));
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

let toastTimer = 0;
function toast(text, kind = 'ok', ic = null) {
  state.ui.toast = { id: Date.now(), text, kind, ic };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.ui.toast = null; render(); }, 3200);
  render();
}

/* ------------------------------------------------------------------ */
/* Domain helpers                                                      */
/* ------------------------------------------------------------------ */

const MESSENGERS = Engine.MESSENGERS;
const SAFE_PER_NUMBER = { whatsapp: 30, telegram: 40, signal: 40 };
const chColor = (ch) => (Data.CHANNELS[ch] || Data.CHANNELS.messenger).color;
const chName = (ch) => t(`ch.${ch}`);
const isMessengerStep = (s) => s.channel === 'messenger' || MESSENGERS.includes(s.channel);

const steps = () => state.campaign.steps;
const stepById = (id) => steps().find((s) => s.id === id);
const stepIndex = (id) => steps().findIndex((s) => s.id === id);
const stepNo = (s) => stepIndex(s.id) + 1;
const lastDay = () => Math.max(1, ...steps().map((s) => s.day));
const dow = (day) => (day - 1) % 7; // the campaign starts on a Monday
const isWeekendDay = (day) => dow(day) >= 5;

/** Plain-language step title used in Simple mode (by template slot). */
function stepTitle(s) {
  if (s.channel === 'linkedin') return s.kind === 'message' ? t('tpl.li_message') : t('tpl.li_invite');
  if (MESSENGERS.includes(s.channel)) return t('tpl.msg_pinned', { ch: chName(s.channel) });
  return t(`tpl.${s.tpl}`) || chName(s.channel);
}

/** What the referenced step "is" in plain words («письмо», «сообщение»…). */
function stepNoun(s) {
  if (!s) return '';
  if (s.channel === 'email') return t('noun.email');
  if (s.channel === 'linkedin') return t('noun.linkedin');
  if (s.channel === 'sms') return t('noun.sms');
  if (s.channel === 'call') return t('noun.call');
  return t('noun.messenger');
}

/** @param list the step list the condition lives in (current campaign or the launched snapshot). */
function condPlain(s, list = steps()) {
  if (list.findIndex((x) => x.id === s.id) === 0) return t('cond.plain.first');
  if (s.condition === 'no_reply' || !s.ref) return t('cond.plain.no_reply');
  return t(`cond.plain.${s.condition}`, { what: stepNoun(list.find((x) => x.id === s.ref)) });
}

const PLACEHOLDER_LEAD = { id: 'P', firstName: 'Анна', name: 'Анна Смирнова', company: 'ЛогиТех', city: 'moscow', role: 'CEO', tz: 3, has: {} };
const sampleLead = () => state.campaign.leads[state.ui.previewLead] || state.campaign.leads[0] || PLACEHOLDER_LEAD;
/** The lead with the longest name/company — used for worst-case SMS length checks. */
const worstLead = () => memoize('worstLead', state.campaign.leads, () => state.campaign.leads.reduce(
  (w, l) => ((l.firstName.length + l.company.length) > (w.firstName.length + w.company.length) ? l : w), PLACEHOLDER_LEAD));

const personalize = (text, lead) => Data.personalize(text, lead, state.ui.lang);
const smsInfoFor = (s) => Engine.smsInfo(personalize(s.text, worstLead()));

/** Keep steps ordered by day and make sure every condition references an earlier step. */
function normalizeSteps() {
  const list = steps();
  list.sort((a, b) => a.day - b.day);
  list.forEach((s, i) => {
    if (i === 0) { s.condition = 'no_reply'; s.ref = null; return; }
    if (s.condition === 'no_reply') { s.ref = null; return; }
    const earlier = list.slice(0, i);
    if (!s.ref || !earlier.some((p) => p.id === s.ref)) {
      const ref = bestRef(s, s.condition, earlier);
      if (ref) s.ref = ref.id; else { s.condition = 'no_reply'; s.ref = null; }
    }
  });
}

/** The most sensible earlier step for a condition (latest one that can report it). */
function bestRef(s, cond, earlier = steps().slice(0, stepIndex(s.id))) {
  const supports = (p) => {
    const sup = Engine.conditionSupport(p, state.campaign);
    return cond === 'clicked' ? sup.clickable : sup.readable;
  };
  return [...earlier].reverse().find(supports) || [...earlier].reverse().find((p) => p.channel !== 'call') || earlier[earlier.length - 1] || null;
}

/** Condition picker options with availability reasons. */
function condOptions(s) {
  const first = stepIndex(s.id) === 0;
  const earlier = steps().slice(0, stepIndex(s.id));
  const anyReadable = earlier.some((p) => Engine.conditionSupport(p, state.campaign).readable);
  const anyClickable = earlier.some((p) => Engine.conditionSupport(p, state.campaign).clickable);
  return ['no_reply', 'opened', 'not_opened', 'clicked'].map((id) => {
    let reason = '';
    if (first && id !== 'no_reply') reason = t('cond.r.first');
    else if ((id === 'opened' || id === 'not_opened') && !anyReadable) reason = t('cond.r.noRead');
    else if (id === 'clicked' && !anyClickable) reason = t('cond.r.noLink');
    return { id, label: t(`cond.${id}`), disabled: first && id !== 'no_reply', reason };
  });
}

/** Is a branching condition actually observable with the current tracking settings? */
function condIssue(s) {
  if (s.condition === 'no_reply' || !s.ref) return null;
  const ref = stepById(s.ref);
  if (!ref) return null;
  const sup = Engine.conditionSupport(ref, state.campaign);
  if ((s.condition === 'opened' || s.condition === 'not_opened') && !sup.readable) {
    const pixelOff = ref.channel === 'email' && !state.campaign.channels.email.trackOpens;
    const refClickable = sup.clickable;
    return {
      level: 'warn', code: pixelOff ? 'pixel_off' : 'not_readable',
      text: pixelOff ? t('v.pixelOff', { r: stepNo(ref) }) : t('v.notReadable', { r: stepNo(ref) }),
      // "Read" can be replaced by the robust "clicked" signal; "not read" has no click
      // equivalent, so the honest fix there is turning the pixel back on.
      fix: pixelOff
        ? (s.condition === 'opened' && refClickable ? { arg: `cond-clicked:${s.id}`, label: t('fix.toClicked') } : { arg: 'pixel-on', label: t('fix.pixelOn') })
        : null,
    };
  }
  if (s.condition === 'clicked' && !sup.clickable) {
    return { level: 'warn', code: 'no_link', text: t('v.noLink', { r: stepNo(ref) }), fix: null };
  }
  return null;
}

/** Per-step validation — shown inline in the PRO editor and aggregated by the preflight. */
function validateStep(s) {
  const notes = [];
  const C = state.campaign.channels;
  const text = s.text || '';
  if (!text.trim()) notes.push({ level: 'error', code: 'empty', text: t('v.empty'), fix: { arg: 'ai-fill', label: t('fix.aiFill') } });
  if (isMessengerStep(s) && Engine.hasLink(text) && Engine.isFirstMessengerStep(s, state.campaign)) {
    const guarded = s.channel === 'messenger' ? MESSENGERS.every((m) => C[m].noLinksFirst) : C[s.channel].noLinksFirst;
    notes.push(guarded
      ? { level: 'warn', code: 'link_first', text: t('v.linkFirst.on') }
      : { level: 'warn', code: 'link_first_off', text: t('v.linkFirst.off'), fix: { arg: `links-on:${s.channel === 'messenger' ? '' : s.channel}`, label: t('fix.linksOn') } });
  }
  if (s.channel === 'sms') {
    const info = smsInfoFor(s);
    if (info.segments > 1 && C.sms.singleSegment) {
      notes.push({ level: 'error', code: 'sms_long', text: t('v.smsLong', { n: info.length, max: info.perSegment }), fix: { arg: `sms-shorten:${s.id}`, label: t('fix.shorten') } });
    } else if (info.segments > 1) {
      notes.push({ level: 'warn', code: 'sms_multi', text: t('v.smsMulti', { n: info.segments }) });
    }
  }
  if (s.channel === 'linkedin' && s.kind !== 'message' && C.linkedin.inviteNote && text.length > 300) {
    notes.push({ level: 'error', code: 'li_long', text: t('v.liLong', { n: text.length }), fix: { arg: `li-trim:${s.id}`, label: t('fix.shorten') } });
  }
  if (s.channel === 'email' && text.trim() && !(s.subject || '').trim()) notes.push({ level: 'warn', code: 'no_subject', text: t('v.noSubject') });
  const ci = condIssue(s);
  if (ci) notes.push(ci);
  return notes;
}

const usesChannel = (ch) => steps().some((s) => s.channel === ch
  || (s.channel === 'messenger' && state.campaign.rules.cascade.some((c) => c.on && c.id === ch)));

/** Campaign preflight: blocking errors, warnings with one-click fixes, and green checks. */
function preflight() {
  return memoize('preflight', `${rev}:${state.ui.lang}`, () => {
    const c = state.campaign;
    const C = c.channels;
    const out = [];
    if (!c.leads.length) out.push({ level: 'error', text: t('pf.noLeads'), fix: { action: 'pickSource', arg: 'demo', label: t('aud.demo') } });
    for (const s of c.steps) {
      for (const n of validateStep(s)) out.push({ ...n, step: s.id, text: `#${stepNo(s)} · ${n.text}` });
    }
    if (usesChannel('linkedin') && C.linkedin.inviteLimit > 25) out.push({ level: 'warn', text: t('pf.liLimit', { n: C.linkedin.inviteLimit }), fix: { arg: 'li-limit', label: t('fix.liLimit') } });
    if (usesChannel('linkedin') && C.linkedin.proxy === 'none') out.push({ level: 'warn', text: t('pf.noProxy'), fix: { arg: 'proxy-on', label: t('fix.proxy') } });
    if (usesChannel('email') && C.email.dailyLimit > 60) out.push({ level: 'warn', text: t('pf.emailLimit', { n: C.email.dailyLimit }), fix: { arg: 'email-limit', label: t('fix.emailLimit') } });
    if (usesChannel('email') && !C.email.warmup.enabled) out.push({ level: 'warn', text: t('pf.noWarmup'), fix: { arg: 'warmup-on', label: t('fix.warmup') } });
    if (usesChannel('email') && !C.email.mailboxes.some((m) => m.enabled)) out.push({ level: 'error', text: t('pf.noMailbox'), fix: { arg: 'mailbox-on', label: t('fix.mailbox') } });
    for (const m of MESSENGERS) {
      if (!usesChannel(m)) continue;
      if (C[m].dailyPerNumber > SAFE_PER_NUMBER[m]) out.push({ level: 'warn', text: t('pf.msgLimit', { ch: chName(m), n: C[m].dailyPerNumber, safe: SAFE_PER_NUMBER[m] }), fix: { arg: `msg-limit:${m}`, label: t('fix.msgLimit', { n: SAFE_PER_NUMBER[m] }) } });
      if (!C[m].typing) out.push({ level: 'warn', text: t('pf.noTyping', { ch: chName(m) }), fix: { arg: `typing-on:${m}`, label: t('fix.typing') } });
    }
    if (usesChannel('call') && !C.call.amd) out.push({ level: 'warn', text: t('pf.noAmd'), fix: { arg: 'amd-on', label: t('fix.amd') } });
    if ((usesChannel('sms') || usesChannel('call')) && !C.sms.tzByCode) {
      out.push({ level: 'warn', text: t('pf.noTzCode', { n: forecast().stats.offHours }), fix: { arg: 'tz-on', label: t('fix.tzOn') } });
    }
    out.push({ level: 'ok', text: t('pf.ok.stop') });
    out.push({ level: 'ok', text: t('pf.ok.hours', { a: c.rules.workStart, b: c.rules.workEnd }) });
    if (steps().some((s) => s.channel === 'messenger')) out.push({ level: 'ok', text: t('pf.ok.cascade', { list: c.rules.cascade.filter((x) => x.on).map((x) => chName(x.id)).join(' → ') }) });
    const rank = { error: 0, warn: 1, ok: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  });
}

/**
 * Ban-risk score (0–100). A transparent heuristic: every risky setting adds
 * points, so PRO users see exactly which knob moves the needle.
 */
function riskScore() {
  return memoize('risk', rev, () => {
    const C = state.campaign.channels;
    let s = 6;
    if (usesChannel('email')) {
      s += C.email.dailyLimit > 60 ? 16 : C.email.dailyLimit > 45 ? 6 : 0;
      if (!C.email.warmup.enabled) s += 14;
      if (C.email.trackOpens) s += 4;
      s += C.email.mailboxes.filter((m) => m.enabled && m.health < 85).length * 4;
    }
    if (usesChannel('linkedin')) {
      const li = C.linkedin.inviteLimit;
      s += li > 30 ? 26 : li > 20 ? 12 : 0;
      if (C.linkedin.proxy === 'none') s += 12;
      if (!C.linkedin.likeWarmup) s += 4;
    }
    for (const m of MESSENGERS) {
      if (!usesChannel(m)) continue;
      if (!C[m].noLinksFirst) s += 10;
      if (!C[m].typing) s += 4;
      if (C[m].dailyPerNumber > SAFE_PER_NUMBER[m]) s += 9;
    }
    if (usesChannel('call') && !C.call.amd) s += 3;
    if ((usesChannel('sms') || usesChannel('call')) && !C.sms.tzByCode) s += 8; // night SMS → complaints
    const score = clamp(Math.round(s), 0, 100);
    return { score, level: score < 30 ? 'low' : score < 60 ? 'mid' : 'high' };
  });
}

/** "AI" SMS shortener: trims filler, then cuts on a word boundary to fit one segment. */
function shortenSms(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  const fits = (x) => Engine.smsInfo(personalize(x, worstLead())).segments <= 1;
  const cuts = [/ из Relay/, / from Relay/, /, это [^.]+\./, /, it's [^.]+\./, / на этой неделе/, / this week/];
  for (const re of cuts) { if (fits(s)) break; s = s.replace(re, re.source.startsWith(',') ? '.' : ''); }
  while (!fits(s) && s.includes(' ')) s = `${s.replace(/\s+\S+$/, '').replace(/[,.…]+$/, '')}…`.replace(/……$/, '…');
  return s;
}

/* ------------------------------------------------------------------ */
/* Time formatting (simulation minutes → human clock)                  */
/* ------------------------------------------------------------------ */

function clockParts(t, tz) {
  const i = Engine.localInfo(Math.floor(t), tz);
  return { dow: i.dow, hh: i.hh, mm: i.mm, day: i.day };
}
const fmtHM = (T, tz) => { const p = clockParts(T, tz); return `${pad2(p.hh)}:${pad2(p.mm)}`; };
const fmtDHM = (T, tz) => { const p = clockParts(T, tz); return `${t(`dow.${p.dow}`)} ${pad2(p.hh)}:${pad2(p.mm)}`; };
const campaignDay = (T) => Math.floor((T + Engine.SENDER_TZ * 60) / Engine.DAY) - Math.floor((Engine.LAUNCH_T + Engine.SENDER_TZ * 60) / Engine.DAY) + 1;
const tzLabel = (tz) => `UTC${tz >= 0 ? '+' : '−'}${Math.abs(tz)}`;
const cityName = (city) => (Data.CITIES[city] ? L(Data.CITIES[city].name) : city);
