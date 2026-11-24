/**
 * Relay App — Live monitor. The precomputed timeline is "played back" with
 * a virtual clock; every protection that fires is surfaced as a human story
 * (Simple) or as a technical log and resource meters (PRO).
 */

const SPEEDS = [{ v: 60, h: 1 }, { v: 240, h: 4 }, { v: 720, h: 12 }];
const snapSteps = () => [...(state.sim.snapshot ? state.sim.snapshot.steps : [])].sort((a, b) => a.day - b.day);
const snapStep = (id) => (state.sim.snapshot ? state.sim.snapshot.steps.find((s) => s.id === id) : null);
const shortName = (lead) => (lead ? `${lead.firstName}${lead.lastName ? ` ${lead.lastName[0]}.` : ''}` : '?');
const gA = (lead) => (lead && lead.gender === 'f' ? t('g.f') : '');

function namesList(ids) {
  const uniq = [...new Set(ids)].map((id) => esc(shortName(leadById(id))));
  return uniq.length <= 2 ? uniq.join(', ') : t('names.more', { a: uniq.slice(0, 2).join(', '), n: uniq.length - 2 });
}

function LiveView() {
  if (!state.sim.launched) return NotLaunched('live');
  const r = liveResult();
  const P = liveProj();
  const pro = state.ui.mode === 'pro';
  return `<main class="${cls('live', pro ? 'live-pro' : 'live-simple')}" data-testid="live">
    ${LiveBar(r)}
    ${pro ? LivePro(r, P) : LiveSimple(P)}
  </main>`;
}

function LiveBar(r) {
  const s = state.sim;
  const T = s.t;
  const done = T >= r.endT;
  const prog = clamp((T - r.startT) / (r.endT - r.startT), 0, 1);
  const status = done ? 'done' : s.playing ? 'on' : 'paused';
  return `<section class="live-bar">
    <div class="${cls('live-status', `st-${status}`)}"><span class="pulse"></span>${t(`live.${status}`)}</div>
    <div class="clock"><b class="mono" data-testid="clock">${fmtDHM(T, Engine.SENDER_TZ)}</b><small>${t('live.yourtime')} · ${t('live.dayof', { d: clamp(campaignDay(T), 1, r.days), n: r.days })}</small></div>
    <div class="scrub" style="--p:${prog * 100}%">
      <input type="range" min="${r.startT}" max="${r.endT}" step="5" value="${Math.round(T)}" data-bind="sim.t" data-num aria-label="${t('live.timeline')}" data-testid="scrub">
      <div class="scrub-days" aria-hidden="true">${Array.from({ length: r.days }, (_, i) => `<span class="${isWeekendDay(i + 1) ? 'we' : ''}">${t(`dow.${dow(i + 1)}`)}</span>`).join('')}</div>
    </div>
    <div class="live-ctrls">
      <button class="icon-btn lg primary" data-action="togglePlay" aria-label="${s.playing ? t('live.pause') : t('live.play')}" data-testid="play">${icon(s.playing ? 'pause' : 'play')}</button>
      ${Seg('sim.speed', s.speed, SPEEDS.map((x) => ({ v: x.v, label: t('live.speed', { h: x.h }) })), 'sm')}
      <button class="icon-btn" data-action="skipEnd" title="${t('live.skip')}" aria-label="${t('live.skip')}" data-testid="skip">${icon('skip')}</button>
      <button class="icon-btn" data-action="restartSim" title="${t('live.restart')}" aria-label="${t('live.restart')}">${icon('rotate')}</button>
    </div>
  </section>`;
}

function Kpi(ic, label, v, of, tone) {
  const p = of ? Math.round((v / of) * 100) : 0;
  return `<div class="${cls('kpi', `kpi-${tone}`)}">
    <span class="kpi-ic">${icon(ic)}</span>
    <div class="kpi-txt"><small>${label}</small><b class="mono">${v}</b><em>${of ? t('kpi.of', { p, n: of }) : '&nbsp;'}</em></div>
    <span class="kpi-ring" style="--p:${p}" aria-hidden="true"></span>
  </div>`;
}

function LiveSimple(P) {
  const m = P.metrics;
  const n = state.sim.snapshot.leads.length;
  return `<section class="kpis">
      ${Kpi('send', t('kpi.contacted'), m.contacted, n, 'indigo')}
      ${Kpi('eye', t('kpi.read'), m.opened, m.contacted, 'sky')}
      ${Kpi('reply', t('kpi.replied'), m.replied, m.contacted, 'green')}
      ${Kpi('calendar', t('kpi.hot'), m.green, m.replied, 'pink')}
    </section>
    <section class="live-grid">
      <div class="panel feed-panel">
        <header class="panel-head"><span class="ph-ic">${icon('activity')}</span><div class="ph-text"><b>${t('feed.title')}</b><small>${t('feed.sub')}</small></div></header>
        <ul class="feed" data-testid="feed">${feedItems(P, 12).map(FeedItem).join('') || `<li class="feed-empty">${t('feed.empty')}</li>`}</ul>
      </div>
      <div class="side-col">${GuardPanel(m)}${InboxTeaser(P)}</div>
    </section>
    <section class="panel track-panel">
      <header class="panel-head"><span class="ph-ic">${icon('route')}</span><div class="ph-text"><b>${t('live.track')}</b><small>${t('live.track.sub')}</small></div></header>
      ${Track({ live: true, proj: P, list: snapSteps(), rules: state.sim.snapshot.rules })}
    </section>`;
}

function GuardPanel(m) {
  const rows = [
    ['moon', t('guard.night'), m.night + m.weekend, t('guard.night.sub')],
    ['stop', t('guard.stopped'), m.stops, t('guard.stopped.sub', { n: m.cancelled })],
    ['shuffle', t('guard.cascade'), m.cascades, t('guard.cascade.sub')],
    ['gauge', t('guard.limits'), m.limit, t('guard.limits.sub')],
    ['link-off', t('guard.links'), m.stripped, t('guard.links.sub')],
  ];
  return `<div class="panel guard" data-testid="guard">
    <header class="panel-head"><span class="ph-ic">${icon('shield')}</span><div class="ph-text"><b>${t('guard.title')}</b><small>${t('guard.sub')}</small></div></header>
    <ul class="guard-list">${rows.map(([ic, label, n, sub]) => `<li class="${n ? 'is-hit' : ''}"><span class="g-ic">${icon(ic)}</span><div><b>${label}</b><small>${sub}</small></div><em class="mono">${n}</em></li>`).join('')}</ul>
  </div>`;
}

function InboxTeaser(P) {
  const th = inboxThreads(P).slice(0, 3);
  return `<div class="panel teaser">
    <header class="panel-head"><span class="ph-ic">${icon('inbox')}</span><div class="ph-text"><b>${t('teaser.title')}</b><small>${t('teaser.sub')}</small></div></header>
    ${th.length ? `<ul class="teaser-list">${th.map((x) => `<li data-key="tz-${x.id}"><button data-action="openThread" data-arg="${x.id}" data-go="1">${LightDot(x.light)}${Avatar(x.lead)}<div><b>${esc(x.lead.name)}</b><small>${esc(replyText(x.reply).slice(0, 70))}</small></div>${ChBadge(x.reply.channel, 'xs')}</button></li>`).join('')}</ul>` : `<p class="muted teaser-empty">${t('teaser.empty')}</p>`}
    <button class="btn btn-soft wide" data-action="nav" data-arg="inbox">${icon('inbox')} ${t('teaser.open')}</button>
  </div>`;
}

/* ------------------------------ feed ------------------------------ */

const FEED_TYPES = new Set(['send', 'call', 'deferred', 'cascade', 'limit', 'reply', 'auto_stop', 'link_stripped', 'accepted', 'bounce', 'auto_reply', 'amd', 'machine', 'transfer', 'meeting', 'unsubscribe', 'rotation', 'open', 'click', 'like', 'no_channel', 'call_talk']);
const FEED_GROUPABLE = new Set(['send', 'deferred', 'limit', 'open', 'like', 'accepted', 'cascade', 'link_stripped']);

/** Newest-first feed; bursts of similar events collapse into one story («12 писем → Анна, Lukas и ещё 10»). */
function feedItems(P, limit) {
  const evs = liveResult().events;
  const items = [];
  for (let i = P.n - 1; i >= 0 && items.length < limit; i--) {
    const e = evs[i];
    if (!FEED_TYPES.has(e.type)) continue;
    const key = `${e.type}|${e.channel}|${e.reason || ''}|${e.step || ''}`;
    const hit = FEED_GROUPABLE.has(e.type) && items.slice(-4).find((x) => x.key === key && x.t0 - e.t < 240);
    if (hit) { hit.leads.push(e.lead); hit.t0 = e.t; continue; }
    items.push({ key, e, t: e.t, t0: e.t, leads: [e.lead] });
  }
  return items;
}

function FeedItem(it) {
  const f = feedText(it);
  return `<li class="${cls('fi', f.tone && `fi-${f.tone}`)}" data-key="f-${it.e.seq}">
    <span class="fi-ic" style="--c:${f.color || chColor(it.e.channel || 'messenger')}">${f.ic}</span>
    <div class="fi-main"><b>${f.title}</b>${f.sub ? `<small>${f.sub}</small>` : ''}</div>
    <time class="mono">${fmtHM(it.t, Engine.SENDER_TZ)}</time>
  </li>`;
}

function whatSent(e) {
  if (e.channel === 'linkedin') return e.kind === 'message' ? t('what.li_message') : t('what.li_invite');
  return t(`what.${e.channel}`);
}

function feedText(it) {
  const e = it.e;
  const lead = leadById(e.lead);
  const names = namesList(it.leads);
  const name = esc(shortName(lead));
  const n = new Set(it.leads).size;
  const R = '#EF4444';
  const G = '#22C55E';
  switch (e.type) {
    case 'send':
      return { ic: chIcon(e.channel), title: `${whatSent(e)} → ${names}`, sub: n === 1 ? t('feed.send.local', { time: fmtHM(e.t, lead.tz) }) : t('feed.send.many', { n }) };
    case 'call':
      return { ic: chIcon('call'), title: t('feed.call', { name }), sub: e.localNumber ? t('feed.call.local', { num: esc(e.via) }) : esc(e.via) };
    case 'deferred':
      return e.reason === 'weekend'
        ? { ic: icon('calendar'), color: '#8B5CF6', title: t('feed.weekend', { names }), sub: t('feed.weekend.sub') }
        : { ic: icon('moon'), color: '#6366F1', title: t('feed.night', { names }), sub: t('feed.night.sub', { time: fmtHM(e.until, lead.tz) }) };
    case 'limit':
      return { ic: icon('gauge'), color: '#F59E0B', title: t('feed.limit', { what: whatSent({ channel: e.channel, kind: snapStep(e.step)?.kind }) }), sub: t('feed.limit.sub', { n }) };
    case 'cascade':
      return { ic: icon('shuffle'), color: chColor(e.channel), title: t('feed.cascade', { tried: e.tried.map(chName).join(', '), names, ch: chName(e.channel) }), sub: t('feed.cascade.sub') };
    case 'link_stripped':
      return { ic: icon('link-off'), color: '#F59E0B', title: t('feed.link', { names }), sub: t('feed.link.sub') };
    case 'reply':
      return { ic: icon('reply'), tone: Engine.LIGHT[e.intent], color: { green: G, yellow: '#F59E0B', red: R }[Engine.LIGHT[e.intent]], title: t('feed.reply', { name, a: gA(lead), ch: chName(e.channel) }), sub: `«${esc(replyText(e).slice(0, 90))}»` };
    case 'auto_stop':
      return { ic: icon('stop'), color: R, tone: 'stop', title: t('feed.stop', { name }), sub: e.cancelled ? t('feed.stop.sub', { n: e.cancelled }) : t('feed.stop.sub0') };
    case 'open':
      return { ic: icon('eye'), color: '#38BDF8', title: t('feed.open', { names }), sub: whatSent({ channel: e.channel, kind: snapStep(e.step)?.kind }) };
    case 'click':
      return { ic: icon('click'), color: '#F59E0B', title: t('feed.click', { name, a: gA(lead) }), sub: t('feed.click.sub') };
    case 'like':
      return { ic: icon('heart'), color: chColor('linkedin'), title: t('feed.like', { names }), sub: t('feed.like.sub') };
    case 'accepted':
      return { ic: icon('user-plus'), color: chColor('linkedin'), title: t('feed.accepted', { names }), sub: t('feed.accepted.sub') };
    case 'bounce':
      return { ic: icon('alert'), color: R, title: t('feed.bounce', { name }), sub: t('feed.bounce.sub') };
    case 'auto_reply':
      return { ic: icon('bot'), color: '#94A3B8', title: t('feed.ooo', { name }), sub: t('feed.ooo.sub') };
    case 'amd':
      return { ic: icon('voicemail'), color: chColor('call'), title: t('feed.amd', { name }), sub: t(`feed.amd.${e.action}`) };
    case 'machine':
      return { ic: icon('voicemail'), color: R, title: t('feed.machine', { name }), sub: t('feed.machine.sub', { s: e.seconds }) };
    case 'call_talk':
      return { ic: icon(e.who === 'ai' ? 'bot' : 'headset'), color: chColor('call'), title: e.who === 'ai' ? t('feed.talk.ai', { name }) : t('feed.talk.mgr', { name }), sub: t('feed.talk.sub', { m: e.minutes, voice: esc(L(Data.VOICES[e.voice]?.name || ['', ''])) }) };
    case 'transfer':
      return { ic: icon('transfer'), color: G, tone: 'green', title: t('feed.transfer', { name, m: esc(L(Data.MANAGERS[e.manager]?.name || ['', ''])) }), sub: t('feed.transfer.sub') };
    case 'meeting':
      return { ic: icon('calendar'), color: G, tone: 'green', title: t('feed.meeting', { name }), sub: t('feed.meeting.sub') };
    case 'unsubscribe':
      return { ic: icon('ban'), color: R, title: t('feed.unsub', { name, a: gA(lead) }), sub: t('feed.unsub.sub', { w: esc(e.word || '') }) };
    case 'rotation':
      return { ic: icon('inbox'), color: chColor('email'), title: t('feed.rotation', { from: esc(e.from) }), sub: t('feed.rotation.sub', { to: esc(e.to) }) };
    case 'no_channel':
      return { ic: icon('phone-off'), color: '#94A3B8', title: t('feed.nochannel', { name }), sub: t('feed.nochannel.sub') };
    default:
      return { ic: icon('dots'), title: esc(e.type) };
  }
}

/** Text of an inbound reply (or the AI summary of a call). */
function replyText(e) {
  if (e.channel === 'call') {
    const k = e.intent === 'interested' ? 'interested' : e.intent === 'negative' || e.intent === 'stop' ? 'negative' : 'later';
    return L(Data.CALL_SUMMARY[k]);
  }
  const pool = Data.REPLIES[e.intent] || Data.REPLIES.question;
  return L(pool[(e.variant || 0) % pool.length]);
}

/* ------------------------------ PRO live ------------------------------ */

function LivePro(r, P) {
  const m = P.metrics;
  const n = state.sim.snapshot.leads.length;
  const tab = state.ui.liveTab;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const kp = [
    [t('kpi.p.sends'), m.sends], [t('kpi.contacted'), `${m.contacted}/${n}`], [t('kpi.p.open'), pct(m.opened, m.contacted)],
    [t('kpi.p.click'), pct(m.clicked, m.contacted)], [t('kpi.p.reply'), pct(m.replied, m.contacted)], [t('kpi.p.pos'), m.green],
    [t('kpi.p.meet'), m.meetings], [t('kpi.p.guard'), m.night + m.weekend + m.stops + m.cascades + m.limit + m.stripped + m.amd],
  ];
  const tabs = { leads: 'users', log: 'activity', resources: 'server' };
  return `<section class="kpi-strip">${kp.map(([l, v]) => `<div><small>${l}</small><b class="mono">${v}</b></div>`).join('')}</section>
    <section class="panel live-tabs">
      <nav class="subtabs" role="tablist">${Object.entries(tabs).map(([x, ic]) => `<button role="tab" aria-selected="${tab === x}" class="${cls(tab === x && 'is-on')}" data-action="liveTab" data-arg="${x}" data-testid="live-${x}">${icon(ic)} ${t(`live.tab.${x}`)}</button>`).join('')}</nav>
      ${tab === 'leads' ? LeadsTable(P) : tab === 'log' ? EventLog(P, r) : Resources(P, r)}
    </section>`;
}

const LIGHT_RANK = { green: 0, yellow: 1, red: 2 };

function leadStatus(lead, P) {
  const T = state.sim.t;
  const evs = eventsByLead()[lead.id] || [];
  const L0 = P.leads[lead.id];
  const next = evs.find((e) => e.t > T && (e.type === 'send' || e.type === 'call'));
  const sentSteps = new Set(evs.filter((e) => e.t <= T && (e.type === 'send' || e.type === 'call')).map((e) => e.step)).size;
  const total = state.sim.snapshot.steps.length;
  let text;
  if (L0 && L0.reply) text = t('st.replied', { ch: chName(L0.reply.channel) });
  else if (L0 && L0.stop) text = t('st.stopped');
  else if (L0 && L0.last && L0.last.type === 'deferred' && next) text = t(L0.last.reason === 'weekend' ? 'st.weekend' : 'st.night');
  else if (L0 && L0.touches) text = next ? t('st.inSeq', { k: sentSteps, n: total }) : t('st.done');
  else text = next ? t('st.queued') : t('st.done');
  return { text, next, sentSteps };
}

function LeadsTable(P) {
  const T = state.sim.t;
  const leads = [...state.sim.snapshot.leads].map((l) => ({ l, light: leadLight(l.id, P), L: P.leads[l.id] }))
    .sort((a, b) => (LIGHT_RANK[a.light] ?? 3) - (LIGHT_RANK[b.light] ?? 3) || ((b.L ? b.L.touches : 0) - (a.L ? a.L.touches : 0)));
  return `<div class="tbl-wrap"><table class="tbl leads-tbl" data-testid="leads-table">
    <thead><tr><th></th><th>${t('lt.lead')}</th><th>${t('lt.local')}</th><th>${t('lt.status')}</th><th>${t('lt.channels')}</th><th>${t('lt.touches')}</th><th>${t('lt.next')}</th></tr></thead>
    <tbody>${leads.map(({ l, light, L: L0 }) => {
    const st = leadStatus(l, P);
    const p = clockParts(T, l.tz);
    const awake = Engine.inWindow(T, l.tz, state.sim.snapshot.rules);
    return `<tr data-key="lr-${l.id}" class="${cls(light && 'is-replied')}" data-action="focusLead" data-arg="${l.id}" tabindex="0" aria-label="${esc(l.name)}">
        <td>${LightDot(light)}</td>
        <td><div class="lt-lead">${Avatar(l, 'sm')}<div><b>${esc(l.name)}</b><small>${esc(l.company)}</small></div></div></td>
        <td class="mono"><span class="${cls('lt-time', awake ? 'day' : 'night')}">${icon(awake ? 'sun' : 'moon')} ${pad2(p.hh)}:${pad2(p.mm)}</span> <small>${esc(cityName(l.city))}</small></td>
        <td>${st.text}</td>
        <td><span class="lt-chs">${(L0 ? L0.channels : []).map((c) => ChBadge(c, 'xs')).join('')}</span></td>
        <td class="mono">${L0 ? L0.touches : 0}</td>
        <td class="mono">${st.next && !(L0 && L0.stop) ? `${ChBadge(st.next.channel, 'xs')} ${fmtDHM(st.next.t, l.tz)}` : '—'}</td>
      </tr>`;
  }).join('')}</tbody></table></div>`;
}

const LOG_FILTERS = {
  all: null,
  sends: ['send', 'call', 'like'],
  guard: ['deferred', 'limit', 'cascade', 'link_stripped', 'rotation', 'auto_stop', 'amd', 'bounce', 'auto_reply', 'unsubscribe', 'machine'],
  branch: ['skip', 'open', 'click', 'accepted', 'no_channel'],
  replies: ['reply', 'meeting', 'transfer', 'call_talk'],
};

function logDetail(e, lead) {
  const hm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  const step = snapStep(e.step);
  const sn = step ? `#${snapSteps().findIndex((s) => s.id === step.id) + 1}` : '';
  switch (e.type) {
    case 'send': return `${sn} ${chName(e.channel)} · via ${esc(e.via)} · ${t('log.local')} ${hm(e.local)}${e.typing ? ` · typing ${e.typing}s` : ''}${e.media ? ` · +${e.media}` : ''}${e.linkStripped ? ' · link✂' : ''}${e.kind === 'call_followup' ? ' · amd→sms' : ''}`;
    case 'call': return `${sn} caller-id ${esc(e.via)}${e.localNumber ? ' (local)' : ''} · attempt ${e.attempt}`;
    case 'deferred': return `${sn} ${e.reason} @ ${hm(e.local)} → ${fmtDHM(e.until, lead.tz)} ${t('log.local')}`;
    case 'limit': return `${sn} ${chName(e.channel)} cap → ${fmtDHM(e.until, lead.tz)}`;
    case 'cascade': return `${sn} ${e.tried.map(chName).join(' ✕ ')} ✕ → ${chName(e.channel)} ✓`;
    case 'skip': return `${sn} ${t(`skip.${e.reason}`)}`;
    case 'reply': return `${chName(e.channel)} · intent=${e.intent}`;
    case 'auto_stop': return `reason=${e.reason} · cancelled=${e.cancelled}`;
    case 'rotation': return `${esc(e.from)} full → ${esc(e.to)}`;
    case 'amd': return `machine detected → ${e.action}`;
    case 'machine': return `no AMD → ${e.seconds}s wasted`;
    case 'call_talk': return `${e.who} · ${e.minutes} min`;
    case 'transfer': return `→ ${esc(L(Data.MANAGERS[e.manager]?.name || ['', '']))}`;
    case 'open': case 'click': case 'accepted': case 'like': case 'link_stripped': return `${sn} ${chName(e.channel)}`;
    default: return `${sn} ${e.channel ? chName(e.channel) : ''}`;
  }
}

function EventLog(P, r) {
  const f = state.ui.logFilter;
  const allow = LOG_FILTERS[f];
  const rows = [];
  for (let i = P.n - 1; i >= 0 && rows.length < 160; i--) {
    const e = r.events[i];
    if (allow && !allow.includes(e.type)) continue;
    rows.push(e);
  }
  return `<div class="log-filters">${Object.keys(LOG_FILTERS).map((k) => `<button class="${cls('chip', f === k && 'is-on')}" data-action="logFilter" data-arg="${k}">${t(`log.f.${k}`)}</button>`).join('')}<span class="grow"></span><small class="muted mono">${t('log.count', { n: P.n, total: r.events.length })}</small></div>
    <ol class="log" data-testid="log">${rows.map((e) => {
    const lead = leadById(e.lead);
    return `<li data-key="lg-${e.seq}" class="lg-${e.type}"><time class="mono">${fmtDHM(e.t, Engine.SENDER_TZ)}</time><span class="lg-lead">${esc(lead ? lead.id : '')} ${esc(shortName(lead))}</span><code class="lg-type">${e.type}</code><span class="lg-detail mono">${logDetail(e, lead || { tz: 0 })}</span></li>`;
  }).join('')}</ol>`;
}

function Resources(P, r) {
  const T = state.sim.t;
  const day = Math.floor(T / Engine.DAY);
  const startDay = Math.floor(r.startT / Engine.DAY);
  const C = state.sim.snapshot.channels;
  const count = {};
  for (let i = 0; i < P.n; i++) {
    const e = r.events[i];
    if ((e.type !== 'send' && e.type !== 'call') || Math.floor(e.t / Engine.DAY) !== day) continue;
    const k = `${e.channel}|${e.channel === 'sms' || e.channel === 'call' ? '*' : e.via}`;
    count[k] = (count[k] || 0) + 1;
  }
  const row = (label, used, cap, ch, off) => `<div class="${cls('res-row', off && 'is-off')}">${ChBadge(ch, 'xs')}<span class="mono">${esc(label)}</span>${UsageBar(used, cap)}<b class="mono">${used}/${cap}</b></div>`;
  const groups = [
    [t('ch.email'), C.email.mailboxes.map((m) => row(m.address, count[`email|${m.address}`] || 0, Engine.emailCap(m, day - startDay, C.email), 'email', !m.enabled))],
    [t('ch.linkedin'), [row(t('res.invites'), count['linkedin|invite'] || 0, C.linkedin.inviteLimit, 'linkedin'), row(t('res.messages'), count['linkedin|message'] || 0, C.linkedin.messageLimit, 'linkedin')]],
    ...MESSENGERS.map((m) => [chName(m), C[m].numbers.map((x) => row(x.label, count[`${m}|${x.label}`] || 0, C[m].dailyPerNumber, m))]),
    [t('ch.sms'), [row(C.sms.senderId, count['sms|*'] || 0, C.sms.dailyLimit, 'sms')]],
    [t('ch.call'), [row(t('res.lines'), count['call|*'] || 0, C.call.dailyLimit, 'call')]],
  ];
  return `<p class="res-note muted">${icon('info')} ${t('res.note', { d: fmtDHM(T, Engine.SENDER_TZ) })}</p>
    <div class="res-grid">${groups.map(([title, rows]) => `<div class="res-card"><h5>${title}</h5>${rows.join('')}</div>`).join('')}</div>`;
}
