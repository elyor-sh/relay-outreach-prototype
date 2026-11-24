/**
 * Relay App — Unified inbox. Replies from every channel land in one list,
 * sorted by a traffic light (green = hot, yellow = needs attention,
 * red = refusal / stop word). The thread shows the whole multichannel
 * history, including the moment the chain was auto-stopped.
 */

function leadLight(id, P) {
  const o = state.inboxLocal.overrides[id];
  if (o) return o;
  const L0 = P.leads[id];
  return L0 && L0.reply ? (Engine.LIGHT[L0.reply.intent] || 'yellow') : null;
}

function inboxThreads(P) {
  const out = [];
  for (const [id, L0] of Object.entries(P.leads)) {
    if (L0.reply) out.push({ id, lead: leadById(id), reply: L0.reply, light: leadLight(id, P) });
  }
  return out.sort((a, b) => b.reply.t - a.reply.t);
}

function InboxView() {
  if (!state.sim.launched) return NotLaunched('inbox');
  const P = liveProj();
  const ib = state.ui.inbox;
  const all = inboxThreads(P);
  const counts = { all: all.length, green: 0, yellow: 0, red: 0 };
  for (const th of all) counts[th.light]++;
  const q = ib.q.trim().toLowerCase();
  const list = all.filter((th) => (ib.light === 'all' || th.light === ib.light)
    && (ib.channel === 'all' || th.reply.channel === ib.channel)
    && (!q || `${th.lead.name} ${th.lead.company}`.toLowerCase().includes(q)));
  const sel = all.find((th) => th.id === ib.selected) || list[0] || null;
  const chans = ['all', ...new Set(all.map((th) => th.reply.channel))];
  return `<main class="inbox" data-testid="inbox">
    <aside class="ib-list panel">
      <div class="ib-head"><h2>${t('ib.title')}</h2><small class="muted">${t('ib.sub', { n: all.length })}</small></div>
      <div class="traffic" role="group" aria-label="${t('ib.light')}" data-testid="traffic">
        <div class="traffic-house">${['red', 'yellow', 'green'].map((l) => `<button class="${cls('lamp', `l-${l}`, ib.light === l && 'is-on', counts[l] && 'has')}" data-action="setLightFilter" data-arg="${ib.light === l ? 'all' : l}" aria-pressed="${ib.light === l}" title="${t(`light.${l}`)}" data-testid="lamp-${l}"><b class="mono">${counts[l]}</b></button>`).join('')}</div>
        <div class="traffic-legend">${['green', 'yellow', 'red'].map((l) => `<button class="${cls('tl-leg', ib.light === l && 'is-on')}" data-action="setLightFilter" data-arg="${ib.light === l ? 'all' : l}">${LightDot(l)}<span>${t(`light.${l}`)}</span><b class="mono">${counts[l]}</b></button>`).join('')}
          <button class="${cls('tl-leg', ib.light === 'all' && 'is-on')}" data-action="setLightFilter" data-arg="all"><span class="light l-all"></span><span>${t('light.all')}</span><b class="mono">${counts.all}</b></button></div>
      </div>
      <div class="ib-search">
        <label class="search">${icon('search')}<input class="inp" data-bind="ui.inbox.q" value="${esc(ib.q)}" placeholder="${t('ib.search')}"></label>
        ${Select('ui.inbox.channel', ib.channel, chans.map((c) => ({ v: c, label: c === 'all' ? t('ib.allch') : chName(c) })))}
      </div>
      <ul class="threads" data-testid="threads">${list.map((th) => ThreadItem(th, sel)).join('') || `<li class="muted ib-none">${t('ib.none')}</li>`}</ul>
    </aside>
    <section class="ib-thread panel">${sel ? Thread(sel, P) : `<div class="ib-empty">${icon('inbox')}<p>${t('ib.wait')}</p></div>`}</section>
    <aside class="ib-lead panel">${sel ? LeadCard(sel, P) : ''}</aside>
  </main>`;
}

function ThreadItem(th, sel) {
  const unread = !state.inboxLocal.read[th.id];
  return `<li data-key="th-${th.id}"><button class="${cls('th', sel && sel.id === th.id && 'is-sel', unread && 'is-unread')}" data-action="openThread" data-arg="${th.id}" data-testid="thread-${th.id}">
    ${LightDot(th.light, 'th-light')}${Avatar(th.lead)}
    <div class="th-main"><div class="th-top"><b>${esc(th.lead.name)}</b><time class="mono">${fmtDHM(th.reply.t, Engine.SENDER_TZ)}</time></div>
      <div class="th-sub">${ChBadge(th.reply.channel, 'xs')}<span>${esc(replyText(th.reply))}</span></div></div>
  </button></li>`;
}

function threadItems(id) {
  const T = state.sim.t;
  const evs = (eventsByLead()[id] || []).filter((e) => e.t <= T);
  const read = new Set(evs.filter((e) => e.type === 'open').map((e) => e.step));
  const clicked = new Set(evs.filter((e) => e.type === 'click').map((e) => e.step));
  const items = evs.filter((e) => !['open', 'rotation', 'limit'].includes(e.type))
    .map((e) => ({ t: e.t, seq: e.seq, e, read: read.has(e.step), clicked: clicked.has(e.step) }));
  state.inboxLocal.sent.forEach((m, i) => { if (m.lead === id) items.push({ t: m.t, seq: 1e9 + i, manual: m }); });
  return items.sort((a, b) => a.t - b.t || a.seq - b.seq);
}

function Thread(th, P) {
  const lead = th.lead;
  const stop = P.leads[th.id].stop;
  return `<header class="thread-head">${Avatar(lead)}<div><b>${esc(lead.name)}</b><small>${esc(lead.role)} · ${esc(lead.company)}</small></div><span class="grow"></span>
      ${stop ? `<span class="stop-pill" data-testid="stop-pill">${icon('stop')} ${t('th.stopped', { ch: chName(stop.channel || th.reply.channel), n: stop.cancelled })}</span>` : ''}</header>
    <div class="thread-body" data-testid="thread" data-thread="${th.id}">${threadItems(th.id).map((it) => ThreadMsg(it, lead)).join('')}</div>
    ${Composer(th)}`;
}

function sysLine(ic, html, tone = '') {
  return `<div class="${cls('sys', tone)}">${icon(ic)}<span>${html}</span></div>`;
}

function ThreadMsg(it, lead) {
  const name = esc(shortName(lead));
  if (it.manual) {
    const m = it.manual;
    return `<div class="msg out you" data-key="m-${it.seq}"><div class="msg-meta">${ChBadge(m.channel, 'xs')}<span>${t('th.you')}</span><time class="mono">${fmtDHM(m.t, Engine.SENDER_TZ)}</time></div><div class="msg-body">${esc(m.text).replace(/\n/g, '<br>')}</div><div class="msg-foot">✓ ${t('th.delivered')}</div></div>`;
  }
  const e = it.e;
  const time = `<time class="mono">${fmtDHM(e.t, Engine.SENDER_TZ)}</time>`;
  const key = `data-key="m-${e.seq}"`;
  switch (e.type) {
    case 'send': {
      const step = snapStep(e.step);
      const text = e.kind === 'call_followup' ? t('th.callSms') : (step ? step.text : '');
      const body = richPreview(text, lead, { stripLinks: e.linkStripped });
      const subj = e.channel === 'email' && step && step.subject ? `<div class="msg-subj">${richPreview(step.subject, lead)}</div>` : '';
      const media = e.media ? `<div class="msg-media">${icon(e.media === 'circle' ? 'video' : 'mic')} ${t(`th.media.${e.media}`)}</div>` : '';
      return `<div class="msg out" ${key} style="--c:${chColor(e.channel)}">
        <div class="msg-meta">${ChBadge(e.channel, 'xs')}<span>${whatSent(e)}</span><small class="mono">${esc(e.via || '')}</small>${time}</div>
        <div class="msg-body">${subj}${body}</div>${media}
        <div class="msg-foot">${it.read ? `<b class="read">✓✓ ${t('th.read')}</b>` : `✓ ${t('th.delivered')}`}${it.clicked ? ` · ${icon('click')} ${t('th.clicked')}` : ''}${e.typing ? ` · ${icon('keyboard')} ${t('th.typing', { s: e.typing })}` : ''}</div>
      </div>`;
    }
    case 'reply': {
      const isCall = e.channel === 'call';
      return `<div class="${cls('msg in', `l-${Engine.LIGHT[e.intent]}`)}" ${key}>
        <div class="msg-meta">${ChBadge(e.channel, 'xs')}<b>${name}</b><span class="ai-chip">${icon('sparkles')} ${L(Data.INSIGHT[e.intent].label)}</span>${time}</div>
        <div class="msg-body">${isCall ? `${icon('headset')} ` : ''}${esc(replyText(e))}</div>
      </div>`;
    }
    case 'auto_reply':
      return `<div class="msg in auto" ${key}><div class="msg-meta">${ChBadge('email', 'xs')}<b>${name}</b><span class="ai-chip">${icon('bot')} ${t('th.auto')}</span>${time}</div><div class="msg-body">${t('th.ooo')}</div></div>`;
    case 'auto_stop':
      return `<div class="stop-divider" ${key}>${icon('stop')}<span>${e.cancelled ? t('th.stopDivider', { n: e.cancelled }) : t('th.stopDivider0')}</span></div>`;
    case 'call':
      return `<div class="call-card" ${key}>${ChBadge('call', 'sm')}<div><b>${t('th.call', { num: esc(e.via) })}</b><small>${e.localNumber ? t('th.call.local') : ''} ${t('th.attempt', { n: e.attempt })}</small></div>${time}</div>`;
    case 'call_talk':
      return sysLine(e.who === 'ai' ? 'bot' : 'headset', t('th.talk', { m: e.minutes, who: e.who === 'ai' ? t('th.who.ai', { v: esc(L(Data.VOICES[e.voice]?.name || ['', ''])) }) : t('th.who.mgr') }), 'call');
    case 'transfer':
      return sysLine('transfer', t('feed.transfer', { name, m: esc(L(Data.MANAGERS[e.manager]?.name || ['', ''])) }), 'good');
    case 'meeting':
      return sysLine('calendar', t('feed.meeting', { name }), 'good');
    case 'amd':
      return sysLine('voicemail', `${t('feed.amd', { name })} — ${t(`feed.amd.${e.action}`)}`);
    case 'machine':
      return sysLine('voicemail', t('feed.machine.sub', { s: e.seconds }), 'bad');
    case 'no_answer':
      return sysLine('phone-off', t('th.noAnswer'));
    case 'deferred':
      return sysLine(e.reason === 'weekend' ? 'calendar' : 'moon', t(e.reason === 'weekend' ? 'th.weekend' : 'th.night', { local: `${pad2(Math.floor(e.local / 60))}:${pad2(e.local % 60)}`, until: fmtDHM(e.until, lead.tz) }));
    case 'cascade':
      return sysLine('shuffle', t('th.cascade', { tried: e.tried.map(chName).join(', '), ch: chName(e.channel) }));
    case 'link_stripped':
      return sysLine('link-off', t('feed.link.sub'));
    case 'like':
      return sysLine('heart', t('th.like'));
    case 'accepted':
      return sysLine('user-plus', t('th.accepted', { name, a: gA(lead) }), 'good');
    case 'click':
      return sysLine('click', t('feed.click', { name, a: gA(lead) }), 'good');
    case 'skip':
      return sysLine('git', t('th.skip', { n: snapSteps().findIndex((s) => s.id === e.step) + 1, why: t(`skip.${e.reason}`) }));
    case 'bounce':
      return sysLine('alert', `${t('feed.bounce', { name })} — ${t('feed.bounce.sub')}`, 'bad');
    case 'unsubscribe':
      return sysLine('ban', t('feed.unsub.sub'), 'bad');
    case 'no_channel':
      return sysLine('phone-off', t('feed.nochannel.sub'));
    default:
      return '';
  }
}

function replyChannels(lead) {
  return ['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'sms'].filter((c) => (c === 'sms' ? lead.has.phone : lead.has[c]));
}

function Composer(th) {
  const ib = state.ui.inbox;
  const opts = replyChannels(th.lead);
  const ch = opts.includes(ib.draftChannel) ? ib.draftChannel : opts.includes(th.reply.channel) ? th.reply.channel : opts[0] || 'email';
  return `<footer class="composer">
    <div class="comp-top"><span class="muted">${t('comp.via')}</span>${opts.map((c) => `<button class="${cls('comp-ch', c === ch && 'is-on')}" style="--c:${chColor(c)}" data-action="setVal" data-arg="ui.inbox.draftChannel|${c}" title="${chName(c)}" aria-pressed="${c === ch}">${chIcon(c)}</button>`).join('')}
      <span class="grow"></span><button class="btn btn-ai sm" data-action="aiDraft" data-arg="${th.id}" data-testid="ai-draft">${icon('sparkles')} ${t('comp.ai')}</button></div>
    <div class="comp-row"><textarea class="inp" rows="2" data-bind="ui.inbox.draft" placeholder="${t('comp.ph', { ch: chName(ch) })}" data-testid="composer">${esc(ib.draft)}</textarea>
      <button class="btn btn-primary" data-action="sendReply" data-arg="${th.id}" ${ib.draft.trim() ? '' : 'disabled'} data-testid="send">${icon('send')} ${t('comp.send')}</button></div>
  </footer>`;
}

function chainStatus(id) {
  const T = state.sim.t;
  const evs = (eventsByLead()[id] || []).filter((e) => e.t <= T);
  const stopped = evs.some((e) => e.type === 'auto_stop');
  return snapSteps().map((s, i) => {
    const sent = evs.some((e) => e.step === s.id && (e.type === 'send' || e.type === 'call') && e.kind !== 'call_followup');
    const skipped = evs.some((e) => e.step === s.id && (e.type === 'skip' || e.type === 'no_channel'));
    const status = sent ? 'sent' : skipped ? 'skipped' : stopped ? 'cancelled' : 'pending';
    return { n: i + 1, channel: s.channel, title: stepTitlePro(s), status };
  });
}

function LeadCard(th) {
  const lead = th.lead;
  const T = state.sim.t;
  const p = clockParts(T, lead.tz);
  const awake = p.hh >= 7 && p.hh < 21;
  const ins = Data.INSIGHT[th.reply.intent] || Data.INSIGHT.question;
  const conf = 78 + (Data.hash(th.id) % 20);
  const booked = !!state.inboxLocal.meetings[th.id];
  return `<div class="lc-top">${Avatar(lead, 'xl')}<b>${esc(lead.name)}</b><small>${esc(lead.role)} · ${esc(lead.company)}</small>
      <div class="lc-geo">${icon('map-pin')} ${esc(cityName(lead.city))} · <span class="mono">${tzLabel(lead.tz)}</span> · ${icon(awake ? 'sun' : 'moon')} <b class="mono">${pad2(p.hh)}:${pad2(p.mm)}</b></div>
      <div class="lc-chs">${['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'phone'].map((c) => `<span class="${cls('lc-ch', !lead.has[c] && 'off')}" style="--c:${chColor(c)}" title="${chName(c)}${lead.has[c] ? '' : ` — ${t('lc.none')}`}">${chIcon(c)}</span>`).join('')}</div>
    </div>
    <div class="lc-sec"><h6>${t('lc.light')}</h6>
      <div class="traffic-set">${['green', 'yellow', 'red'].map((l) => `<button class="${cls('tl-btn', `l-${l}`, th.light === l && 'is-on')}" data-action="setLeadLight" data-arg="${th.id}:${l}" aria-pressed="${th.light === l}">${LightDot(l)}${t(`light.${l}`)}</button>`).join('')}</div></div>
    <div class="lc-sec ai"><h6>${icon('sparkles')} ${t('lc.ai')}</h6><b class="ai-label">${L(ins.label)}</b>
      <div class="conf"><span><i style="width:${conf}%"></i></span><small class="mono">${t('lc.conf', { p: conf })}</small></div><p>${L(ins.summary)}</p></div>
    <div class="lc-sec"><h6>${t('lc.chain')}</h6><ol class="chain">${chainStatus(th.id).map((c) => `<li class="${cls('cs-item', `cs-${c.status}`)}">${ChBadge(c.channel, 'xs')}<span>#${c.n} ${c.title}</span><em>${t(`chain.${c.status}`)}</em></li>`).join('')}</ol></div>
    <div class="lc-actions">
      <button class="btn btn-primary" data-action="bookMeeting" data-arg="${th.id}" ${booked ? 'disabled' : ''}>${icon('calendar')} ${booked ? t('lc.booked') : t('lc.book')}</button>
      <button class="btn btn-ghost" data-action="handoff" data-arg="${th.id}">${icon('headset')} ${t('lc.handoff')}</button>
      <button class="btn btn-ghost danger" data-action="blockLead" data-arg="${th.id}">${icon('ban')} ${t('lc.block')}</button>
    </div>`;
}
