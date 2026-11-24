/**
 * Relay App — actions and event wiring.
 *
 * Every interactive element declares intent in markup:
 *   data-action="name" data-arg="…"  →  A.name(arg, el, event)
 *   data-bind="path.to.field"          →  two-way binding into `state`
 * One delegated listener per event type — no per-node handlers to leak.
 */

const A = {
  /* ----------------------------- navigation ----------------------------- */
  nav(view) {
    if (state.ui.view === view) return;
    state.ui.view = view;
    state.ui.addMenu = false;
    track('view_opened', { view });
    render();
    scrollTop();
  },
  setMode(mode, _el, ev) { switchMode(mode, ev); },
  goPro(section) {
    if (section === 'rules') state.ui.rulesOpen = true;
    switchMode('pro');
  },
  toggleLang() { switchLang(state.ui.lang === 'ru' ? 'en' : 'ru'); },
  toggleDrawer() {
    state.ui.drawer = !state.ui.drawer;
    if (state.ui.drawer) track('analytics_drawer_opened');
    renderNow();
    if (state.ui.drawer) openDialog('[data-testid="drawer"]'); else closeDialog();
  },
  exportAnalytics() {
    const blob = new Blob([JSON.stringify(state.analytics, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relay-analytics-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  resetDemo() {
    if (!window.confirm(t('an.confirmReset'))) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
    // Same-document reload: only the query string changes, never the origin or path.
    history.replaceState(null, '', state.ui.lang === 'en' ? '?lang=en' : '?');
    location.reload();
  },
  closeToast() { state.ui.toast = null; render(); },
  setVal(arg) {
    const [path, raw] = arg.split('|');
    const v = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    setPath(state, path, v);
    onBound(path, v);
    render();
  },

  /* ------------------------------- wizard ------------------------------- */
  wizGo(n) { setWizard(Number(n)); },
  wizNext() { setWizard(state.ui.wizardStep + 1); },
  wizBack() { setWizard(state.ui.wizardStep - 1); },

  pickSource(src) {
    state.ui.source = src;
    track('audience_source_selected', { source: src });
    if (src === 'demo') loadLeads(Data.demoLeads(), 'demo');
    if (src === 'file') document.getElementById('file-input')?.click();
    render();
  },
  parsePaste() {
    const leads = Data.parseList(state.ui.pasteText);
    if (!leads.length) { toast(t('toast.parseFail'), 'warn'); return; }
    loadLeads(leads, 'paste');
  },
  clearAudience() {
    state.campaign.leads = [];
    state.ui.source = null;
    bump();
    render();
  },

  quickGoal(i) {
    const g = Data.QUICK_GOALS[Number(i)];
    state.campaign.goal = L(g.text);
    bump();
    track('goal_input', { method: 'chip', chip: g.label[1] });
    render();
  },
  toggleVoice() { if (state.ui.voice) stopVoice(); else startVoice(); },
  generate() { generateMessages(); },
  editDraft(id) { state.ui.editingDraft = state.ui.editingDraft === id ? null : id; render(); },

  /* -------------------------------- steps ------------------------------- */
  openStep(id) {
    state.ui.editStep = id;
    track('step_opened', { step: id });
    renderNow();
    openDialog('[data-testid="sheet"]');
  },
  closeStep() { state.ui.editStep = null; renderNow(); closeDialog(); },
  stepDay(arg) {
    const [id, d] = arg.split(':');
    const s = stepById(id);
    if (!s) return;
    s.day = clamp(s.day + Number(d), 1, 21);
    normalizeSteps();
    bump();
    trackSetting(`steps.${id}.day`, s.day);
    render();
  },
  setCond(arg) {
    const [id, cond] = arg.split(':');
    const s = stepById(id);
    if (!s) return;
    s.condition = cond;
    if (cond === 'no_reply') s.ref = null;
    else {
      const ref = bestRef(s, cond);
      s.ref = ref ? ref.id : null;
      if (!ref) s.condition = 'no_reply';
    }
    bump();
    track('condition_set', { step: id, condition: s.condition });
    render();
  },
  removeStep(id) {
    if (steps().length <= 1) { toast(t('toast.lastStep'), 'warn'); return; }
    const s = stepById(id);
    state.campaign.steps = steps().filter((x) => x.id !== id);
    for (const x of steps()) if (x.ref === id) { x.ref = null; x.condition = 'no_reply'; }
    normalizeSteps();
    state.ui.editStep = null;
    bump();
    track('step_removed', { channel: s.channel });
    toast(t('toast.stepRemoved'), 'ok', 'trash');
  },
  toggleAddMenu() {
    state.ui.addMenu = !state.ui.addMenu;
    renderNow();
    if (state.ui.addMenu) scrollToTestId('add-menu');
  },
  addStep(channel) { addStep(channel); },

  /* --------------------------------- PRO -------------------------------- */
  toggleStep(id) {
    const open = !state.ui.expanded[id];
    // Single-open accordion keeps the long PRO page navigable.
    state.ui.expanded = open ? { [id]: true } : {};
    if (open) track('step_expanded', { step: id, channel: stepById(id)?.channel });
    renderNow();
    if (open) scrollToTestId(`step-${id}`, 'start');
  },
  stepTab(arg) {
    const [id, tab] = arg.split(':');
    state.ui.stepTab = { ...state.ui.stepTab, [id]: tab };
    track('step_tab_opened', { step: id, tab });
    render();
  },
  msgrTab(ch) { state.ui.msgrTab = ch; render(); },
  toggleRules() { state.ui.rulesOpen = !state.ui.rulesOpen; render(); },
  cascadeMove(arg) {
    const [id, d] = arg.split(':');
    const list = state.campaign.rules.cascade;
    const i = list.findIndex((c) => c.id === id);
    const j = i + Number(d);
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    bump();
    track('cascade_reordered', { order: list.map((c) => c.id).join('>') });
    render();
  },
  cascadeToggle(id) {
    const list = state.campaign.rules.cascade;
    const c = list.find((x) => x.id === id);
    if (c.on && list.filter((x) => x.on).length === 1) { toast(t('toast.cascadeLast'), 'warn'); return; }
    c.on = !c.on;
    bump();
    trackSetting(`rules.cascade.${id}`, c.on);
    render();
  },
  insertVar(arg) {
    const [id, v] = arg.split(':');
    const s = stepById(id);
    const ta = document.querySelector(`[data-bind="campaign.steps.${stepIndex(id)}.text"]`);
    const token = `{{${v}}}`;
    const a = ta ? ta.selectionStart : s.text.length;
    const b = ta ? ta.selectionEnd : a;
    s.text = s.text.slice(0, a) + token + s.text.slice(b);
    markTextCustom();
    bump();
    renderNow();
    if (ta) { ta.focus(); ta.setSelectionRange(a + token.length, a + token.length); }
  },
  addStopWord() {
    const w = state.ui.newStopWord.trim().toLowerCase();
    if (!w) return;
    const list = state.campaign.channels.sms.stopWords;
    if (!list.includes(w)) list.push(w);
    state.ui.newStopWord = '';
    syncFocused('ui.newStopWord', '');
    bump();
    track('stop_word_added', { word: w });
    render();
  },
  removeStopWord(w) {
    const sms = state.campaign.channels.sms;
    sms.stopWords = sms.stopWords.filter((x) => x !== w);
    bump();
    render();
  },
  fix(arg) { applyFix(arg); },
  playVoice() { toast(t('toast.voicePreview', { v: L(Data.VOICES[state.campaign.channels.call.aiVoice].name) }), 'ok', 'volume'); },

  /* ----------------------------- launch & live ----------------------------- */
  launch() { launchCampaign(); },
  quickLaunch() {
    const c = state.campaign;
    if (!c.leads.length) loadLeads(Data.demoLeads(), 'demo', true);
    if (c.goal.trim().length < 8) c.goal = L(Data.QUICK_GOALS[0].text);
    if (!c.messagesReady || steps().some((s) => !s.text.trim())) { applyDrafts(); c.messagesReady = true; }
    bump();
    launchCampaign();
  },
  togglePlay() {
    const r = liveResult();
    if (!r) return;
    if (state.sim.t >= r.endT) state.sim.t = r.startT;
    state.sim.playing = !state.sim.playing;
    track(state.sim.playing ? 'sim_played' : 'sim_paused', { day: campaignDay(state.sim.t) });
    render();
  },
  skipEnd() {
    const r = liveResult();
    state.sim.t = r.endT;
    state.sim.playing = false;
    track('sim_skipped_to_end');
    persistSoon();
    render();
  },
  restartSim() {
    state.sim.t = liveResult().startT;
    state.sim.playing = true;
    state.inboxLocal = { read: {}, overrides: {}, sent: [], meetings: {} };
    lastReplies = 0;
    track('sim_restarted');
    render();
  },
  liveTab(tab) { state.ui.liveTab = tab; render(); },
  logFilter(f) { state.ui.logFilter = f; render(); },
  focusLead(id) {
    const P = liveProj();
    if (P.leads[id] && P.leads[id].reply) { A.openThread(id); A.nav('inbox'); return; }
    toast(t('toast.noReplyYet', { name: esc(shortName(leadById(id))) }), 'warn', 'clock');
  },

  /* -------------------------------- inbox -------------------------------- */
  setLightFilter(l) { state.ui.inbox.light = l; track('inbox_filtered', { light: l }); render(); },
  openThread(id, el) {
    state.ui.inbox.selected = id;
    state.ui.inbox.draft = '';
    state.ui.inbox.draftChannel = '';
    state.inboxLocal.read[id] = true;
    const P = liveProj();
    track('inbox_thread_opened', { light: leadLight(id, P), channel: P.leads[id]?.reply?.channel });
    persistSoon();
    if (el && el.dataset.go) { A.nav('inbox'); return; }
    render();
  },
  setLeadLight(arg) {
    const [id, light] = arg.split(':');
    state.inboxLocal.overrides[id] = light;
    track('lead_status_overridden', { light });
    persistSoon();
    render();
  },
  aiDraft(id) { typeAiDraft(id); },
  sendReply(id) {
    const ib = state.ui.inbox;
    const text = ib.draft.trim();
    if (!text) return;
    const lead = leadById(id);
    const opts = replyChannels(lead);
    const reply = liveProj().leads[id].reply;
    const ch = opts.includes(ib.draftChannel) ? ib.draftChannel : opts.includes(reply.channel) ? reply.channel : opts[0];
    state.inboxLocal.sent.push({ lead: id, t: state.sim.t, channel: ch, text });
    track('reply_sent', { channel: ch, ai_assisted: !!ib.aiUsed, chars: text.length });
    ib.draft = '';
    ib.aiUsed = false;
    syncFocused('ui.inbox.draft', '');
    persistSoon();
    toast(t('toast.sent', { ch: chName(ch) }), 'ok', 'send');
  },
  bookMeeting(id) {
    state.inboxLocal.meetings[id] = true;
    state.inboxLocal.overrides[id] = 'green';
    track('meeting_booked', { lead: id });
    persistSoon();
    toast(t('toast.booked', { name: esc(shortName(leadById(id))) }), 'ok', 'calendar');
  },
  handoff(id) {
    track('lead_handed_off', { lead: id });
    toast(t('toast.handoff', { m: L(Data.MANAGERS[state.sim.snapshot.channels.call.transferTo].name) }), 'ok', 'headset');
  },
  blockLead(id) {
    state.inboxLocal.overrides[id] = 'red';
    track('lead_blocked', { lead: id });
    persistSoon();
    toast(t('toast.blocked'), 'ok', 'ban');
  },
};

/* ------------------------------------------------------------------ */
/* Action implementations                                              */
/* ------------------------------------------------------------------ */

function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* Modal focus management: move focus in, trap Tab inside, restore on close. */
let dialogOpener = null;
let dialogSel = null;
function openDialog(sel) {
  dialogOpener = document.activeElement;
  dialogSel = sel;
  const box = document.querySelector(sel);
  const first = box && box.querySelector('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
  if (first) first.focus();
}

/** Called after every render: a dialog closed by state (launch, mode switch, removal) releases focus. */
function syncDialog() {
  if (dialogSel && !document.querySelector(dialogSel)) closeDialog();
}
function closeDialog() {
  dialogSel = null;
  if (dialogOpener && document.contains(dialogOpener)) dialogOpener.focus();
  dialogOpener = null;
}
function trapTab(e) {
  const box = dialogSel && document.querySelector(dialogSel);
  if (!box) return;
  const items = [...box.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select, textarea')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/**
 * Morph never overwrites a focused field (that would fight the user's typing),
 * so actions that programmatically change a focused field's value set it here.
 */
function syncFocused(bindPath, value) {
  const el = document.activeElement;
  if (el && el.dataset && el.dataset.bind === bindPath && el.value !== value) el.value = value;
}

/** Bring freshly revealed content into view (after the DOM has been patched). */
function scrollToTestId(id, block = 'center') {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block });
  });
}

function setWizard(n) {
  const prev = state.ui.wizardStep;
  n = clamp(n, 1, 3);
  if (n === prev || (n > prev && !canGoStep(n))) return;
  if (n > prev) track('wizard_step_completed', { step: prev });
  state.ui.wizardStep = n;
  state.ui.addMenu = false;
  track('wizard_step_viewed', { step: n });
  persistSoon();
  render();
  scrollTop();
}

function loadLeads(leads, source, silent = false) {
  state.campaign.leads = leads;
  state.ui.previewLead = 0;
  bump();
  track('audience_loaded', { source, count: leads.length });
  if (!silent) {
    toast(t('toast.leads', { n: leads.length }), 'ok', 'users');
    if (state.ui.mode === 'simple' && state.ui.view === 'builder') { renderNow(); scrollToTestId('audience'); }
  }
}

function markTextCustom() { state.campaign.textsCustom = true; }

/** Write AI drafts into every step according to its template slot. */
function applyDrafts() {
  const c = state.campaign;
  const { intent, drafts } = Data.composeDrafts({ goal: c.goal, tone: c.tone, lang: state.ui.lang });
  for (const s of c.steps) {
    const slot = s.channel === 'linkedin' ? (s.kind === 'message' ? 'li_message' : 'li_invite') : s.tpl;
    const d = drafts[slot] || drafts[Data.TPL_FOR_CHANNEL[s.channel]];
    if (!d) continue;
    s.text = d.text;
    if (s.channel === 'email') s.subject = d.subject || s.subject;
  }
  c.textsCustom = false;
  return intent;
}

async function generateMessages() {
  const c = state.campaign;
  if (state.ui.gen) return;
  if (c.goal.trim().length < 8) { toast(t('toast.goalShort'), 'warn'); return; }
  const t0 = performance.now();
  state.ui.gen = { phase: 0 };
  render();
  const fast = params.has('fast');
  for (let p = 1; p <= 5; p++) {
    await sleep(fast ? 20 : 430);
    if (!state.ui.gen) return;
    state.ui.gen.phase = p;
    render();
  }
  const intent = applyDrafts();
  c.messagesReady = true;
  state.ui.gen = null;
  state.ui.editingDraft = null;
  bump();
  track('messages_generated', { intent, tone: c.tone, steps: c.steps.length, ms: Math.round(performance.now() - t0) });
  toast(t('toast.generated', { n: c.steps.length }), 'ok', 'sparkles');
  if (state.ui.mode === 'simple' && state.ui.view === 'builder') { renderNow(); scrollToTestId('drafts', 'start'); }
}

function addStep(channel) {
  const c = state.campaign;
  const hasInvite = steps().some((s) => s.channel === 'linkedin' && s.kind !== 'message');
  const kind = channel === 'call' ? 'call' : channel === 'linkedin' && !hasInvite ? 'invite' : 'message';
  const tpl = channel === 'linkedin' ? (kind === 'invite' ? 'li_invite' : 'li_message') : Data.TPL_FOR_CHANNEL[channel];
  const s = {
    id: `s${Date.now().toString(36).slice(-6)}`, day: clamp(lastDay() + 2, 1, 21), channel, kind, tpl,
    condition: 'no_reply', ref: null, sendAt: 'auto', subject: '', text: '',
  };
  if (c.goal.trim().length >= 8) {
    const { drafts } = Data.composeDrafts({ goal: c.goal, tone: c.tone, lang: state.ui.lang });
    const d = drafts[tpl];
    s.text = d.text;
    if (channel === 'email') s.subject = d.subject;
  }
  steps().push(s);
  normalizeSteps();
  state.ui.addMenu = false;
  if (state.ui.mode === 'pro') state.ui.expanded = { [s.id]: true };
  bump();
  track('step_added', { channel, day: s.day });
  toast(t('toast.stepAdded', { name: stepTitle(s), d: s.day }), 'ok', 'plus');
  if (state.ui.mode === 'pro') { renderNow(); scrollToTestId(`step-${s.id}`, 'start'); }
}

function applyFix(arg) {
  const C = state.campaign.channels;
  const [code, x] = arg.split(':');
  switch (code) {
    case 'li-limit': C.linkedin.inviteLimit = 20; break;
    case 'proxy-on': C.linkedin.proxy = 'residential'; break;
    case 'email-limit': C.email.dailyLimit = 40; break;
    case 'warmup-on': C.email.warmup.enabled = true; break;
    case 'mailbox-on': C.email.mailboxes.forEach((m) => { m.enabled = true; }); break;
    case 'pixel-on': C.email.trackOpens = true; break;
    case 'amd-on': C.call.amd = true; break;
    case 'tz-on': C.sms.tzByCode = true; break;
    case 'links-on': (x ? [x] : MESSENGERS).forEach((m) => { C[m].noLinksFirst = true; }); break;
    case 'msg-limit': C[x].dailyPerNumber = SAFE_PER_NUMBER[x]; break;
    case 'typing-on': C[x].typing = true; break;
    case 'cond-clicked': {
      const s = stepById(x);
      const ref = bestRef(s, 'clicked');
      if (ref) { s.condition = 'clicked'; s.ref = ref.id; }
      break;
    }
    case 'sms-shorten': { const s = stepById(x); s.text = shortenSms(s.text); markTextCustom(); break; }
    case 'li-trim': { const s = stepById(x); s.text = `${s.text.slice(0, 296).replace(/\s+\S*$/, '')}…`; markTextCustom(); break; }
    case 'ai-fill': applyDrafts(); state.campaign.messagesReady = true; break;
    default: return;
  }
  bump();
  track('preflight_fix_applied', { fix: code });
  toast(t('toast.fixed'), 'ok', 'wand');
}

/* ------------------------------ mode & language ------------------------------ */

/** Mode switch with a circular View-Transition reveal from the toggle. */
function switchMode(next, ev) {
  if (state.ui.mode === next) return;
  const prev = state.ui.mode;
  state.session.modeSwitches++;
  track('mode_switched', { from: prev, to: next, view: state.ui.view });
  const apply = () => {
    state.ui.mode = next;
    state.ui.addMenu = false;
    state.ui.editStep = null;
    renderNow();
  };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { apply(); return; }
  const btn = document.querySelector('.mode-switch');
  const r = btn ? btn.getBoundingClientRect() : { left: innerWidth - 220, top: 10, width: 120, height: 40 };
  const x = ev && ev.clientX ? ev.clientX : r.left + r.width / 2;
  const y = ev && ev.clientY ? ev.clientY : r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 720, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => { /* transition skipped */ });
}

const DEFAULT_NAME = ['Демо-встречи · Q4', 'Demo meetings · Q4'];

/**
 * Translate generated (not user-edited) content to the new UI language.
 * The launched snapshot is deliberately left alone: it is what was "sent".
 */
function relocalize(prev, next) {
  const c = state.campaign;
  const idx = (lang) => (lang === 'en' ? 1 : 0);
  const known = [...Data.QUICK_GOALS.map((g) => g.text), Data.VOICE_SAMPLE].find((p) => p[idx(prev)] === c.goal);
  if (known) c.goal = known[idx(next)];
  if (c.name === DEFAULT_NAME[idx(prev)]) c.name = DEFAULT_NAME[idx(next)];
  if (c.messagesReady && !c.textsCustom) applyDrafts();
  bump();
}

function switchLang(next) {
  const prev = state.ui.lang;
  state.ui.lang = next;
  relocalize(prev, next);
  track('language_switched', { from: prev, to: next });
  render();
}

/* ------------------------------ voice input ------------------------------ */

let recognition = null;
let voiceTimer = 0;

/** Real dictation through the Web Speech API, with a scripted fallback (no mic / file:// / headless). */
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  state.ui.voice = { since: Date.now() };
  track('voice_started', { api: !!SR && params.get('voice') !== 'sim' });
  if (SR && params.get('voice') !== 'sim') {
    try {
      let got = false;
      recognition = new SR();
      recognition.lang = state.ui.lang === 'en' ? 'en-US' : 'ru-RU';
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (e) => {
        got = true;
        let text = '';
        for (const res of e.results) text += res[0].transcript;
        state.campaign.goal = text.trim();
        bump();
        render();
      };
      recognition.onerror = () => {
        recognition = null;
        if (got) { stopVoice(); return; }
        toast(t('toast.micSim'), 'warn', 'mic');
        simulateDictation();
      };
      recognition.onend = () => { if (recognition && state.ui.voice) stopVoice(); };
      recognition.start();
      render();
      return;
    } catch (_) {
      recognition = null;
    }
  }
  simulateDictation();
  render();
}

function simulateDictation() {
  const words = L(Data.VOICE_SAMPLE).split(' ');
  let i = 0;
  state.campaign.goal = '';
  clearInterval(voiceTimer);
  voiceTimer = setInterval(() => {
    if (!state.ui.voice) { clearInterval(voiceTimer); return; }
    state.campaign.goal += (i ? ' ' : '') + words[i++];
    bump();
    render();
    if (i >= words.length) { clearInterval(voiceTimer); setTimeout(stopVoice, 700); }
  }, params.has('fast') ? 10 : 155);
}

function stopVoice() {
  clearInterval(voiceTimer);
  if (recognition) { const r = recognition; recognition = null; try { r.stop(); } catch (_) { /* already stopped */ } }
  if (!state.ui.voice) return;
  const seconds = Math.round((Date.now() - state.ui.voice.since) / 1000);
  state.ui.voice = null;
  track('goal_input', { method: 'voice', seconds, words: state.campaign.goal.split(/\s+/).filter(Boolean).length });
  render();
}

/* ------------------------------ inbox AI draft ------------------------------ */

let draftTimer = 0;
function typeAiDraft(id) {
  const P = liveProj();
  const reply = P.leads[id] && P.leads[id].reply;
  if (!reply) return;
  const full = personalize(L((Data.INSIGHT[reply.intent] || Data.INSIGHT.question).reply), leadById(id));
  const ib = state.ui.inbox;
  ib.draft = '';
  ib.aiUsed = true;
  clearInterval(draftTimer);
  let i = 0;
  track('ai_reply_drafted', { intent: reply.intent });
  draftTimer = setInterval(() => {
    i = Math.min(full.length, i + 3);
    ib.draft = full.slice(0, i);
    syncFocused('ui.inbox.draft', ib.draft);
    render();
    if (i >= full.length) clearInterval(draftTimer);
  }, params.has('fast') ? 1 : 16);
}

/* ------------------------------ launch ------------------------------ */

function launchCampaign() {
  const errors = preflight().filter((x) => x.level === 'error');
  if (errors.length) { toast(errors[0].text, 'error', 'alert'); return; }
  const c = state.campaign;
  // The snapshot (campaign + seed) is never mutated after launch — see liveResult().
  state.sim = {
    ...state.sim, launched: true, snapshot: { ...clone(c), seed: state.sim.seed }, launchId: state.sim.launchId + 1,
    t: Engine.LAUNCH_T, playing: false,
  };
  state.inboxLocal = { read: {}, overrides: {}, sent: [], meetings: {} };
  state.ui.inbox.selected = null;
  lastReplies = 0;
  state.session.launchedAt = Date.now();
  const res = liveResult();
  const first = state.session.firstInteractionAt;
  track('campaign_launched', {
    leads: c.leads.length, steps: c.steps.length, channels: new Set(c.steps.map((s) => s.channel)).size,
    risk: riskScore().score, expected_replies: res.stats.humanReplies,
    time_to_launch_s: first ? Math.round((Date.now() - first) / 1000) : null,
  });
  state.ui.launching = true;
  state.ui.editStep = null;
  render();
  setTimeout(() => {
    state.ui.launching = false;
    state.ui.view = 'live';
    state.sim.playing = true;
    lastFrame = 0;
    render();
    scrollTop();
  }, params.has('fast') ? 30 : 2100);
}

/* ------------------------------ playback loop ------------------------------ */

let lastFrame = 0;
let lastPaint = 0;
let lastReplies = 0;

/** Advance the virtual clock; repaint at ~12 fps (the DOM morph is cheap, but not free). */
function tick(now) {
  requestAnimationFrame(tick);
  const s = state.sim;
  if (!s.playing || !s.launched || state.ui.launching) { lastFrame = now; return; }
  const r = liveResult();
  if (!r) return;
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  s.t = Math.min(r.endT, s.t + dt * s.speed);
  const finished = s.t >= r.endT;
  if (finished) {
    s.playing = false;
    track('sim_completed', { replies: liveProj().metrics.replied });
    persistSoon();
  }
  // Repaint budget per screen: Live ~12 fps, Inbox ~2 fps (lead clocks, call/meeting lines),
  // Builder only when a reply changes the header badge.
  const replies = liveProj().metrics.replied;
  const interval = state.ui.view === 'live' ? 80 : state.ui.view === 'inbox' ? 450 : Infinity;
  if (finished || replies !== lastReplies || now - lastPaint > interval) {
    lastPaint = now;
    announceReplies();
    render();
  }
}

function announceReplies() {
  const P = liveProj();
  const n = P.metrics.replied;
  if (n > lastReplies && state.ui.view !== 'inbox') {
    const latest = inboxThreads(P)[0];
    if (latest) toast(t('toast.reply', { name: esc(shortName(latest.lead)), ch: chName(latest.reply.channel) }), 'reply', 'reply');
  }
  lastReplies = n;
}

/* ------------------------------ bindings ------------------------------ */

let goalTimer = 0;

/** Side effects of a two-way binding: invalidation, persistence, analytics. */
function onBound(path, v) {
  if (path.startsWith('campaign.')) {
    if (/^campaign\.steps\.\d+\.(text|subject)$/.test(path)) markTextCustom();
    if (path === 'campaign.rules.workStart' || path === 'campaign.rules.workEnd') {
      const r = state.campaign.rules;
      if (r.workEnd - r.workStart < 3) r.workEnd = Math.min(22, r.workStart + 3);
    }
    if (path === 'campaign.goal') {
      clearTimeout(goalTimer);
      if (!state.ui.voice) goalTimer = setTimeout(() => track('goal_input', { method: 'text', chars: state.campaign.goal.length }), 1500);
    } else if (!/\.(text|subject|name)$/.test(path)) {
      trackSetting(path, v);
    }
    bump();
    return;
  }
  if (path === 'sim.t') { state.sim.playing = false; persistSoon(); return; }
  if (path === 'sim.seed') { if (!(v >= 1)) state.sim.seed = 1; bump(); trackSetting('sim.seed', state.sim.seed); return; }
  if (path === 'sim.speed') { track('sim_speed_changed', { speed: v }); persistSoon(); return; }
  persistSoon();
}

function readBound(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.dataset.kind === 'autonum') return el.value === 'auto' ? 'auto' : Number(el.value);
  if (el.hasAttribute('data-num') || el.type === 'range' || el.type === 'number') return Number(el.value);
  return el.value;
}

function readFile(file) {
  if (!/\.(csv|txt)$/i.test(file.name)) { toast(t('toast.csvOnly'), 'warn'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const leads = Data.parseCSV(String(reader.result || ''));
    if (!leads.length) { toast(t('toast.parseFail'), 'warn'); return; }
    state.ui.source = 'file';
    loadLeads(leads, 'file');
  };
  reader.readAsText(file);
}

function wireEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = A[el.dataset.action];
    if (!fn) { console.warn('[relay] unknown action:', el.dataset.action); return; }
    fn(el.dataset.arg, el, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('[data-bind]')) return;
    const v = readBound(el);
    if (typeof v === 'number' && Number.isNaN(v)) return;
    setPath(state, el.dataset.bind, v);
    onBound(el.dataset.bind, v);
    render();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'file-input' && e.target.files && e.target.files[0]) {
      readFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      if (state.ui.editStep) A.closeStep();
      else if (state.ui.drawer) A.toggleDrawer();
      else if (state.ui.addMenu) A.toggleAddMenu();
      return;
    }
    if (e.key === 'Tab' && dialogSel) { trapTab(e); return; }
    if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('[data-action][role="button"], tr[data-action][tabindex]')) {
      e.preventDefault();
      // SVG <g role="button"> has no .click(); a synthetic event works for every element.
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }
    if (e.key === 'Enter' && el.dataset && el.dataset.enter) {
      e.preventDefault();
      A[el.dataset.enter]();
    }
  });

  // Drag & drop a CSV onto the "upload" card.
  document.addEventListener('dragover', (e) => {
    if (e.target.closest && e.target.closest('.source-file')) { e.preventDefault(); e.target.closest('.source-file').classList.add('is-drag'); }
  });
  document.addEventListener('dragleave', (e) => {
    const card = e.target.closest && e.target.closest('.source-file');
    if (card) card.classList.remove('is-drag');
  });
  document.addEventListener('drop', (e) => {
    const card = e.target.closest && e.target.closest('.source-file');
    if (!card) return;
    e.preventDefault();
    card.classList.remove('is-drag');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  });
}
