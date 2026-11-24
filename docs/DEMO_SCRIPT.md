# Demo video — script & chapters

`demo/relay-demo.mp4` · 1920×1080 · 30 fps · H.264 · 2:55 · no audio (captions in
RU with an EN line). Recorded by `scripts/record-demo.mjs` from the real
`index.html` — nothing is mocked or edited; the cursor and captions are an
overlay injected outside the app.

| Time | Chapter | What you see | Requirement it proves |
|---|---|---|---|
| 0:00 | Title | Relay · two modes in one window | — |
| 0:04 | Simple · 1. Who | Demo list → 48 people, 7 countries, 9 timezones; channel coverage; tz from phone codes | Simple step 1, clean UI |
| 0:11 | Simple · 2. Goal by voice | Mic → live dictation with waveform → “Write the messages” → AI phases → drafts per channel (no link in the messenger touch, SMS fits one segment) | Simple step 2, text **or voice** |
| 0:26 | Simple · 3. Track | Day ruler with weekends, step bubbles with plain conditions, side sheet with “who gets it” pills | Visual track by days, branching in plain words |
| 0:34 | Autopilot | Three animated cards: reply → stop everything; working hours per recipient (Berlin 08:00 waits); WhatsApp → Telegram → Signal → SMS | Protections on autopilot |
| 0:43 | Launch → Live | Launch animation; plain-language feed: night deferrals, sends, opens, clicks, LinkedIn warm-up likes | Working hours in action |
| 0:53 | Reply anywhere → stop | 12 h/s: LinkedIn cap overflow, cascade, replies; “Chain stopped — cancelled 2 steps”; stop word «стоп» → unsubscribed | **Auto-stop on reply in any channel**, cascade, limits |
| 1:05 | Unified inbox | Traffic-light house, green filter, full multichannel thread (LinkedIn → WhatsApp → local-number call → AI voice → transfer to manager → auto-stop divider → meeting), AI analysis, AI reply → send | Unified inbox + lead traffic light |
| 1:21 | Switch to PRO | Circular view-transition into the dark PRO theme; rules panel: per-timezone strip, auto-stop rules, cascade order | Mode switch in the header, same data |
| 1:32 | PRO · Email | Mailbox rotation table, daily cap slider with safe zones, warm-up ramp; pixel off → red dashed “read” branches on the logic map → one-click fixes | Email: rotation, limits, warm-up, pixel off; branching |
| 1:48 | PRO · LinkedIn | Like + profile-view warm-up, invite cap dragged to 38 → risk gauge jumps → “Lower to 20”, proxy status | LinkedIn: warm-up, invite limit, proxy |
| 2:00 | PRO · Messengers | Typing a link into the first messenger message → warning + preview shows it cut; WhatsApp/Telegram/Signal tabs: typing simulation, voice notes, video circles, per-number caps | No links first, typing, voice & circles, hard caps |
| 2:16 | PRO · SMS | 63/70 UCS-2 meter; +7 383 → Novosibirsk UTC+7; adding the stop word «хватит» | SMS: 160/70, tz by code, stop words |
| 2:29 | PRO · Call | Local caller ID per city, AMD with voicemail / retry / SMS, AI voice → manager | Call: local number, AMD, AI or transfer |
| 2:39 | PRO · Live | Typed event log filtered to “Guards”, resource meters vs caps | Logic of the engine, visible |
| 2:50 | Analytics | Product-analytics drawer: tracking-plan events, time-to-launch, mode switches | Product thinking |
| 2:52 | End card | One HTML file · deterministic engine · RU/EN · tests · docs | — |

## Re-recording

```bash
npm install
npm run build
npm run record      # → demo/relay-demo.mp4 (≈ 4 min wall time incl. encoding)
```

The recorder runs headless Chrome at 1600×900 CSS px with a device pixel
ratio of 1.2 (= 1080p), captures frames over the DevTools screencast and
encodes them with `ffmpeg-static`. Timings live in the script, so the take is
reproducible; the campaign itself is deterministic (seed 42).
