# Relay — product notes

This document explains the *why* behind the prototype: who it is for, which
problems each screen solves, how success would be measured, and what I would
test next. The prototype is built so that every claim below can be checked
by clicking (see the [requirement map](../README.md#requirement-coverage)).

---

## 1. Problem

Multichannel outreach (email + LinkedIn + messengers + SMS + calls) converts
better than any single channel, but today it is either:

* **too risky for beginners** — one careless setting (a link in the first
  WhatsApp message, 80 LinkedIn invites a day, a 3 AM SMS) burns a number,
  an account or a domain; and nobody stops the chain when the person has
  already replied on another channel, which looks spammy and kills the deal;
* **too complex for everyone else** — professional tools expose dozens of
  knobs per channel up front, so a small-business owner never gets to
  “Launch”.

## 2. Users & jobs-to-be-done

| Persona | Context | Job to be done | What they fear |
|---|---|---|---|
| **Founder / SMB owner** (Simple) | Sells occasionally, no SDR team, not a tool expert | “When I need meetings, help me reach the right people politely and automatically, without learning a new profession.” | Looking like a spammer, getting banned, wasting a weekend on setup |
| **SDR / growth specialist** (PRO) | Runs several campaigns a week, owns deliverability | “Give me precise control over limits, timing and branching per channel, and show me the consequences before I launch.” | Account bans, low reply rates, opaque automation |
| **Sales manager** (Inbox) | Receives the replies | “Show me who is hot right now, across all channels, with full context.” | Missing a hot lead in one of seven inboxes |

## 3. Design principles

1. **One campaign, two lenses.** Simple and PRO render the *same* data model.
   Switching modes never loses work, so a beginner can peek into PRO and a
   pro can hand a campaign to a beginner. (In code: one `state.campaign`, two
   view trees.)
2. **Safe by default, explained in plain words.** Every protection is on
   before the user touches anything. Simple mode never shows a knob, but it
   *does* show what the autopilot is doing (“It’s night for Lucas — we’ll
   write at 09:12 his time”). Trust comes from visibility, not from options.
3. **Progressive disclosure.** Simple mode is 3 steps. PRO collapses every
   step into one row; settings open only when a step is expanded, grouped
   into *Message / Logic & timing / Channel*.
4. **Show consequences before launch.** PRO recomputes a forecast, a
   ban-risk score and a preflight checklist on every change, and offers
   one-click fixes (“Lower to 20”, “Switch to ‘clicked’”).
5. **Settings live where they belong.** Limits are per account/number, so
   channel settings are shared across all steps of that channel (and the UI
   says so). Text, timing and conditions are per step.
6. **Cross-setting validation.** Turning the email pixel off makes any
   “read / not read” branch that depends on that email unmeasurable — the
   step, the logic map and the preflight all flag it immediately. This is the
   kind of hidden coupling that causes silent campaign failures in real tools.

## 4. Key flows

### Simple: launch in 3 steps (target: < 2 minutes)

1. **Who** — upload CSV / paste a list / use the demo list. We show coverage
   per channel and detected timezones (phone code → timezone).
2. **What for** — type or *say* the goal (Web Speech API, scripted fallback).
   The AI copywriter writes every step, respecting channel rules (no link in
   the first messenger touch, SMS fits one segment, LinkedIn note ≤ 300).
3. **Track** — a day-by-day ruler (weekends shaded) with step bubbles and
   plain-language conditions (“if they read the email but stay silent”).
   Three autopilot cards explain the protections. One big **Launch** button
   with the expected outcome (“≈ 15 replies in 8 days”).

### PRO: tune and verify

Expand a step → edit text with variables and live per-channel preview →
set day, time and branching condition (with availability reasons) → tune
channel limits → watch the logic map, risk gauge and forecast react.

### Live & inbox

The launched campaign is played back on a virtual clock (1–12 hours per
second). The Simple feed explains every decision in plain words and a
“Protection at work” panel counts them. PRO gets a lead table, a typed event
log and resource meters. Replies from every channel land in one inbox,
sorted by a traffic light; the thread shows the full multichannel history
including the exact moment the chain was auto-stopped.

## 5. Success metrics

**North Star:** *qualified conversations started per active workspace per
week* (a positive reply or a booked meeting). It captures value for the user
and is hard to game with volume alone.

| Layer | Metric | Why |
|---|---|---|
| Activation | **Time-to-launch** (first interaction → `campaign_launched`), % of new users who launch within the first session | The Simple mode promise: “launch in 3 steps” |
| Activation | Wizard step conversion 1→2→3→launch | Finds the step that loses people |
| Engagement | % campaigns created with voice input; % drafts edited after AI generation | Is AI copy trusted? |
| Outcome | Reply rate, positive reply rate, meetings per 100 leads | Value delivered |
| **Guardrails** | Account/number ban rate, spam-complaint rate, unsubscribe rate, replies after auto-stop (should be 0) | Safety is the product |
| Mode health | PRO adoption among users with > 3 campaigns; share of users switching Simple → PRO and back | Validates the “two lenses” bet |
| PRO quality | Preflight fixes applied per launch; launches with risk score ≥ 60 | Are warnings understood and acted on? |

## 6. Tracking plan (implemented)

Every event below is emitted by the prototype and visible live in the
**Product analytics** drawer (activity icon in the header); each carries
`mode` automatically. Export to JSON is one click.

| Event | Key properties | Question it answers |
|---|---|---|
| `app_opened` | `restored`, `lang`, `viewport` | Returning vs new sessions |
| `mode_switched` | `from`, `to`, `view` | Do beginners peek into PRO? Where? |
| `wizard_step_viewed` / `wizard_step_completed` | `step` | Funnel drop-off per step |
| `audience_source_selected` / `audience_loaded` | `source`, `count` | CSV vs paste vs demo; list sizes |
| `goal_input` | `method` (text/voice/chip), `chars`/`words`/`seconds` | Voice adoption, goal quality |
| `voice_started` | `api` | Speech API availability in the wild |
| `messages_generated` | `intent`, `tone`, `steps`, `ms` | AI usage, latency |
| `step_added` / `step_removed` / `step_opened` / `step_expanded` / `step_tab_opened` | `channel`, `step`, `tab` | Which channels and settings matter |
| `condition_set` | `step`, `condition` | Branching adoption |
| `setting_changed` (debounced) | `path`, `value` | Most-touched knobs, risky values |
| `preflight_fix_applied` | `fix` | Which warnings are understood |
| `campaign_launched` | `leads`, `steps`, `channels`, `risk`, `expected_replies`, `time_to_launch_s` | Activation + risk at launch |
| `sim_*` (`played`, `paused`, `speed_changed`, `completed`) | `day`, `speed` | (prototype only) demo engagement |
| `inbox_thread_opened` / `inbox_filtered` | `light`, `channel` | Triage behaviour |
| `ai_reply_drafted` / `reply_sent` | `intent`, `ai_assisted`, `channel` | AI-assisted reply adoption |
| `lead_status_overridden` / `meeting_booked` / `lead_handed_off` / `lead_blocked` | `light`, `lead` | Disagreement with AI classification → model feedback |

`lead_status_overridden` is deliberately tracked: every time a human
disagrees with the AI traffic light, that is a labelled example for the
intent classifier.

## 7. Hypotheses I would test first

| # | Hypothesis | Experiment | Primary metric | Guardrail |
|---|---|---|---|---|
| H1 | Showing autopilot decisions in plain words (“It’s night for Lucas”) increases trust and campaign #2 creation | A/B: live feed vs. numbers-only dashboard | Second campaign within 7 days | — |
| H2 | Voice input lowers time-to-launch for non-experts | A/B: mic button visible vs hidden | Median time-to-launch | Draft edit rate (quality) |
| H3 | One-click preflight fixes reduce bans more than warnings alone | A/B: fix buttons vs text warnings | Ban rate per 1k sends | Launch rate |
| H4 | Messenger cascade beats a single pinned messenger on reach without hurting reply quality | Within-campaign split by lead | Reachable leads %, positive reply rate | Unsubscribe rate |
| H5 | Local caller ID lifts pickup (engine assumes +45%) | Holdout on call steps | Pickup rate | Complaint rate |

## 8. What is simulated (and how it would be real)

| In the prototype | In production |
|---|---|
| Template-based copywriter with intent detection | LLM with the same channel constraints as hard validators (they already exist in `validateStep`) |
| Messenger availability from country priors | Number lookup via provider APIs (WhatsApp Business, Telegram, Signal registration check) |
| Reply intent from the simulated persona | LLM intent classifier; human overrides as training labels |
| Seeded probabilities for opens/clicks/replies | Real events from ESP webhooks, messenger delivery receipts, telephony callbacks |
| One virtual clock | A job scheduler per workspace with per-resource token buckets (the engine’s `acquire()` is that logic) |

## 9. Risks & open questions

* **Compliance.** GDPR / CAN-SPAM / local telecom rules differ per country;
  stop words and global block lists are in, but consent tracking and
  per-country send rules would be needed.
* **Platform ToS.** LinkedIn and WhatsApp automation is a grey zone. The
  prototype leans on conservative defaults; a real product needs official
  APIs where they exist (WhatsApp Business templates) and clear user
  responsibility.
* **Read receipts are unreliable** (Apple Mail Privacy Protection inflates
  opens). That is why “clicked” is offered as the robust alternative and the
  pixel can be disabled.
* **AI tone mistakes are expensive.** Drafts are always shown before launch
  and editable; the tracking plan measures edit rate.

## 10. Next iterations

1. A/B variants per step with automatic winner selection.
2. Holiday calendars per country (the working-hours engine already supports
   per-recipient windows).
3. Calendar integration so “Book a meeting” proposes real free slots.
4. Team inbox: assignment, SLA timers on green leads (“reply within 1 hour”).
5. Import from CRM with field mapping and deduplication across campaigns.
