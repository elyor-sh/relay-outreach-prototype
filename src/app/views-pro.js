/**
 * Relay App — PRO mode builder: dense, dark, everything configurable.
 * Left: campaign rules + expandable steps (message / logic / channel settings).
 * Right (sticky): logic map, ban-risk preflight with one-click fixes, forecast.
 */

const TAB_IC = { message: 'edit', logic: 'git', channel: 'sliders' };
const ADD_CHANNELS = ['email', 'linkedin', 'messenger', 'whatsapp', 'telegram', 'signal', 'sms', 'call'];

function stepTitlePro(s) {
  return `${chName(s.channel)} · ${t(`tplShort.${s.channel === 'linkedin' ? (s.kind === 'message' ? 'li_message' : 'li_invite') : s.tpl}`)}`;
}

function stepMeta(s) {
  const C = state.campaign.channels;
  const time = s.sendAt === 'auto' ? t('pro.time.auto') : `${pad2(s.sendAt)}:00 ${t('pro.local')}`;
  let extra = '';
  if (s.channel === 'email') extra = t('pro.meta.email', { n: C.email.mailboxes.filter((m) => m.enabled).length, l: C.email.dailyLimit });
  else if (s.channel === 'messenger') extra = state.campaign.rules.cascade.filter((c) => c.on).map((c) => chName(c.id)).join(' → ');
  else if (s.channel === 'linkedin') extra = s.kind === 'message' ? t('pro.meta.liMsg') : `${C.linkedin.likeWarmup ? `${t('pro.meta.like')} + ` : ''}${t('pro.meta.invite', { n: C.linkedin.inviteLimit })}`;
  else if (MESSENGERS.includes(s.channel)) extra = t('pro.meta.pinned', { n: C[s.channel].dailyPerNumber });
  else if (s.channel === 'sms') { const i = smsInfoFor(s); extra = `${i.length}/${i.perSegment} · ${i.encoding}`; }
  else if (s.channel === 'call') extra = t(`call.mode.${C.call.mode}`);
  return `${t('day.n', { n: s.day })} · ${time} · ${extra}`;
}

function condShort(s) {
  if (stepIndex(s.id) === 0) return t('cond.short.start');
  if (s.condition === 'no_reply' || !s.ref) return t('cond.short.no_reply');
  return t(`cond.short.${s.condition}`, { r: stepNo(stepById(s.ref)) });
}

function ProBuilder() {
  const c = state.campaign;
  const f = forecast();
  const checks = preflight();
  const chCount = new Set(c.steps.map((s) => s.channel)).size;
  const hasErrors = checks.some((x) => x.level === 'error');
  return `<main class="pro" data-testid="pro-builder">
    <section class="pro-main">
      <div class="pro-head">
        <div class="pro-title">
          <input class="camp-name" data-bind="campaign.name" value="${esc(c.name)}" aria-label="${t('pro.name')}">
          <div class="meta-chips">
            <span>${icon('users')} ${t('pro.m.leads', { n: c.leads.length })}</span>
            <span>${icon('git')} ${t('pro.m.steps', { n: c.steps.length })}</span>
            <span>${icon('layers')} ${t('pro.m.channels', { n: chCount })}</span>
            <span>${icon('calendar')} ${t('pro.m.days', { n: f.days })}</span>
            <span>${icon('reply')} ${t('pro.m.replies', { n: f.stats.humanReplies, p: c.leads.length ? Math.round((f.stats.humanReplies / c.leads.length) * 100) : 0 })}</span>
          </div>
        </div>
        <div class="pro-actions">
          <button class="btn btn-ghost" data-action="generate" ${c.goal.trim().length < 8 || state.ui.gen ? 'disabled' : ''} title="${t('pro.ai.title')}">${state.ui.gen ? '<span class="spin"></span>' : icon('sparkles')} ${t('pro.ai')}</button>
          <button class="btn btn-primary" data-action="launch" data-testid="pro-launch" ${hasErrors ? 'disabled' : ''}>${icon('rocket')} ${t('pro.launch')}</button>
        </div>
      </div>
      ${c.leads.length ? '' : `<div class="banner warn">${icon('alert')} <span>${t('pro.noLeads')}</span><button class="btn btn-soft" data-action="pickSource" data-arg="demo">${t('aud.demo')}</button></div>`}
      ${c.goal.trim() ? '' : `<div class="banner">${icon('target')} <span>${t('pro.noGoal')}</span><input class="inp" data-bind="campaign.goal" value="${esc(c.goal)}" placeholder="${t('goal.ph')}"></div>`}
      ${RulesPanel()}
      <div class="seq" data-testid="seq">
        ${sortedForView().map((s, i) => StepRow(s, i, f, checks)).join('')}
      </div>
      <div class="add-pro">
        <span>${icon('plus')} ${t('pro.add')}</span>
        ${ADD_CHANNELS.map((ch) => `<button class="add-ch" style="--c:${chColor(ch)}" data-action="addStep" data-arg="${ch}" title="${chName(ch)}">${chIcon(ch)}<span>${chName(ch)}</span></button>`).join('')}
      </div>
    </section>
    <aside class="pro-side">
      ${LogicMap(f)}
      ${RiskPanel(checks)}
      ${ForecastPanel(f)}
    </aside>
  </main>`;
}

/* ------------------------------ rules ------------------------------ */

function RulesPanel() {
  const r = state.campaign.rules;
  const open = state.ui.rulesOpen;
  const hours = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ v: a + i, label: `${pad2(a + i)}:00` }));
  return `<section class="${cls('panel rules', open && 'is-open')}" data-key="rules" data-testid="rules">
    <header class="panel-head clickable" data-action="toggleRules" role="button" tabindex="0" aria-expanded="${open}">
      <span class="ph-ic">${icon('shield')}</span>
      <div class="ph-text"><b>${t('rules.title')}</b><small>${t('rules.summary', { a: pad2(r.workStart), b: pad2(r.workEnd) })}</small></div>
      <div class="rule-badges"><span>${icon('stop')} ${t('rules.b.stop')}</span><span>${icon('clock')} ${t('rules.b.hours')}</span><span>${icon('shuffle')} ${t('rules.b.cascade')}</span></div>
      <span class="chev">${icon('chevron-down')}</span>
    </header>
    ${open ? `<div class="rules-body">
      <div class="rcol">
        <h4>${icon('clock')} ${t('rules.hours')}</h4>
        <div class="row"><label>${t('rules.from')}</label>${Select('campaign.rules.workStart', r.workStart, hours(6, 12), 'data-num')}<label>${t('rules.to')}</label>${Select('campaign.rules.workEnd', r.workEnd, hours(15, 22), 'data-num')}</div>
        ${Toggle('campaign.rules.skipWeekends', r.skipWeekends, t('rules.weekends'), t('rules.weekends.hint'))}
        ${Toggle('campaign.channels.sms.tzByCode', state.campaign.channels.sms.tzByCode, t('rules.tzcode'), t('rules.tzcode.hint'))}
        ${HoursViz()}
      </div>
      <div class="rcol">
        <h4>${icon('stop')} ${t('rules.autostop')}</h4>
        ${Toggle(null, true, t('rules.stop.reply'), t('rules.stop.reply.hint'), { locked: true })}
        ${Toggle(null, true, t('rules.stop.unsub'), t('rules.stop.unsub.hint'), { locked: true })}
        ${Toggle('campaign.rules.bounceFallback', r.bounceFallback, t('rules.stop.bounce'), t('rules.stop.bounce.hint'))}
        ${Toggle('campaign.rules.ignoreAutoReply', r.ignoreAutoReply, t('rules.stop.ooo'), t('rules.stop.ooo.hint'))}
      </div>
      <div class="rcol">
        <h4>${icon('shuffle')} ${t('rules.cascade')}</h4>
        ${CascadeEditor()}
        <div class="row seed"><label>${t('rules.seed')}</label><input class="inp xs mono" type="number" min="1" max="9999" data-bind="sim.seed" data-num value="${state.sim.seed}"><small class="muted">${t('rules.seed.hint')}</small></div>
      </div>
    </div>` : ''}
  </section>`;
}

function CascadeEditor() {
  const list = state.campaign.rules.cascade;
  const cov = Data.coverage(state.campaign.leads);
  const n = state.campaign.leads.length || 1;
  return `<ol class="cascade" data-testid="cascade">${list.map((c, i) => `<li class="${cls('casc', !c.on && 'is-off')}" data-key="c-${c.id}" style="--c:${chColor(c.id)}">
      <span class="casc-n mono">${i + 1}</span>${ChBadge(c.id, 'sm')}<b>${chName(c.id)}</b>
      <span class="casc-cov mono" title="${t('rules.cascade.cov')}">${cov[c.id]}/${state.campaign.leads.length}</span>
      <span class="casc-bar"><i style="width:${(cov[c.id] / n) * 100}%"></i></span>
      <button class="icon-btn xs" data-action="cascadeMove" data-arg="${c.id}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('common.up')}">${icon('arrow-up')}</button>
      <button class="icon-btn xs" data-action="cascadeMove" data-arg="${c.id}:1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="${t('common.down')}">${icon('arrow-down')}</button>
      <button class="${cls('mini-tgl', c.on && 'is-on')}" data-action="cascadeToggle" data-arg="${c.id}" role="switch" aria-checked="${c.on}" aria-label="${chName(c.id)}"><i></i></button>
    </li>`).join('')}</ol>
    <p class="hint">${t('rules.cascade.hint')}</p>`;
}

/** Every timezone of the audience on a 24h strip, with the working window and the launch moment. */
function HoursViz() {
  const r = state.campaign.rules;
  const groups = new Map();
  for (const l of state.campaign.leads) {
    const g = groups.get(l.tz) || { tz: l.tz, city: l.city, n: 0 };
    g.n++;
    groups.set(l.tz, g);
  }
  const list = [...groups.values()].sort((a, b) => b.tz - a.tz);
  if (!list.length) return '';
  return `<div class="hours-viz" style="--ws:${(r.workStart / 24) * 100}%;--we:${(r.workEnd / 24) * 100}%">
    ${list.map((g) => {
    const p = clockParts(Engine.LAUNCH_T, g.tz);
    const ok = Engine.inWindow(Engine.LAUNCH_T, g.tz, r);
    return `<div class="hv-row ${ok ? 'ok' : 'wait'}"><span class="hv-city">${esc(cityName(g.city))} <small class="mono">${tzLabel(g.tz)} · ${g.n}</small></span>
        <span class="hv-bar"><i class="hv-win"></i><i class="hv-now" style="left:${((p.hh * 60 + p.mm) / 1440) * 100}%"></i></span>
        <b class="mono">${pad2(p.hh)}:${pad2(p.mm)}</b></div>`;
  }).join('')}
    <p class="hint">${t('rules.hv.hint')}</p>
  </div>`;
}

/* ------------------------------ steps ------------------------------ */

function StepRow(s, i, f, checks) {
  const open = !!state.ui.expanded[s.id];
  const tab = state.ui.stepTab[s.id] || 'message';
  const st = f.stepStats[s.id] || { sent: 0, skipped: 0, deferred: 0, limit: 0 };
  const issues = checks.filter((c) => c.step === s.id);
  const level = issues.some((x) => x.level === 'error') ? 'err' : issues.length ? 'warn' : '';
  return `<article class="${cls('step', open && 'is-open', level && `has-${level}`)}" data-key="st-${s.id}" style="--c:${chColor(s.channel)}" data-testid="step-${s.id}">
    <header class="step-head" data-action="toggleStep" data-arg="${s.id}" role="button" tabindex="0" aria-expanded="${open}">
      <span class="step-n mono">${i + 1}</span>
      ${ChBadge(s.channel)}
      <div class="step-name"><b>${stepTitlePro(s)}</b><small>${stepMeta(s)}</small></div>
      <span class="${cls('cond', `cond-${stepIndex(s.id) === 0 ? 'start' : s.condition}`)}">${icon(stepIndex(s.id) === 0 ? 'play' : COND_IC[s.condition])}${condShort(s)}</span>
      <span class="step-fc mono" title="${t('pro.fc.title')}">${icon('send')} ${st.sent}${st.skipped ? `<em>−${st.skipped}</em>` : ''}${st.limit ? `<em class="lim">${icon('gauge')}${st.limit}</em>` : ''}</span>
      ${level ? `<span class="${cls('issue', level)}">${icon('alert')} ${issues.length}</span>` : ''}
      <span class="chev">${icon('chevron-down')}</span>
    </header>
    ${open ? `<div class="step-body">
      <nav class="subtabs" role="tablist">
        ${['message', 'logic', 'channel'].map((x) => `<button role="tab" aria-selected="${tab === x}" class="${cls(tab === x && 'is-on')}" data-action="stepTab" data-arg="${s.id}:${x}" data-testid="tab-${s.id}-${x}">${icon(TAB_IC[x])} ${x === 'channel' ? t('pro.tab.channel', { ch: chName(s.channel) }) : t(`pro.tab.${x}`)}</button>`).join('')}
        <span class="grow"></span>
        <button class="btn-link danger" data-action="removeStep" data-arg="${s.id}">${icon('trash')} ${t('sheet.remove')}</button>
      </nav>
      <div class="subtab-body">${tab === 'message' ? StepMessage(s) : tab === 'logic' ? StepLogic(s) : ChannelSettings(s)}</div>
    </div>` : ''}
  </article>`;
}

const COND_IC = { no_reply: 'reply', opened: 'eye', not_opened: 'eye-off', clicked: 'click' };

function StepMessage(s) {
  const idx = stepIndex(s.id);
  const lead = sampleLead();
  const notes = validateStep(s);
  const level = notes.some((n) => n.level === 'error') ? 'is-err' : notes.some((n) => n.level === 'warn') ? 'is-warn' : '';
  return `<div class="msg-editor">
    <div class="msg-col">
      ${s.channel === 'email' ? `<label class="fl">${t('pro.subject')}</label><input class="inp" data-bind="campaign.steps.${idx}.subject" value="${esc(s.subject)}">` : ''}
      <label class="fl">${s.channel === 'call' ? t('sheet.script') : t('sheet.text')}</label>
      <div class="${cls('ta-wrap', level)}">
        <textarea class="inp ta" data-bind="campaign.steps.${idx}.text" rows="${s.channel === 'email' || s.channel === 'call' ? 8 : 5}" data-testid="text-${s.id}">${esc(s.text)}</textarea>
        <div class="ta-tools">
          ${['firstName', 'company', 'city'].map((k) => `<button class="var-btn mono" data-action="insertVar" data-arg="${s.id}:${k}">{{${k}}}</button>`).join('')}
          <span class="grow"></span>${Counter(s)}
        </div>
      </div>
      ${notes.map((n) => `<div class="${cls('note', n.level)}">${icon(n.level === 'error' ? 'ban' : 'alert')}<span>${n.text}</span>${n.fix ? `<button class="btn-link" data-action="fix" data-arg="${n.fix.arg}">${icon('wand')} ${n.fix.label}</button>` : ''}</div>`).join('')}
    </div>
    <div class="msg-col">
      <div class="preview-head"><span>${icon('eye')} ${t('pro.preview')}</span>
        ${state.campaign.leads.length ? Select('ui.previewLead', state.ui.previewLead, state.campaign.leads.slice(0, 48).map((l, i) => ({ v: i, label: `${esc(l.name)} · ${esc(cityName(l.city))}` })), 'data-num') : ''}</div>
      ${MessagePreview(s, lead)}
    </div>
  </div>`;
}

function Counter(s) {
  const text = s.text || '';
  if (s.channel === 'sms') {
    const i = smsInfoFor(s);
    return `<span class="${cls('counter mono', i.segments > 1 && 'bad')}" data-testid="sms-counter">${i.length}/${i.perSegment} · ${i.encoding} · ${t('sms.segments', { n: i.segments })}</span>`;
  }
  if (s.channel === 'linkedin' && s.kind !== 'message') return `<span class="${cls('counter mono', text.length > 300 && 'bad')}">${text.length}/300</span>`;
  if (s.channel === 'call') return `<span class="counter mono">≈ ${Math.max(1, Math.round(text.split(/\s+/).length / 2.4))} ${t('common.sec')}</span>`;
  return `<span class="counter mono">${text.length} ${t('common.chars')}</span>`;
}

function firstCascadeFor(lead) {
  const on = state.campaign.rules.cascade.filter((c) => c.on).map((c) => c.id);
  return on.find((c) => (c === 'sms' ? lead.has.phone : lead.has[c])) || on[0] || 'whatsapp';
}

function MessagePreview(s, lead) {
  const C = state.campaign.channels;
  const ch = s.channel === 'messenger' ? firstCascadeFor(lead) : s.channel;
  const first = isMessengerStep(s) && Engine.isFirstMessengerStep(s, state.campaign);
  const strip = MESSENGERS.includes(ch) && first && C[ch].noLinksFirst && Engine.hasLink(s.text);
  const body = richPreview(s.text, lead, { stripLinks: strip });
  const viaCascade = s.channel === 'messenger' ? `<div class="pv-route">${icon('shuffle')} ${t('pv.route', { name: esc(lead.firstName), ch: chName(ch) })}</div>` : '';
  if (ch === 'email') {
    const mb = C.email.mailboxes.find((m) => m.enabled);
    return `<div class="pv pv-email">
      <div class="pv-mail-head"><span>${t('pv.from')}: <b class="mono">${esc(mb ? mb.address : '—')}</b></span><span>${t('pv.to')}: <span class="mono">${esc(lead.email || 'anna.smirnova@logitekh.ru')}</span></span></div>
      <div class="pv-subj">${richPreview(s.subject, lead)}</div>
      <div class="pv-body">${body}</div>
      <div class="${cls('pv-pixel', !C.email.trackOpens && 'off')}">${icon(C.email.trackOpens ? 'eye' : 'eye-off')} ${C.email.trackOpens ? t('pv.pixel') : t('pv.noPixel')}${C.email.plainText ? ` · ${t('pv.plain')}` : ''}</div>
    </div>`;
  }
  if (MESSENGERS.includes(ch)) {
    const cfg = C[ch];
    const media = ch === 'telegram' && cfg.videoNotes
      ? `<div class="video-note"><span class="vn-face">${Avatar({ id: 'me', name: L(Data.SENDER), firstName: L(Data.SENDER), lastName: '' })}</span><small class="mono">0:12</small></div>`
      : cfg.voiceNotes ? `<div class="bubble-out voice">${icon('mic')}<span class="vwave">${Array.from({ length: 22 }, (_, i) => `<i style="--h:${20 + ((i * 37) % 70)}%"></i>`).join('')}</span><small class="mono">0:18</small></div>` : '';
    return `<div class="pv pv-chat pv-${ch}">
      <div class="pv-chat-head">${ChBadge(ch, 'sm')}<b>${esc(lead.name)}</b><small>${cfg.typing ? t('pv.typing') : t('pv.online')}</small></div>
      <div class="pv-chat-body">
        ${viaCascade}
        ${cfg.typing ? '<div class="typing" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}
        <div class="bubble-out">${body}<time class="mono">10:24 ✓✓</time></div>
        ${strip ? `<div class="pv-strip">${icon('link-off')} ${t('pv.stripped')}</div>` : ''}
        ${media}
      </div>
    </div>`;
  }
  if (ch === 'linkedin') {
    return `<div class="pv pv-li">
      <div class="pv-li-card">${Avatar(lead, 'lg')}<div><b>${esc(lead.name)}</b><small>${esc(lead.role)} · ${esc(lead.company)}</small></div><span class="li-connect">${icon('user-plus')} ${s.kind === 'message' ? t('pv.li.msg') : t('pv.li.connect')}</span></div>
      ${C.linkedin.likeWarmup && s.kind !== 'message' ? `<div class="pv-li-like">${icon('heart')} ${t('pv.li.liked')}</div>` : ''}
      ${C.linkedin.inviteNote || s.kind === 'message' ? `<div class="pv-li-note">${body}</div>` : `<div class="pv-li-note muted">${t('pv.li.noNote')}</div>`}
    </div>`;
  }
  if (ch === 'sms') {
    return `<div class="pv pv-sms"><div class="pv-sms-head mono">${esc(C.sms.senderId)}</div>${viaCascade}<div class="bubble-in">${body}</div></div>`;
  }
  // call script
  return `<div class="pv pv-call">
    <div class="pv-call-head">${ChBadge('call', 'sm')}<b>${t(`call.mode.${C.call.mode}`)}</b><small class="mono">${esc(C.call.localPresence ? (C.call.callerIds[lead.city] || C.call.callerIds.default) : C.call.callerIds.default)}</small></div>
    <ol class="pv-script">${esc(personalize(s.text, lead)).split('\n').filter(Boolean).map((l) => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('')}</ol>
  </div>`;
}

function StepLogic(s) {
  const idx = stepIndex(s.id);
  const first = idx === 0;
  const opts = condOptions(s);
  const earlier = steps().slice(0, idx);
  const times = [{ v: 'auto', label: t('pro.time.auto') }, ...[9, 10, 11, 12, 14, 15, 16, 17].map((h) => ({ v: h, label: `${pad2(h)}:00 ${t('pro.local')}` }))];
  const issue = condIssue(s);
  return `<div class="logic">
    <div class="logic-grid">
      <div><label class="fl">${t('pro.day')}</label><div class="stepper sm"><button data-action="stepDay" data-arg="${s.id}:-1" aria-label="−1">${icon('minus')}</button><b class="mono">${t('day.n', { n: s.day })} · ${t(`dow.${dow(s.day)}`)}</b><button data-action="stepDay" data-arg="${s.id}:1" aria-label="+1">${icon('plus')}</button></div></div>
      <div><label class="fl">${t('pro.time')}</label>${Select(`campaign.steps.${idx}.sendAt`, s.sendAt, times, 'data-kind="autonum"')}</div>
      <div class="span2"><label class="fl">${t('pro.cond')}</label>
        <div class="cond-pick" data-testid="cond-${s.id}">${opts.map((o) => `<button class="${cls('cond-opt', `cond-${o.id}`, s.condition === o.id && !first && 'is-on', first && o.id === 'no_reply' && 'is-on')}" data-action="setCond" data-arg="${s.id}:${o.id}" ${o.disabled ? 'disabled' : ''} data-testid="cond-${s.id}-${o.id}">${icon(COND_IC[o.id])}<span>${first && o.id === 'no_reply' ? t('cond.short.start') : o.label}</span>${o.reason ? `<small>${o.reason}</small>` : ''}</button>`).join('')}</div>
      </div>
      ${!first && s.condition !== 'no_reply' ? `<div class="span2"><label class="fl">${t('pro.ref')}</label>${Select(`campaign.steps.${idx}.ref`, s.ref, earlier.map((p) => ({ v: p.id, label: `#${stepNo(p)} · ${stepTitlePro(p)}` })))}</div>` : ''}
    </div>
    ${issue ? `<div class="note warn">${icon('alert')}<span>${issue.text}</span>${issue.fix ? `<button class="btn-link" data-action="fix" data-arg="${issue.fix.arg}">${icon('wand')} ${issue.fix.label}</button>` : ''}</div>` : ''}
    <div class="logic-explain">${icon('git')}<span>${explainStep(s)}</span></div>
  </div>`;
}

function explainStep(s) {
  const r = state.campaign.rules;
  const time = s.sendAt === 'auto' ? t('logic.time.auto', { a: pad2(r.workStart), b: pad2(r.workEnd) }) : t('logic.time.fixed', { h: pad2(s.sendAt) });
  const ref = s.ref ? stepById(s.ref) : null;
  const who = stepIndex(s.id) === 0 ? t('logic.who.all')
    : s.condition === 'no_reply' || !ref ? t('logic.who.no_reply')
      : t(`logic.who.${s.condition}`, { r: stepNo(ref), ch: chName(ref.channel) });
  const weekend = isWeekendDay(s.day) && r.skipWeekends ? ` ${t('logic.weekend')}` : '';
  return `${t('logic.explain', { n: stepNo(s), d: s.day, time, who })}${weekend} ${t('logic.stop')}`;
}

/* --------------------------- channel settings --------------------------- */

function Block(title, ic, body, extra = '') {
  return `<section class="${cls('cs-block', extra)}"><h5>${icon(ic)} ${title}</h5>${body}</section>`;
}

function peakUsage(f, prefix) {
  let max = 0;
  for (const [k, v] of Object.entries(f.usage)) if (k.startsWith(prefix) && v > max) max = v;
  return max;
}

function UsageBar(used, cap) {
  const p = cap ? Math.min(100, (used / cap) * 100) : 0;
  return `<span class="${cls('usage', p >= 100 && 'full', p >= 80 && p < 100 && 'hot')}"><i style="width:${p}%"></i></span>`;
}

function ChannelSettings(s) {
  const ch = s.channel;
  const body = ch === 'email' ? EmailSettings()
    : ch === 'linkedin' ? LinkedInSettings()
      : ch === 'messenger' ? MessengerTabs()
        : MESSENGERS.includes(ch) ? MessengerSettings(ch)
          : ch === 'sms' ? SmsSettings(s)
            : CallSettings();
  return `<div class="cs"><p class="cs-note">${icon('info')} ${t('cs.shared', { ch: chName(ch) })}</p>${body}</div>`;
}

function EmailSettings() {
  const e = state.campaign.channels.email;
  const f = forecast();
  const rows = e.mailboxes.map((m, i) => {
    const cap = Engine.emailCap(m, 0, e);
    const peak = peakUsage(f, `mb:${m.id}:`);
    return `<tr class="${cls(!m.enabled && 'is-off')}" data-key="mb-${m.id}">
      <td class="mono">${esc(m.address)}</td>
      <td><span class="${cls('health', m.health >= 90 ? 'good' : m.health >= 85 ? 'ok' : 'bad')}"><i style="width:${m.health}%"></i></span><b class="mono">${m.health}%</b></td>
      <td class="mono">${t('em.age', { n: m.ageDays })}</td>
      <td class="mono">${cap}</td>
      <td>${UsageBar(peak, cap)}<b class="mono">${peak}</b></td>
      <td>${Toggle(`campaign.channels.email.mailboxes.${i}.enabled`, m.enabled, '', '', { compact: true })}</td></tr>`;
  }).join('');
  const ramp = Array.from({ length: 15 }, (_, d) => Engine.emailCap({ ageDays: Math.min(...e.mailboxes.map((m) => m.ageDays)) }, d, e));
  const maxR = Math.max(...ramp, 1);
  return `<div class="cs-grid">
    ${Block(t('em.rotation'), 'inbox', `
      <div class="row"><label>${t('em.strategy')}</label>${Seg('campaign.channels.email.rotation', e.rotation, [{ v: 'round_robin', label: t('em.rot.rr') }, { v: 'health', label: t('em.rot.health') }], 'sm')}</div>
      <table class="tbl"><thead><tr><th>${t('em.mailbox')}</th><th>${t('em.health')}</th><th>${t('em.warmday')}</th><th>${t('em.cap')}</th><th>${t('em.peak')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`, 'span2')}
    ${Block(t('em.limit'), 'gauge', `${Range('campaign.channels.email.dailyLimit', e.dailyLimit, 10, 150, 5, { safe: 45, danger: 60, unit: t('em.limit.unit') })}<p class="hint">${t('em.limit.hint')}</p>`)}
    ${Block(t('em.warmup'), 'flame', `
      ${Toggle('campaign.channels.email.warmup.enabled', e.warmup.enabled, t('em.warmup.on'), t('em.warmup.hint'))}
      <div class="row"><label>${t('em.warm.start')}</label><input class="inp xs mono" type="number" min="5" max="60" data-bind="campaign.channels.email.warmup.start" data-num value="${e.warmup.start}"><label>${t('em.warm.step')}</label><input class="inp xs mono" type="number" min="1" max="20" data-bind="campaign.channels.email.warmup.step" data-num value="${e.warmup.step}"></div>
      <div class="spark" aria-hidden="true">${ramp.map((v) => `<i style="height:${(v / maxR) * 100}%" class="${v >= e.dailyLimit ? 'cap' : ''}"></i>`).join('')}</div>
      <small class="muted">${t('em.warm.spark')}</small>`)}
    ${Block(t('em.tracking'), 'eye-off', `
      ${Toggle('campaign.channels.email.trackOpens', e.trackOpens, t('em.pixel'), t('em.pixel.hint'))}
      ${Toggle('campaign.channels.email.trackClicks', e.trackClicks, t('em.clicks'), t('em.clicks.hint'))}
      ${Toggle('campaign.channels.email.plainText', e.plainText, t('em.plain'), t('em.plain.hint'))}`, 'span2')}
  </div>`;
}

function LinkedInSettings() {
  const li = state.campaign.channels.linkedin;
  const f = forecast();
  const peak = peakUsage(f, 'li:inv:');
  const proxyStatus = li.proxy === 'none'
    ? `<div class="note warn">${icon('alert')}<span>${t('li.proxy.none')}</span></div>`
    : `<div class="proxy-status"><i class="ok-dot"></i><b>${t('li.proxy.online')}</b><span class="mono">185.•••.•••.21 · ${li.proxyRegion === 'auto' ? t('li.region.auto') : li.proxyRegion} · 38 ms</span></div>`;
  return `<div class="cs-grid">
    ${Block(t('li.warmup'), 'heart', `
      ${Toggle('campaign.channels.linkedin.likeWarmup', li.likeWarmup, t('li.like'), t('li.like.hint'))}
      <div class="row"><label>${t('li.when')}</label>${Select('campaign.channels.linkedin.warmupDays', li.warmupDays, [{ v: 0, label: t('li.when.0') }, { v: 1, label: t('li.when.1') }, { v: 2, label: t('li.when.2') }], 'data-num')}</div>
      ${Toggle('campaign.channels.linkedin.viewProfile', li.viewProfile, t('li.view'), t('li.view.hint'))}`)}
    ${Block(t('li.limit'), 'gauge', `
      ${Range('campaign.channels.linkedin.inviteLimit', li.inviteLimit, 5, 50, 1, { safe: 20, danger: 30, unit: t('li.limit.unit') })}
      <div class="row"><span class="muted">${t('li.week', { n: li.inviteLimit * 5 })}</span><span class="grow"></span>${UsageBar(peak, li.inviteLimit)}<b class="mono">${peak}/${li.inviteLimit}</b></div>
      <p class="hint">${t('li.limit.hint')}</p>`)}
    ${Block(t('li.note'), 'edit', Toggle('campaign.channels.linkedin.inviteNote', li.inviteNote, t('li.note.on'), t('li.note.hint')))}
    ${Block(t('li.proxy'), 'server', `
      ${Seg('campaign.channels.linkedin.proxy', li.proxy, [{ v: 'residential', label: t('li.proxy.res') }, { v: 'dedicated', label: t('li.proxy.ded') }, { v: 'none', label: t('li.proxy.off') }], 'sm')}
      ${li.proxy !== 'none' ? `<div class="row"><label>${t('li.region')}</label>${Select('campaign.channels.linkedin.proxyRegion', li.proxyRegion, [{ v: 'auto', label: t('li.region.auto') }, { v: 'DE', label: 'DE · Frankfurt' }, { v: 'GB', label: 'GB · London' }, { v: 'US', label: 'US · Virginia' }, { v: 'AE', label: 'AE · Dubai' }])}</div>` : ''}
      ${proxyStatus}`)}
  </div>`;
}

function MessengerTabs() {
  const tab = state.ui.msgrTab;
  return `<nav class="msgr-tabs" role="tablist">${MESSENGERS.map((m) => `<button role="tab" aria-selected="${tab === m}" class="${cls(tab === m && 'is-on')}" style="--c:${chColor(m)}" data-action="msgrTab" data-arg="${m}" data-testid="msgr-${m}">${chIcon(m)} ${chName(m)}</button>`).join('')}</nav>
    ${MessengerSettings(tab)}
    <div class="cs-grid">${Block(t('rules.cascade'), 'shuffle', CascadeEditor(), 'span2')}</div>`;
}

function MessengerSettings(ch) {
  const m = state.campaign.channels[ch];
  const base = `campaign.channels.${ch}`;
  const f = forecast();
  const media = ch === 'telegram'
    ? `${Toggle(`${base}.voiceNotes`, m.voiceNotes, t('msg.voice'), t('msg.voice.hint'))}${Toggle(`${base}.videoNotes`, m.videoNotes, t('msg.circle'), t('msg.circle.hint'))}`
    : Toggle(`${base}.voiceNotes`, m.voiceNotes, t('msg.voice'), t('msg.voice.hint'));
  const numbers = m.numbers.map((n) => {
    const peak = peakUsage(f, `num:${ch}:${n.id}:`);
    return `<div class="num-row" data-key="n-${n.id}"><span class="mono">${esc(n.label)}</span>${UsageBar(peak, m.dailyPerNumber)}<b class="mono">${peak}/${m.dailyPerNumber}</b></div>`;
  }).join('');
  return `<div class="cs-grid" data-key="msgr-${ch}">
    ${Block(t('msg.safety'), 'shield', `
      ${Toggle(`${base}.noLinksFirst`, m.noLinksFirst, t('msg.nolinks'), t('msg.nolinks.hint'))}
      ${Toggle(`${base}.typing`, m.typing, t('msg.typing'), t('msg.typing.hint'))}
      ${m.typing ? `<div class="row"><label>${t('msg.speed')}</label>${Seg(`${base}.typingSpeed`, m.typingSpeed, [{ v: 'slow', label: t('msg.speed.slow') }, { v: 'human', label: t('msg.speed.human') }, { v: 'fast', label: t('msg.speed.fast') }], 'sm')}</div>` : ''}`)}
    ${Block(t('msg.media'), 'mic', media)}
    ${Block(t('msg.limits'), 'gauge', `
      ${Range(`${base}.dailyPerNumber`, m.dailyPerNumber, 5, 80, 1, { safe: SAFE_PER_NUMBER[ch], danger: Math.round(SAFE_PER_NUMBER[ch] * 1.6), unit: t('msg.limit.unit') })}
      <div class="nums">${numbers}</div>
      <p class="hint">${t('msg.limit.hint')}</p>`, 'span2')}
  </div>`;
}

function SmsSettings(s) {
  const sms = state.campaign.channels.sms;
  const info = smsInfoFor(s);
  const probe = Engine.tzFromPhone(state.ui.tzProbe);
  const groups = new Map();
  for (const l of state.campaign.leads) {
    const code = (Data.CITIES[l.city] || {}).code || '?';
    const g = groups.get(code) || { code, city: l.city, tz: l.tz, n: 0 };
    g.n++;
    groups.set(code, g);
  }
  const probeOut = !sms.tzByCode ? `<div class="probe bad">${t('sms.tz.off')}</div>` : probe
    ? (() => {
      const ok = Engine.inWindow(Engine.LAUNCH_T, probe.tz, state.campaign.rules);
      const next = Engine.nextWindow(Engine.LAUNCH_T, probe.tz, state.campaign.rules);
      return `<div class="${cls('probe', ok ? 'ok' : 'wait')}"><b>${esc(cityName(probe.city))}</b><span class="mono">${tzLabel(probe.tz)} · ${t('sms.probe.now', { time: fmtHM(Engine.LAUNCH_T, probe.tz) })}</span><em>${ok ? t('sms.probe.ok') : t('sms.probe.wait', { time: fmtDHM(next, probe.tz) })}</em></div>`;
    })()
    : `<div class="probe bad">${t('sms.probe.unknown')}</div>`;
  return `<div class="cs-grid">
    ${Block(t('sms.length'), 'sms', `
      <div class="sms-meter ${info.segments > 1 ? 'bad' : ''}"><b class="mono">${info.length}</b><span>/ ${info.perSegment}</span><em>${info.encoding}</em><small>${t('sms.segments', { n: info.segments })}</small></div>
      ${Toggle('campaign.channels.sms.singleSegment', sms.singleSegment, t('sms.single'), t('sms.single.hint'))}
      <p class="hint">${t('sms.enc.hint')}</p>`)}
    ${Block(t('sms.tz'), 'globe', `
      ${Toggle('campaign.channels.sms.tzByCode', sms.tzByCode, t('sms.tz.on'), t('sms.tz.hint'))}
      <div class="row"><label>${t('sms.probe')}</label><input class="inp mono" data-bind="ui.tzProbe" value="${esc(state.ui.tzProbe)}" data-testid="tz-probe"></div>
      ${probeOut}
      <table class="tbl compact"><tbody>${[...groups.values()].sort((a, b) => b.n - a.n).map((g) => `<tr><td class="mono">${esc(g.code)}</td><td>${esc(cityName(g.city))}</td><td class="mono">${tzLabel(g.tz)}</td><td class="mono">${g.n}</td></tr>`).join('')}</tbody></table>`)}
    ${Block(t('sms.stop'), 'ban', `
      <div class="stopwords" data-testid="stopwords">${sms.stopWords.map((w) => `<span class="sw" data-key="sw-${esc(w)}">${esc(w)}<button data-action="removeStopWord" data-arg="${esc(w)}" aria-label="${t('common.remove')}">${icon('x')}</button></span>`).join('')}</div>
      <div class="row"><input class="inp" data-bind="ui.newStopWord" data-enter="addStopWord" value="${esc(state.ui.newStopWord)}" placeholder="${t('sms.stop.ph')}"><button class="btn btn-soft" data-action="addStopWord">${icon('plus')} ${t('common.add')}</button></div>
      <p class="hint">${t('sms.stop.hint')}</p>`)}
    ${Block(t('sms.sender'), 'user', `
      <div class="row"><label>${t('sms.sender.id')}</label><input class="inp mono" maxlength="11" data-bind="campaign.channels.sms.senderId" value="${esc(sms.senderId)}"><small class="muted mono">${sms.senderId.length}/11</small></div>
      <div class="row"><label>${t('sms.daily')}</label><input class="inp xs mono" type="number" min="10" max="5000" data-bind="campaign.channels.sms.dailyLimit" data-num value="${sms.dailyLimit}"></div>`)}
  </div>`;
}

function CallSettings() {
  const c = state.campaign.channels.call;
  const counts = {};
  for (const l of state.campaign.leads) counts[l.city] = (counts[l.city] || 0) + 1;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([city, n]) => `<tr><td>${esc(cityName(city))}</td><td class="mono">${esc(c.localPresence ? (c.callerIds[city] || c.callerIds.default) : c.callerIds.default)}</td><td class="mono">${n}</td></tr>`).join('');
  const mgr = Data.MANAGERS;
  return `<div class="cs-grid">
    ${Block(t('call.local'), 'map-pin', `
      ${Toggle('campaign.channels.call.localPresence', c.localPresence, t('call.local.on'), t('call.local.hint'))}
      <table class="tbl compact"><thead><tr><th>${t('call.city')}</th><th>${t('call.callerId')}</th><th>${t('call.leads')}</th></tr></thead><tbody>${rows}</tbody></table>`)}
    ${Block(t('call.amd'), 'voicemail', `
      ${Toggle('campaign.channels.call.amd', c.amd, t('call.amd.on'), t('call.amd.hint'))}
      ${c.amd ? `<div class="row col"><label>${t('call.amd.action')}</label>${Seg('campaign.channels.call.amdAction', c.amdAction, [{ v: 'voicemail', label: t('call.amd.voicemail'), ic: 'voicemail' }, { v: 'retry', label: t('call.amd.retry'), ic: 'rotate' }, { v: 'sms', label: t('call.amd.sms'), ic: 'sms' }], 'sm')}</div>` : ''}`)}
    ${Block(t('call.who'), 'bot', `
      ${Seg('campaign.channels.call.mode', c.mode, [{ v: 'ai', label: t('call.mode.ai'), ic: 'bot' }, { v: 'hybrid', label: t('call.mode.hybrid'), ic: 'transfer' }, { v: 'manager', label: t('call.mode.manager'), ic: 'headset' }], 'sm')}
      <p class="hint">${t(`call.mode.${c.mode}.hint`)}</p>
      ${c.mode !== 'manager' ? `<div class="row"><label>${t('call.voice')}</label>${Select('campaign.channels.call.aiVoice', c.aiVoice, Object.entries(Data.VOICES).map(([k, v]) => ({ v: k, label: `${L(v.name)} · ${L(v.style)}` })))}<button class="icon-btn" data-action="playVoice" aria-label="${t('call.listen')}">${icon('volume')}</button></div>` : ''}
      ${c.mode !== 'ai' ? `<div class="row"><label>${t('call.transfer')}</label>${Select('campaign.channels.call.transferTo', c.transferTo, Object.entries(mgr).map(([k, v]) => ({ v: k, label: `${L(v.name)} · ${t(`mgr.${v.status}`)}` })))}</div>` : ''}`, 'span2')}
    ${Block(t('call.attempts'), 'rotate', `
      <div class="row"><label>${t('call.attempts.n')}</label>${Seg('campaign.channels.call.maxAttempts', c.maxAttempts, [1, 2, 3].map((n) => ({ v: n, label: String(n) })), 'sm')}</div>
      ${Toggle('campaign.channels.call.recording', c.recording, t('call.rec'), t('call.rec.hint'))}`, 'span2')}
  </div>`;
}

/* ------------------------------ sidebar ------------------------------ */

const COND_COLORS = { opened: '#38BDF8', not_opened: '#A78BFA', clicked: '#F59E0B' };

/** SVG flow of the sequence: time spine, branching arcs (by reference), and the stop rail. */
function LogicMap(f) {
  const list = sortedForView();
  const W = 420;
  const NX = 120;
  const NW = 250;
  const NH = 50;
  const ROW = 74;
  const top = 40;
  const y = (i) => top + i * ROW;
  const H = top + list.length * ROW + 52;
  const idxOf = Object.fromEntries(list.map((s, i) => [s.id, i]));
  const arcs = list.map((s, i) => {
    if (i === 0 || s.condition === 'no_reply' || !s.ref || idxOf[s.ref] == null) return '';
    const j = idxOf[s.ref];
    const y1 = y(j) + NH / 2;
    const y2 = y(i) + NH / 2;
    const bulge = Math.min(100, 30 + (i - j) * 16);
    const x0 = NX - 6;
    const issue = condIssue(s);
    const color = issue ? '#EF4444' : COND_COLORS[s.condition];
    const lx = x0 - bulge * 0.75;
    const ly = (y1 + y2) / 2;
    const label = t(`cond.map.${s.condition}`);
    const lw = label.length * 6.2 + 18;
    return `<g class="lm-arc ${issue ? 'is-bad' : ''}">
      <path d="M${x0} ${y1} C ${x0 - bulge} ${y1}, ${x0 - bulge} ${y2}, ${x0} ${y2}" stroke="${color}" fill="none" stroke-width="2" ${issue ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#lm-arrow-${issue ? 'bad' : s.condition})"/>
      <rect x="${lx - lw / 2}" y="${ly - 10}" width="${lw}" height="20" rx="10" fill="var(--surface)" stroke="${color}"/>
      <text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="${color}" font-size="10.5" font-weight="600">${issue ? '⚠ ' : ''}${label}</text>
    </g>`;
  }).join('');
  const nodes = list.map((s, i) => {
    const st = f.stepStats[s.id] || { sent: 0 };
    const open = !!state.ui.expanded[s.id];
    return `<g class="${cls('lm-node', open && 'is-open')}" data-action="toggleStep" data-arg="${s.id}" role="button" tabindex="0" aria-label="${esc(stepTitlePro(s))}">
      <rect x="${NX}" y="${y(i)}" width="${NW}" height="${NH}" rx="12" class="lm-box" style="--c:${chColor(s.channel)}"/>
      <rect x="${NX}" y="${y(i) + 10}" width="3" height="${NH - 20}" rx="1.5" fill="${chColor(s.channel)}"/>
      <svg x="${NX + 14}" y="${y(i) + 15}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${chColor(s.channel)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:${chColor(s.channel)}">${CHANNEL_ICONS[s.channel]}</svg>
      <text x="${NX + 44}" y="${y(i) + 21}" class="lm-t">#${i + 1} ${esc(chName(s.channel))}</text>
      <text x="${NX + 44}" y="${y(i) + 37}" class="lm-s">${esc(t('day.n', { n: s.day }))} · ${esc(condShort(s))}</text>
      <text x="${NX + NW - 12}" y="${y(i) + 30}" text-anchor="end" class="lm-n">${st.sent}</text>
      <line x1="${NX + NW}" y1="${y(i) + NH / 2}" x2="${NX + NW + 22}" y2="${y(i) + NH / 2}" class="lm-stopline"/>
      <circle cx="${NX + NW + 28}" cy="${y(i) + NH / 2}" r="6" class="lm-stopdot"/>
    </g>`;
  }).join('');
  const endY = y(list.length);
  return `<section class="panel lm" data-testid="logic-map">
    <header class="panel-head"><span class="ph-ic">${icon('git')}</span><div class="ph-text"><b>${t('lm.title')}</b><small>${t('lm.sub')}</small></div></header>
    <svg class="lm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('lm.title')}">
      <defs>${['opened', 'not_opened', 'clicked', 'bad'].map((k) => `<marker id="lm-arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${k === 'bad' ? '#EF4444' : COND_COLORS[k]}"/></marker>`).join('')}</defs>
      <rect x="${NX + 60}" y="6" width="130" height="22" rx="11" class="lm-start"/><text x="${NX + 125}" y="21" text-anchor="middle" class="lm-st">▶ ${esc(t('lm.start', { n: state.campaign.leads.length }))}</text>
      <line x1="${NX + NW / 2}" y1="28" x2="${NX + NW / 2}" y2="${endY}" class="lm-spine"/>
      <line x1="${NX + NW + 28}" y1="${top + NH / 2}" x2="${NX + NW + 28}" y2="${endY + 16}" class="lm-rail"/>
      ${arcs}${nodes}
      <rect x="${NX + 40}" y="${endY + 4}" width="170" height="26" rx="13" class="lm-end"/><text x="${NX + 125}" y="${endY + 21}" text-anchor="middle" class="lm-st">⚑ ${esc(t('lm.end'))}</text>
      <text x="${NX + NW + 34}" y="${endY + 34}" text-anchor="end" class="lm-railt">${esc(t('lm.rail'))}</text>
    </svg>
    <div class="lm-legend">${['opened', 'not_opened', 'clicked'].map((k) => `<span><i style="background:${COND_COLORS[k]}"></i>${t(`cond.map.${k}`)}</span>`).join('')}<span><i class="rail"></i>${t('lm.rail')}</span></div>
  </section>`;
}

function RiskPanel(checks) {
  const risk = riskScore();
  const arc = 163.4;
  const color = risk.level === 'low' ? '#22C55E' : risk.level === 'mid' ? '#F59E0B' : '#EF4444';
  return `<section class="panel risk" data-testid="risk">
    <header class="panel-head"><span class="ph-ic">${icon('shield')}</span><div class="ph-text"><b>${t('risk.title')}</b><small>${t('risk.sub')}</small></div></header>
    <div class="risk-body">
      <div class="gauge">
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <defs><linearGradient id="g-risk" x1="0" x2="1"><stop offset="0" stop-color="#22C55E"/><stop offset=".5" stop-color="#F59E0B"/><stop offset="1" stop-color="#EF4444"/></linearGradient></defs>
          <path d="M8 62 A52 52 0 0 1 112 62" class="g-bg"/>
          <path d="M8 62 A52 52 0 0 1 112 62" class="g-zone" stroke="url(#g-risk)"/>
          <path d="M8 62 A52 52 0 0 1 112 62" class="g-val" stroke="${color}" stroke-dasharray="${(risk.score / 100) * arc} ${arc}"/>
          <g class="g-needle" style="transform:rotate(${-90 + risk.score * 1.8}deg)"><line x1="60" y1="62" x2="60" y2="22"/><circle cx="60" cy="62" r="4"/></g>
        </svg>
        <div class="gauge-val"><b class="mono" style="color:${color}" data-testid="risk-score">${risk.score}</b><small>${t(`risk.level.${risk.level}`)}</small></div>
      </div>
      <ul class="checks">${checks.slice(0, 9).map((c) => `<li class="${cls('chk', c.level)}">${icon(c.level === 'ok' ? 'check-circle' : c.level === 'error' ? 'ban' : 'alert')}<span>${c.text}</span>${c.fix ? `<button class="btn-link" data-action="${c.fix.action || 'fix'}" data-arg="${c.fix.arg}">${icon('wand')} ${c.fix.label}</button>` : ''}</li>`).join('')}</ul>
    </div>
  </section>`;
}

const FC_ORDER = ['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'sms', 'call'];

function ForecastPanel(f) {
  const days = f.byDay;
  const max = Math.max(1, ...days.map((d) => d.sends));
  const used = FC_ORDER.filter((ch) => days.some((d) => d.byCh[ch]));
  const s = f.stats;
  return `<section class="panel fc" data-testid="forecast">
    <header class="panel-head"><span class="ph-ic">${icon('activity')}</span><div class="ph-text"><b>${t('fc.title')}</b><small>${t('fc.sub', { seed: f.seed })}</small></div></header>
    <div class="fc-bars">${days.map((d) => `<div class="${cls('fc-col', isWeekendDay(d.day) && 'is-weekend')}" title="${t('day.n', { n: d.day })}: ${d.sends}">
        <div class="fc-stack">${FC_ORDER.filter((ch) => d.byCh[ch]).map((ch) => `<i style="height:${(d.byCh[ch] / max) * 100}%;--c:${chColor(ch)}" title="${chName(ch)}: ${d.byCh[ch]}"></i>`).join('')}</div>
        <b class="mono">${d.sends || ''}</b><small>${t(`dow.${dow(d.day)}`)}</small>
        <span class="fc-flags">${d.deferred ? `<em class="f-night" title="${t('fc.deferred')}">${icon('moon')}${d.deferred}</em>` : ''}${d.limit ? `<em class="f-limit" title="${t('fc.limit')}">${icon('gauge')}${d.limit}</em>` : ''}</span>
      </div>`).join('')}</div>
    <div class="fc-legend">${used.map((ch) => `<span><i style="background:${chColor(ch)}"></i>${chName(ch)}</span>`).join('')}</div>
    <div class="fc-stats">
      <div><small>${t('fc.sends')}</small><b class="mono">${s.sends}</b></div>
      <div><small>${t('fc.replies')}</small><b class="mono">${s.humanReplies}</b></div>
      <div><small>${t('fc.deferred')}</small><b class="mono">${s.deferred}</b></div>
      <div><small>${t('fc.limit')}</small><b class="mono">${s.limit}</b></div>
      <div><small>${t('fc.cascade')}</small><b class="mono">${s.cascades}</b></div>
      <div><small>${t('fc.stops')}</small><b class="mono">${s.stops}</b></div>
    </div>
  </section>`;
}
