/**
 * Relay App — Simple mode: a 3-step wizard with big, jargon-free UI.
 * Every protection is on by default and explained in plain words; the PRO
 * knobs exist but are never in the way.
 */

const canGoStep = (n) => n === 1 || (n === 2 && state.campaign.leads.length > 0)
  || (n === 3 && state.campaign.leads.length > 0 && state.campaign.messagesReady);
const isStepDone = (n) => (n === 1 ? state.campaign.leads.length > 0 : n === 2 ? state.campaign.messagesReady : false);

function SimpleBuilder() {
  const { ui, campaign } = state;
  const items = [
    { n: 1, ic: 'users', title: t('wiz.s1.title'), sub: campaign.leads.length ? t('wiz.s1.done', { n: campaign.leads.length }) : t('wiz.s1.sub') },
    { n: 2, ic: 'target', title: t('wiz.s2.title'), sub: campaign.messagesReady ? t('wiz.s2.done') : t('wiz.s2.sub') },
    { n: 3, ic: 'route', title: t('wiz.s3.title'), sub: t('wiz.s3.sub', { n: campaign.steps.length, d: lastDay() }) },
  ];
  return `<main class="simple">
    <section class="${cls('s-hero', ui.wizardStep > 1 && 'is-compact')}">
      <span class="eyebrow">${icon('sparkles')} ${t('s.hero.eyebrow')}</span>
      <h1>${t('s.hero.title')}</h1>
      <p>${t('s.hero.sub')}</p>
    </section>
    <ol class="wiz-steps" style="--p:${(ui.wizardStep - 1) / 2}">
      ${items.map((s) => `<li class="${cls('wiz-step', ui.wizardStep === s.n && 'is-active', isStepDone(s.n) && 'is-done')}">
        <button data-action="wizGo" data-arg="${s.n}" data-testid="wiz-${s.n}" ${canGoStep(s.n) ? '' : 'disabled'}>
          <span class="wiz-num">${isStepDone(s.n) && ui.wizardStep !== s.n ? icon('check') : s.n}</span>
          <span class="wiz-text"><b>${s.title}</b><small>${s.sub}</small></span>
        </button></li>`).join('')}
    </ol>
    <section class="wiz-card" data-key="wiz-${ui.wizardStep}">
      ${ui.wizardStep === 1 ? WizAudience() : ui.wizardStep === 2 ? WizGoal() : WizTrack()}
    </section>
    ${WizNav()}
  </main>`;
}

function WizNav() {
  const n = state.ui.wizardStep;
  if (n === 3) {
    return `<footer class="wiz-nav"><button class="btn btn-ghost btn-lg" data-action="wizBack">${icon('arrow-left')} ${t('common.back')}</button><span></span></footer>`;
  }
  const ok = canGoStep(n + 1);
  const hint = n === 1 ? t('wiz.hint1') : t('wiz.hint2');
  return `<footer class="wiz-nav">
    ${n > 1 ? `<button class="btn btn-ghost btn-lg" data-action="wizBack">${icon('arrow-left')} ${t('common.back')}</button>` : '<span></span>'}
    <div class="wiz-next">${ok ? '' : `<small class="muted">${hint}</small>`}
      <button class="btn btn-primary btn-lg" data-action="wizNext" data-testid="wiz-next" ${ok ? '' : 'disabled'}>${t('common.next')} ${icon('arrow-right')}</button></div>
  </footer>`;
}

/* ----------------------------- Step 1 ----------------------------- */

function WizAudience() {
  const { ui, campaign } = state;
  const cards = [
    { id: 'file', ic: 'upload', title: t('aud.file'), sub: t('aud.file.sub') },
    { id: 'paste', ic: 'clipboard', title: t('aud.paste'), sub: t('aud.paste.sub') },
    { id: 'demo', ic: 'users', title: t('aud.demo'), sub: t('aud.demo.sub') },
  ];
  return `<header class="card-head"><span class="step-kicker">${t('wiz.kicker', { n: 1 })}</span><h2>${t('aud.title')}</h2><p>${t('aud.sub')}</p></header>
    <div class="source-grid">
      ${cards.map((c) => `<button class="${cls('source', `source-${c.id}`, ui.source === c.id && 'is-selected')}" data-action="pickSource" data-arg="${c.id}" data-testid="source-${c.id}">
        <span class="source-ic">${icon(c.ic)}</span><b>${c.title}</b><small>${c.sub}</small>
        ${ui.source === c.id ? `<span class="source-check">${icon('check')}</span>` : ''}
      </button>`).join('')}
    </div>
    <input type="file" id="file-input" accept=".csv,.txt" hidden>
    ${ui.source === 'paste' ? `<div class="paste-box" data-key="paste">
      <textarea class="inp" data-bind="ui.pasteText" rows="4" placeholder="${t('aud.paste.ph')}">${esc(ui.pasteText)}</textarea>
      <button class="btn btn-soft" data-action="parsePaste">${icon('check')} ${t('aud.paste.go')}</button>
    </div>` : ''}
    ${campaign.leads.length ? AudienceSummary() : ''}`;
}

function AudienceSummary() {
  const leads = state.campaign.leads;
  const cov = Data.coverage(leads);
  const cities = new Set(leads.map((l) => l.city));
  const zones = new Set(leads.map((l) => l.tz));
  const rows = ['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'phone'];
  return `<div class="aud-summary" data-key="aud" data-testid="audience">
    <div class="aud-top">
      <div class="avatar-stack">${leads.slice(0, 6).map((l) => Avatar(l)).join('')}${leads.length > 6 ? `<span class="avatar more">+${leads.length - 6}</span>` : ''}</div>
      <div class="aud-count"><b>${t('aud.people', { n: leads.length })}</b><span>${t('aud.geo', { c: cities.size, z: zones.size })}</span></div>
      <button class="btn btn-ghost" data-action="clearAudience">${t('aud.change')}</button>
    </div>
    <div class="coverage">
      ${rows.map((r) => `<div class="cov-row" style="--c:${chColor(r)}">
        ${ChBadge(r)}<span class="cov-name">${t(`cov.${r}`)}</span>
        <span class="cov-bar"><i style="width:${(cov[r] / leads.length) * 100}%"></i></span><b class="mono">${cov[r]}</b></div>`).join('')}
    </div>
    <p class="aud-note">${icon('shield')} ${t('aud.note')}</p>
  </div>`;
}

/* ----------------------------- Step 2 ----------------------------- */

function WizGoal() {
  const { ui, campaign } = state;
  const v = ui.voice;
  return `<header class="card-head"><span class="step-kicker">${t('wiz.kicker', { n: 2 })}</span><h2>${t('goal.title')}</h2><p>${t('goal.sub')}</p></header>
    <div class="${cls('goal-box', v && 'is-listening')}">
      <textarea id="goal-input" class="goal-input" data-bind="campaign.goal" rows="3" placeholder="${t('goal.ph')}" data-testid="goal">${esc(campaign.goal)}</textarea>
      <div class="goal-bar">
        <button class="${cls('mic', v && 'is-on')}" data-action="toggleVoice" aria-pressed="${!!v}" data-testid="mic">
          <span class="mic-ic">${icon(v ? 'square' : 'mic')}</span><span>${v ? t('goal.voice.stop') : t('goal.voice')}</span>
        </button>
        ${v ? `<div class="wave" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><span class="listening">${t('goal.listening')}</span>`
    : `<span class="muted">${t('goal.or')}</span>`}
      </div>
    </div>
    <div class="chips" aria-label="${t('goal.examples')}"><span class="muted">${t('goal.examples')}:</span>${Data.QUICK_GOALS.map((g, i) => `<button class="chip" data-action="quickGoal" data-arg="${i}" data-testid="quick-${i}">${esc(L(g.label))}</button>`).join('')}</div>
    <div class="tone-row">
      <span class="tone-label">${t('goal.tone')}</span>
      ${Seg('campaign.tone', campaign.tone, ['friendly', 'business', 'short'].map((x) => ({ v: x, label: t(`tone.${x}`) })))}
      <span class="grow"></span>
      <button class="btn btn-ai btn-lg" data-action="generate" data-testid="generate" ${campaign.goal.trim().length < 8 || ui.gen || v ? 'disabled' : ''}>${icon('sparkles')} ${campaign.messagesReady ? t('goal.regen') : t('goal.gen')}</button>
    </div>
    ${ui.gen ? GenProgress() : campaign.messagesReady ? DraftsGrid() : ''}`;
}

function GenProgress() {
  const g = state.ui.gen;
  const phases = ['gen.p1', 'gen.p2', 'gen.p3', 'gen.p4', 'gen.p5'];
  return `<div class="gen" data-key="gen" data-testid="gen">
    <div class="gen-orb" aria-hidden="true">${icon('sparkles')}</div>
    <ul class="gen-phases">${phases.map((p, i) => `<li class="${cls(i < g.phase && 'done', i === g.phase && 'now')}">${i < g.phase ? icon('check') : '<span class="dot"></span>'}<span>${t(p)}</span></li>`).join('')}</ul>
    <div class="gen-skeletons" aria-hidden="true"><i></i><i></i><i></i></div>
  </div>`;
}

const LINK_RE_G = new RegExp(Engine.LINK_SRC, 'gi');

/** Message text with {{variables}} filled in and highlighted. Input is escaped first. */
function richPreview(text, lead, { stripLinks = false } = {}) {
  let src = String(text || '');
  if (stripLinks) src = Engine.stripLinks(src);
  const city = Data.CITIES[lead.city] ? L(Data.CITIES[lead.city].name) : '';
  const vars = { firstName: lead.firstName, company: lead.company, city, role: lead.role };
  return esc(src)
    .replace(/\{\{\s*(firstName|company|city|role)\s*\}\}/g, (_, k) => `<mark class="var">${esc(vars[k])}</mark>`)
    // Same pattern the engine uses; [^\s<] keeps a link from swallowing an adjacent <mark>.
    .replace(LINK_RE_G, '<u class="link">$&</u>')
    .replace(/\n/g, '<br>');
}

function DraftsGrid() {
  const lead = sampleLead();
  return `<div class="drafts" data-key="drafts" data-testid="drafts">
    <div class="drafts-head"><b>${icon('check-circle')} ${t('drafts.ready', { n: state.campaign.steps.length })}</b><span class="muted">${t('drafts.preview', { name: esc(lead.firstName) })}</span></div>
    <div class="drafts-grid">${sortedForView().map((s, i) => DraftCard(s, lead, i)).join('')}</div>
    <p class="drafts-note">${icon('shield')} ${t('drafts.note')}</p>
  </div>`;
}

const sortedForView = () => [...steps()].sort((a, b) => a.day - b.day);

function DraftCard(s, lead, i) {
  const editing = state.ui.editingDraft === s.id;
  const idx = stepIndex(s.id);
  return `<article class="${cls('draft', editing && 'is-editing')}" style="--c:${chColor(s.channel)};--d:${i}" data-key="d-${s.id}">
    <header>${ChBadge(s.channel)}<div><b>${stepTitle(s)}</b><small>${t('day.n', { n: s.day })}</small></div>
      <button class="btn-link" data-action="editDraft" data-arg="${s.id}">${editing ? `${icon('check')} ${t('common.done')}` : `${icon('edit')} ${t('common.edit')}`}</button></header>
    ${s.channel === 'email' ? `<div class="draft-subj">${editing ? `<input class="inp" data-bind="campaign.steps.${idx}.subject" value="${esc(s.subject)}">` : richPreview(s.subject, lead)}</div>` : ''}
    ${editing ? `<textarea class="inp" data-bind="campaign.steps.${idx}.text" rows="7">${esc(s.text)}</textarea>`
    : `<div class="draft-body">${richPreview(s.text, lead)}</div>`}
  </article>`;
}

/* ----------------------------- Step 3 ----------------------------- */

function WizTrack() {
  return `<header class="card-head"><span class="step-kicker">${t('wiz.kicker', { n: 3 })}</span><h2>${t('track.title')}</h2><p>${t('track.sub')}</p></header>
    ${Track({ live: false })}
    ${AddStepMenu()}
    ${Autopilot()}
    ${LaunchBar()}`;
}

/** The visual "track": a day ruler with step bubbles placed on their day. Shared by builder and live views. */
/** In live mode `list`/`rules` come from the launched snapshot, never from the editable campaign. */
function Track({ live, proj, list = sortedForView(), rules = state.campaign.rules }) {
  const days = Math.max(8, Math.max(1, ...list.map((s) => s.day)) + 1);
  const rowOf = {};
  const perDay = {};
  for (const s of list) { rowOf[s.id] = (perDay[s.day] = (perDay[s.day] || 0) + 1); }
  const progress = live ? clamp((state.sim.t - Engine.LAUNCH_T) / (days * Engine.DAY), 0, 1) : 0;
  return `<div class="${cls('track', live && 'is-live')}" style="--days:${days}" data-testid="track">
    <div class="track-ruler">${Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    const we = isWeekendDay(d);
    return `<div class="${cls('ruler-day', we && 'is-weekend', live && campaignDay(state.sim.t) === d && 'is-today')}"><b>${t(`dow.${dow(d)}`)}</b><small>${t('day.n', { n: d })}</small>${we ? `<em>${icon('moon')} ${t('track.weekend')}</em>` : ''}</div>`;
  }).join('')}</div>
    <div class="track-lane">
      <div class="track-line" aria-hidden="true"><i style="width:${progress * 100}%"></i></div>
      ${list.map((s) => TrackNode(s, rowOf[s.id], live, proj, list, rules)).join('')}
      ${live ? '' : `<div class="tnode tnode-ghost" data-key="n-ghost" style="grid-column:${Math.min(days, Math.max(...list.map((s) => s.day)) + 1)};grid-row:1">
        <button class="tnode-bubble" data-action="toggleAddMenu" data-testid="add-step" aria-expanded="${state.ui.addMenu}" aria-label="${t('track.add')}">${icon('plus')}</button>
        <div class="tnode-title">${t('track.add')}</div></div>`}
    </div>
  </div>`;
}

function TrackNode(s, row, live, proj, list, rules) {
  const sent = live && proj ? (proj.stepStats[s.id] || { sent: 0 }).sent : 0;
  const shifted = isWeekendDay(s.day) && rules.skipWeekends;
  return `<div class="${cls('tnode', live && sent > 0 && 'is-hit')}" data-key="n-${s.id}" style="grid-column:${s.day};grid-row:${row};--c:${chColor(s.channel)}">
    <button class="tnode-bubble" ${live ? 'tabindex="-1"' : `data-action="openStep" data-arg="${s.id}"`} aria-label="${esc(stepTitle(s))}" data-testid="node-${s.id}">
      ${chIcon(s.channel)}${s.channel === 'messenger' ? `<span class="tnode-cascade" aria-hidden="true">${rules.cascade.filter((c) => c.on).map((c) => `<i style="--c:${chColor(c.id)}"></i>`).join('')}</span>` : ''}
      ${live && sent ? `<span class="tnode-count mono">${sent}</span>` : ''}
    </button>
    <div class="tnode-title">${stepTitle(s)}</div>
    <div class="tnode-cond">${condPlain(s, list)}</div>
    ${shifted ? `<div class="tnode-shift">${icon('moon')} ${t('track.shift')}</div>` : ''}
  </div>`;
}

function AddStepMenu() {
  if (!state.ui.addMenu) return '';
  const opts = ['email', 'messenger', 'linkedin', 'call', 'sms'];
  return `<div class="add-menu" data-key="add-menu" role="menu" data-testid="add-menu">
    <b>${t('add.title')}</b>
    <div class="add-grid">${opts.map((ch) => `<button role="menuitem" class="add-opt" style="--c:${chColor(ch)}" data-action="addStep" data-arg="${ch}" data-testid="add-${ch}">${ChBadge(ch, 'lg')}<b>${t(`add.${ch}`)}</b><small>${t(`add.${ch}.sub`)}</small></button>`).join('')}</div>
  </div>`;
}

/** Where the audience is right now at launch time — feeds the "working hours" card. */
function tzSamples() {
  const byTz = new Map();
  for (const l of state.campaign.leads) if (!byTz.has(l.tz)) byTz.set(l.tz, l);
  const list = [...byTz.values()].sort((a, b) => b.tz - a.tz);
  if (!list.length) return [];
  const pick = [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]].filter((x, i, arr) => arr.indexOf(x) === i);
  return pick.map((l) => ({ city: cityName(l.city), time: fmtHM(Engine.LAUNCH_T, l.tz), ok: Engine.inWindow(Engine.LAUNCH_T, l.tz, state.campaign.rules) }));
}

function Autopilot() {
  const r = state.campaign.rules;
  const casc = r.cascade.filter((c) => c.on);
  return `<section class="autopilot" data-testid="autopilot">
    <div class="ap-head"><span class="ap-shield">${icon('shield')}</span><div><h3>${t('ap.title')}</h3><p>${t('ap.sub')}</p></div></div>
    <div class="ap-grid">
      <article class="ap-card">
        <div class="ap-illu illu-stop" aria-hidden="true">
          <span class="ich" style="--c:${chColor('email')}">${chIcon('email')}</span>
          <span class="ich hot" style="--c:${chColor('telegram')}">${chIcon('telegram')}<em class="bubble">${t('ap.stop.bubble')}</em></span>
          <span class="ich" style="--c:${chColor('call')}">${chIcon('call')}</span>
          <span class="ich" style="--c:${chColor('sms')}">${chIcon('sms')}</span>
        </div>
        <b>${t('ap.stop.t')}</b><p>${t('ap.stop.d')}</p>
        <footer><span class="lock-tag">${icon('lock')} ${t('common.always')}</span><button class="btn-link" data-action="goPro" data-arg="rules">${t('ap.tune')} ${icon('arrow-right')}</button></footer>
      </article>
      <article class="ap-card">
        <div class="ap-illu illu-hours" aria-hidden="true">
          <div class="day-bar" style="--ws:${(r.workStart / 24) * 100}%;--we:${(r.workEnd / 24) * 100}%"><i class="win"></i><i class="sun"></i></div>
          <ul class="tz-list">${tzSamples().map((x) => `<li class="${x.ok ? 'ok' : 'wait'}"><span>${esc(x.city)}</span><b class="mono">${x.time}</b><em>${x.ok ? t('ap.hours.ok') : t('ap.hours.wait', { h: pad2(r.workStart) })}</em></li>`).join('')}</ul>
        </div>
        <b>${t('ap.hours.t')}</b><p>${t('ap.hours.d', { a: r.workStart, b: r.workEnd })}</p>
        <footer><span class="lock-tag">${icon('lock')} ${t('common.always')}</span><button class="btn-link" data-action="goPro" data-arg="rules">${t('ap.tune')} ${icon('arrow-right')}</button></footer>
      </article>
      <article class="ap-card">
        <div class="ap-illu illu-cascade" aria-hidden="true">
          ${casc.map((c, i) => `${i ? `<span class="arrow">${icon('chevron-right')}</span>` : ''}<span class="casc-chip" style="--c:${chColor(c.id)};--i:${i}">${chIcon(c.id)}<small>${chName(c.id)}</small></span>`).join('')}
        </div>
        <b>${t('ap.casc.t')}</b><p>${t('ap.casc.d', { list: casc.map((c) => chName(c.id)).join(' → ') })}</p>
        <footer><span class="lock-tag">${icon('lock')} ${t('common.always')}</span><button class="btn-link" data-action="goPro" data-arg="rules">${t('ap.tune')} ${icon('arrow-right')}</button></footer>
      </article>
    </div>
  </section>`;
}

function LaunchBar() {
  const f = forecast();
  const errors = preflight().filter((x) => x.level === 'error');
  return `<div class="launch-bar" data-testid="launch-bar">
    <div class="lb-stats">
      <div><small>${t('lb.start')}</small><b>${t('lb.start.v')}</b></div>
      <div><small>${t('lb.dur')}</small><b>${t('lb.days', { n: f.days })}</b></div>
      <div><small>${t('lb.people')}</small><b>${state.campaign.leads.length}</b></div>
      <div><small>${t('lb.replies')}</small><b>≈ ${f.stats.humanReplies}</b></div>
    </div>
    <div class="lb-go">
      ${errors.length ? `<small class="lb-err">${icon('alert')} ${errors[0].text}</small>` : `<small class="muted">${t('lb.safe')}</small>`}
      <button class="btn btn-launch" data-action="launch" data-testid="launch" ${errors.length ? 'disabled' : ''}>${icon('rocket')} ${t('lb.go')}</button>
    </div>
  </div>`;
}

/** Plain-language editor for a single step (Simple mode side sheet). */
function StepSheet() {
  const s = stepById(state.ui.editStep);
  if (!s) return '';
  const idx = stepIndex(s.id);
  const opts = condOptions(s);
  const hint = isMessengerStep(s) ? t('sheet.hint.msgr') : s.channel === 'sms' ? t('sheet.hint.sms', { n: smsInfoFor(s).length, max: smsInfoFor(s).perSegment }) : s.channel === 'call' ? t('sheet.hint.call') : '';
  return `<div class="sheet-backdrop" data-action="closeStep"></div>
  <aside class="sheet" role="dialog" aria-modal="true" aria-label="${esc(stepTitle(s))}" data-testid="sheet">
    <header class="sheet-head">${ChBadge(s.channel, 'lg')}<div><b>${stepTitle(s)}</b><small>${t('day.n', { n: s.day })} · ${condPlain(s)}</small></div>
      <button class="icon-btn" data-action="closeStep" aria-label="${t('common.close')}">${icon('x')}</button></header>
    <div class="sheet-body">
      <label class="fl">${t('sheet.when')}</label>
      <div class="stepper"><button data-action="stepDay" data-arg="${s.id}:-1" aria-label="−1">${icon('minus')}</button><b>${t('day.n', { n: s.day })} · ${t(`dow.${dow(s.day)}`)}</b><button data-action="stepDay" data-arg="${s.id}:1" aria-label="+1">${icon('plus')}</button></div>
      <label class="fl">${t('sheet.cond')}</label>
      <div class="pills">${opts.map((o) => `<button class="${cls('pill', s.condition === o.id && 'is-on')}" data-action="setCond" data-arg="${s.id}:${o.id}" ${o.disabled || (o.reason && s.condition !== o.id) ? 'disabled' : ''} title="${esc(o.reason)}">${t(`cond.simple.${o.id}`)}</button>`).join('')}</div>
      ${s.channel === 'email' ? `<label class="fl">${t('sheet.subject')}</label><input class="inp" data-bind="campaign.steps.${idx}.subject" value="${esc(s.subject)}">` : ''}
      <label class="fl">${s.channel === 'call' ? t('sheet.script') : t('sheet.text')}</label>
      <textarea class="inp" data-bind="campaign.steps.${idx}.text" rows="8">${esc(s.text)}</textarea>
      ${hint ? `<p class="sheet-hint">${icon('shield')} ${hint}</p>` : ''}
    </div>
    <footer class="sheet-foot">
      <button class="btn btn-ghost danger" data-action="removeStep" data-arg="${s.id}">${icon('trash')} ${t('sheet.remove')}</button>
      <button class="btn btn-primary" data-action="closeStep">${t('common.done')}</button>
    </footer>
  </aside>`;
}
