# Relay — architecture

A zero-dependency, single-file prototype that still behaves like a product:
a deterministic simulation engine, a tiny reactive view layer, bilingual
UI, persistence, product analytics and automated tests.

```
src/
  engine.js            pure simulation: time model, protections, branching, projection
  data.js              demo audience, defaults, AI copywriter (templates), replies
  i18n.js              664 [ru, en] string tuples + plural rules
  icons.js             inline SVG icons (Lucide-style UI + channel glyphs)
  morph.js             keyed DOM morphing (~100 LOC)
  app/core.js          state, persistence, memoised derivations, validation, risk
  app/views-*.js       view functions: common, simple, pro, live, inbox
  app/actions.js       actions, bindings, playback loop, voice, launch
  app/render.js        root view + bootstrap
  styles.css           two design systems (Simple light / PRO dark) via tokens
  index.template.html  shell with CSS/JS placeholders
scripts/
  build.mjs            concatenates modules (dependency order) into index.html
  e2e.mjs              Playwright end-to-end smoke test (17 checks)
  record-demo.mjs      scripted screen recording → demo/relay-demo.mp4
tests/
  engine.test.mjs      16 invariants of the engine
  data.test.mjs        demo data, AI drafts vs channel rules, import
  i18n.test.mjs        key parity, placeholders, plurals, no missing keys
```

## 1. Why no framework

The deliverable is *one HTML file that opens anywhere, offline*. A framework
would add a build chain and ~40–100 KB without adding capability here. The
app needs exactly three things a framework provides — a single source of
truth, declarative views and efficient DOM updates — and each is small:

```
state ──► App() view functions ──► HTML string ──► Morph ──► DOM
  ▲                                                    │
  └─── actions (data-action) / bindings (data-bind) ◄──┘
```

* **State** — one plain object (`state`), persisted to `localStorage`
  (debounced) with transient UI fields stripped on restore.
* **Views** — pure functions `state → string`. Every dynamic value passes
  through `esc()`; `t()` output is trusted and its parameters are escaped by
  callers.
* **Morph** (`src/morph.js`) — parses the new markup with an inert
  `DOMParser` document and patches the live tree in place: keyed children
  (`data-key`) are matched and moved, others matched by position and tag.
  Focused inputs keep their value and caret, so typing never fights the
  re-render, and CSS transitions survive updates.
* **Events** — one delegated listener per event type. Markup declares intent:
  `data-action="fix" data-arg="li-limit"` calls `A.fix('li-limit')`;
  `data-bind="campaign.channels.email.dailyLimit"` is two-way bound (with
  `data-num` / `data-kind="autonum"` coercion). `onBound()` centralises side
  effects: invalidation, persistence, analytics.
* **Renders** are batched into `requestAnimationFrame`; the playback loop
  repaints at ~12 fps.

## 2. The engine (`src/engine.js`)

A discrete-event simulator. Pure, DOM-free, deterministic (seeded
`mulberry32` PRNG), so the same code powers the live monitor, the PRO
forecast and the unit tests.

**Time model.** Integer minutes since Monday 00:00 UTC of the launch week.
The campaign launches Monday 10:00 Moscow time. Timezones are fixed offsets
(DST ignored on purpose).

**Queue.** A time-ordered array of jobs: `step` (send a step to a lead),
`like` (LinkedIn warm-up) and `outcome` (open / click / accepted / bounce /
auto-reply / reply). Outcomes are scheduled when a message is sent and
processed in time order, so a reply on day 2 cancels the day-3 jobs before
they run.

**Pipeline for each `step` job:**

1. **Branching condition** — evaluated once at the nominal time against the
   lead’s history of the referenced step (`opened`, `not_opened`,
   `clicked`, `no_reply`). Not met → `skip` event.
2. **Working hours** — `inWindow(t, lead.tz, rules)`; outside → `deferred`
   (reason `night` / `weekend`) and re-queued at `nextWindow()` + jitter.
3. **Channel resolution** — `messenger` steps walk the cascade
   (WhatsApp → Telegram → Signal → SMS, user-reorderable) and emit `cascade`
   with the channels tried; fixed channels check reachability (bounced email,
   unsubscribed lead, LinkedIn connection for messages).
4. **Rate limits** — `acquire()` takes a token from the right pool:
   per-mailbox daily cap with warm-up ramp and round-robin/health rotation,
   LinkedIn invites/messages per day, per-number caps for each messenger,
   SMS and call quotas. No token → `limit` event, re-queued to the next
   day’s window.
5. **Send** — messenger safety (link stripped from the first message in
   that channel, typing delay, voice/video note), then outcomes are drawn
   from the lead persona and channel factors. Email opens are only
   *observable* with the pixel on; clicks need click tracking; a stripped
   link cannot be clicked.
6. **Calls** — local caller ID raises pickup; answering machines are
   detected (AMD) and handled by policy (voicemail / retry / SMS) or, with
   AMD off, waste AI time; answered calls produce an AI or manager
   conversation and, in hybrid mode, a warm transfer + meeting.

**Reply → auto-stop.** Any human reply (any channel, including a call)
removes every pending `step`/`like` job of that lead from the queue and emits
`auto_stop { cancelled }`. Stop words also emit `unsubscribe`. Out-of-office
auto-replies are recognised and do *not* stop the chain (configurable).

**Outputs.** `simulate()` returns the sorted event list plus aggregates
(`byDay`, `stepStats`, `stats`, resource `usage`). `project(result, T)`
folds the events up to minute `T` into per-lead state and live metrics; the
UI memoises it by the number of visible events, so playback is O(new
events) in practice. A 48-lead campaign (~500 events) simulates in ~5–15 ms.

## 3. Derived data & invalidation (`src/app/core.js`)

`bump()` increments a campaign revision on every mutation of
`state.campaign`; `forecast()`, `preflight()`, `riskScore()` are memoised on
that revision. Live data is a frozen snapshot taken at launch
(`state.sim.snapshot`), re-simulated lazily after a reload, so editing the
builder never corrupts a running campaign.

**Validation** is layered:

* `validateStep()` — per-step notes (empty text, link in the first
  messenger message, SMS segments with the *longest name in the list*,
  LinkedIn note ≤ 300, missing subject, unmeasurable condition).
* `condIssue()` — cross-setting checks (pixel off ⇒ “read” branch broken).
* `preflight()` — aggregates step notes and channel checks, attaches
  one-click fixes (`applyFix()`), and adds the always-on guarantees as green
  checks. Errors block launch; warnings don’t.
* `riskScore()` — a transparent additive heuristic so PRO users can see which
  knob moves the needle.

## 4. Modes, theming and motion

Both modes share every component; `html[data-mode]` swaps design tokens
(colour, radius, density, type scale). The mode switch runs inside
`document.startViewTransition()` with a circular clip-path reveal from the
toggle; browsers without View Transitions (or with reduced motion) switch
instantly. `prefers-reduced-motion` disables all animation.

## 5. i18n

Every string is a `[ru, en]` tuple in one dictionary, so a key can’t exist
in one language only. `t(key, vars)` handles `{param}` interpolation and
plurals via `Intl.PluralRules` (`one|few|many` for Russian, `one|other` for
English). Tests enforce parity, placeholder equality and that every static
`t('…')` call has a key; missing keys also log at runtime (the e2e test
fails on any console warning).

## 6. Voice input

`webkitSpeechRecognition` / `SpeechRecognition` with interim results in the
UI language. If the API is missing, permission is denied or it errors before
producing text (e.g. `file://`, headless), a scripted dictation runs so the
flow is always demonstrable. `?voice=sim` forces the fallback.

## 7. Testing

| Layer | Tool | What |
|---|---|---|
| Engine invariants | `node:test` | determinism; every send inside the recipient’s window; no touch after a reply; cascade order; hard caps; warm-up; link stripping; pixel-off semantics; `clicked` branch correctness; stop words; AMD; projection consistency; tz detection; SMS segmentation; performance budget |
| Data | `node:test` | demo audience determinism, AI drafts obey channel rules for all goals × tones × languages, CSV/list import |
| i18n | `node:test` | parity, placeholders, plural forms, no missing keys |
| End-to-end | Playwright + system Chrome | full Simple flow (voice → AI → launch), live, inbox, PRO knobs, risk & one-click fix, link warning, language switch, analytics events, zero console errors |

Source files are plain scripts; `tests/_load.mjs` evaluates them in a
`vm` context, so tests run against the exact code that ships.

## 8. Build & recording

* `scripts/build.mjs` concatenates the modules in dependency order into one
  IIFE (no globals except the `window.Relay` debug handle), inlines CSS, and
  refuses to build if a module contains `</script`.
* `scripts/record-demo.mjs` drives the real app with Playwright, captures
  frames via the CDP screencast, overlays a cursor and captions *outside*
  `#app`, and encodes a constant-30 fps H.264 MP4 with `ffmpeg-static`
  (concat demuxer with per-frame durations, so idle moments cost nothing).

## 9. Trade-offs & limitations

* String-template views re-render the whole tree; fine for this size, but a
  real product with thousands of leads would virtualise tables and move the
  engine to a Web Worker.
* Time zones are fixed offsets; production needs IANA zones + DST.
* The AI is template-based by design: deterministic, offline, reviewable.
  The channel validators are the guardrails a real LLM integration would
  keep.
* Persistence is `localStorage` only; there is no multi-user state.
