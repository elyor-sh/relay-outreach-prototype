/**
 * Relay App — root view and bootstrap.
 */

function App() {
  const { ui } = state;
  const page = ui.view === 'builder'
    ? (ui.mode === 'simple' ? SimpleBuilder() : ProBuilder())
    : ui.view === 'live' ? LiveView() : InboxView();
  return `${Header()}
    <div class="page" data-key="page-${ui.view}-${ui.mode}">${page}</div>
    ${ui.editStep && ui.mode === 'simple' && ui.view === 'builder' ? StepSheet() : ''}
    ${ui.drawer ? EventsDrawer() : ''}
    ${ui.launching ? LaunchFx() : ''}
    ${Toast()}`;
}

let rafPending = false;
/** Batch renders into the next animation frame. */
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderNow(); });
}

let lastHtml = '';
function renderNow() {
  const root = document.getElementById('app');
  document.documentElement.dataset.mode = state.ui.mode;
  document.documentElement.lang = state.ui.lang;
  const html = App();
  if (html === lastHtml) return; // nothing changed — skip parsing and diffing entirely
  lastHtml = html;
  Morph.morphInto(root, html);
  syncDialog();
}

function bootstrap() {
  if (params.get('mode') === 'pro' || params.get('mode') === 'simple') state.ui.mode = params.get('mode');
  // ?lang= overriding a saved session: translate generated texts too, not just the chrome.
  if (boot.langChanged) relocalize(boot.langChanged, state.ui.lang);
  wireEvents();
  renderNow();
  track('app_opened', { restored: boot.restored, lang: state.ui.lang, viewport: `${innerWidth}x${innerHeight}` });
  requestAnimationFrame(tick);
  // Public handle for e2e tests, the demo recorder and curious reviewers.
  window.Relay = { state, A, Engine, Data, Morph, render: renderNow, liveResult, liveProj, preflight, riskScore, forecast };
}

bootstrap();
