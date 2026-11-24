/**
 * Relay App — shared view components (header, form controls, overlays).
 * Views are plain functions returning HTML strings. Every dynamic value is
 * escaped with esc(); strings returned by t() are already safe.
 */

function Header() {
  const { ui } = state;
  const P = state.sim.launched ? liveProj() : null;
  const unread = P ? inboxThreads(P).filter((th) => !state.inboxLocal.read[th.id]).length : 0;
  const tabs = [
    { id: 'builder', ic: 'layout', label: t('nav.builder') },
    { id: 'live', ic: 'radio', label: t('nav.live'), dot: state.sim.launched && state.sim.playing },
    { id: 'inbox', ic: 'inbox', label: t('nav.inbox'), badge: unread },
  ];
  return `<header class="topbar">
    <div class="brand">${logoMark()}<div class="brand-text"><b>Relay</b><small>${t('brand.tag')}</small></div></div>
    <nav class="tabs" aria-label="${t('nav.aria')}">
      ${tabs.map((x) => `<button class="${cls('tab', ui.view === x.id && 'is-active')}" data-action="nav" data-arg="${x.id}" data-testid="tab-${x.id}" ${ui.view === x.id ? 'aria-current="page"' : ''}>
        ${icon(x.ic)}<span>${x.label}</span>${x.dot ? '<i class="live-dot" aria-hidden="true"></i>' : ''}${x.badge ? `<b class="badge" data-testid="inbox-badge">${x.badge}</b>` : ''}</button>`).join('')}
    </nav>
    <div class="topbar-right">
      <div class="mode-switch" role="radiogroup" aria-label="${t('mode.aria')}" data-mode="${ui.mode}">
        <span class="mode-thumb" aria-hidden="true"></span>
        <button role="radio" aria-checked="${ui.mode === 'simple'}" data-action="setMode" data-arg="simple" data-testid="mode-simple">${icon('sun')}<span>${t('mode.simple')}</span></button>
        <button role="radio" aria-checked="${ui.mode === 'pro'}" data-action="setMode" data-arg="pro" data-testid="mode-pro">${icon('sliders')}<span>PRO</span></button>
      </div>
      <button class="chip-btn" data-action="toggleLang" title="${t('lang.title')}" data-testid="lang">${icon('globe')}<span>${ui.lang === 'ru' ? 'RU' : 'EN'}</span></button>
      <button class="${cls('icon-btn', ui.drawer && 'is-on')}" data-action="toggleDrawer" title="${t('an.title')}" aria-label="${t('an.title')}" data-testid="analytics">${icon('activity')}<i class="pip">${state.analytics.length}</i></button>
      <div class="avatar me" title="${esc(L(Data.SENDER))}">${ui.lang === 'en' ? 'AV' : 'АВ'}</div>
    </div>
  </header>`;
}

/* ------------------------------ controls ------------------------------ */

function Toggle(path, on, label, hint, opts = {}) {
  return `<label class="${cls('tgl', opts.compact && 'tgl-compact', opts.locked && 'is-locked')}">
    <input type="checkbox" ${path ? `data-bind="${path}"` : ''} ${on ? 'checked' : ''} ${opts.locked ? 'disabled' : ''}>
    <span class="tgl-track" aria-hidden="true"><span class="tgl-thumb"></span></span>
    ${label ? `<span class="tgl-text"><span>${label}${opts.locked ? ` <em class="lock-tag">${icon('lock')} ${t('common.always')}</em>` : ''}</span>${hint ? `<small>${hint}</small>` : ''}</span>` : ''}
  </label>`;
}

function Range(path, value, min, max, step, { safe, danger, unit }) {
  const pct = (v) => clamp(((v - min) / (max - min)) * 100, 0, 100);
  const zone = value <= safe ? 'safe' : value <= (danger ?? Math.round(safe * 1.5)) ? 'warn' : 'risk';
  return `<div class="${cls('range', `zone-${zone}`)}" style="--p:${pct(value)}%;--safe:${pct(safe)}%;--danger:${pct(danger ?? safe * 1.5)}%">
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-bind="${path}" data-num aria-label="${esc(unit)}">
    <div class="range-meta"><b class="mono">${value}</b><span>${unit}</span><em>${t(`range.${zone}`)}</em></div>
  </div>`;
}

/** Segmented control bound to a state path through the generic `setVal` action. */
function Seg(path, value, options, size = '') {
  return `<div class="${cls('seg', size)}" role="radiogroup">${options.map((o) => `<button role="radio" aria-checked="${String(o.v) === String(value)}" class="${cls(String(o.v) === String(value) && 'is-on')}" data-action="setVal" data-arg="${path}|${o.v}">${o.ic ? icon(o.ic) : ''}${o.label}</button>`).join('')}</div>`;
}

function Select(path, value, options, attrs = '') {
  return `<select class="inp" data-bind="${path}" ${attrs}>${options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(value) ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${o.label}</option>`).join('')}</select>`;
}

const AVATAR_GRADS = [['#6366F1', '#8B5CF6'], ['#0EA5E9', '#6366F1'], ['#10B981', '#0EA5E9'], ['#F59E0B', '#EF4444'], ['#EC4899', '#8B5CF6'], ['#14B8A6', '#22C55E']];
function Avatar(lead, size = '') {
  const g = AVATAR_GRADS[Data.hash(lead.id + lead.name) % AVATAR_GRADS.length];
  const ini = `${(lead.firstName || '?')[0]}${(lead.lastName || '')[0] || ''}`.toUpperCase();
  return `<span class="${cls('avatar', size)}" style="--g1:${g[0]};--g2:${g[1]}" title="${esc(lead.name)}">${esc(ini)}</span>`;
}

function ChBadge(ch, size = '') {
  return `<span class="${cls('ch-badge', size)}" style="--c:${chColor(ch)}" title="${chName(ch)}">${chIcon(ch)}</span>`;
}

function LightDot(light, extra = '') {
  return `<span class="${cls('light', `l-${light || 'none'}`, extra)}" aria-label="${t(`light.${light || 'none'}`)}"></span>`;
}

/* ------------------------------ overlays ------------------------------ */

function LaunchFx() {
  const chs = ['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'sms', 'call'];
  return `<div class="launch-fx" role="status" aria-live="polite" data-testid="launch-fx">
    <div class="fx-rings" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="fx-orbit" aria-hidden="true">${chs.map((c, i) => `<span style="--c:${chColor(c)};--i:${i}">${chIcon(c)}</span>`).join('')}</div>
    <div class="fx-core">${icon('rocket')}</div>
    <div class="fx-text"><b>${t('fx.title')}</b><small>${t('fx.sub', { n: state.campaign.leads.length })}</small></div>
  </div>`;
}

/** The live region is always in the DOM so screen readers announce toasts inserted into it. */
function Toast() {
  const x = state.ui.toast;
  if (!x) return '<div class="toast-wrap" role="status" aria-live="polite" data-key="toast-region"></div>';
  const ic = x.ic || (x.kind === 'error' || x.kind === 'warn' ? 'alert' : x.kind === 'reply' ? 'reply' : 'check-circle');
  return `<div class="toast-wrap" role="status" aria-live="polite" data-key="toast-region"><div class="${cls('toast', `toast-${x.kind}`)}" data-key="toast-${x.id}" data-testid="toast">${icon(ic)}<span>${x.text}</span><button class="toast-x" data-action="closeToast" aria-label="${t('common.close')}">${icon('x')}</button></div></div>`;
}

function EventsDrawer() {
  const ev = state.analytics.slice(-150).reverse();
  const s = state.session;
  const launched = state.analytics.filter((e) => e.name === 'campaign_launched').pop();
  const ttl = launched && launched.props.time_to_launch_s != null ? `${Math.floor(launched.props.time_to_launch_s / 60)}:${pad2(launched.props.time_to_launch_s % 60)}` : '—';
  const proSettings = state.analytics.filter((e) => e.name === 'setting_changed' && e.props.mode === 'pro').length;
  return `<div class="drawer-backdrop" data-action="toggleDrawer"></div>
  <aside class="drawer" role="dialog" aria-label="${t('an.title')}" data-testid="drawer">
    <header class="drawer-head">
      <div><b>${icon('activity')} ${t('an.title')}</b><small>${t('an.sub')}</small></div>
      <button class="icon-btn" data-action="toggleDrawer" aria-label="${t('common.close')}">${icon('x')}</button>
    </header>
    <div class="an-kpis">
      <div><small>${t('an.ttl')}</small><b class="mono">${ttl}</b></div>
      <div><small>${t('an.events')}</small><b class="mono">${state.analytics.length}</b></div>
      <div><small>${t('an.switches')}</small><b class="mono">${s.modeSwitches}</b></div>
      <div><small>${t('an.pro')}</small><b class="mono">${proSettings}</b></div>
    </div>
    <ol class="an-list">${ev.map((e) => `<li data-key="a-${e.id}"><time class="mono">${new Date(e.ts).toLocaleTimeString(state.ui.lang === 'en' ? 'en-GB' : 'ru-RU')}</time><code>${esc(e.name)}</code><span class="mono">${esc(JSON.stringify(e.props))}</span></li>`).join('')}</ol>
    <footer class="drawer-foot">
      <button class="btn btn-ghost" data-action="exportAnalytics">${icon('download')} ${t('an.export')}</button>
      <button class="btn btn-ghost danger" data-action="resetDemo">${icon('rotate')} ${t('an.reset')}</button>
    </footer>
  </aside>`;
}

function NotLaunched(kind) {
  return `<main class="empty-state" data-testid="empty-${kind}"><div class="empty-card">
    <div class="empty-illu">${kind === 'inbox' ? icon('inbox') : icon('radio')}<i></i><i></i></div>
    <h2>${t(`empty.${kind}.title`)}</h2><p>${t(`empty.${kind}.sub`)}</p>
    <div class="empty-actions">
      <button class="btn btn-primary btn-lg" data-action="quickLaunch">${icon('rocket')} ${t('empty.quick')}</button>
      <button class="btn btn-ghost btn-lg" data-action="nav" data-arg="builder">${t('empty.toBuilder')}</button>
    </div>
  </div></main>`;
}
