import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCampaign, clone } from './_load.mjs';

const { Engine, Data, c: base } = demoCampaign();
/** VM-realm objects have foreign prototypes; compare their plain JSON shape. */
const plain = (x) => JSON.parse(JSON.stringify(x));
const run = (patch = (c) => c, seed = 42) => {
  const c = clone(base);
  patch(c);
  return { c, r: Engine.simulate(c, { seed }) };
};
const byLead = (events) => {
  const m = new Map();
  for (const e of events) if (e.lead) (m.get(e.lead) || m.set(e.lead, []).get(e.lead)).push(e);
  return m;
};

test('simulation is deterministic for a given seed', () => {
  const a = run().r;
  const b = run().r;
  assert.deepEqual(plain(a.events), plain(b.events));
  const c = run((x) => x, 7).r;
  assert.notDeepEqual(a.events.map((e) => e.type), c.events.map((e) => e.type));
});

test('every send happens inside the recipient working hours, never on weekends', () => {
  const { c, r } = run();
  const tzOf = Object.fromEntries(c.leads.map((l) => [l.id, l.tz]));
  const sends = r.events.filter((e) => (e.type === 'send' && e.kind !== 'call_followup') || e.type === 'call');
  assert.ok(sends.length > 100);
  for (const e of sends) {
    assert.ok(Engine.inWindow(e.t, tzOf[e.lead], c.rules), `${e.type} to ${e.lead} at local ${JSON.stringify(Engine.localInfo(e.t, tzOf[e.lead]))}`);
  }
  assert.ok(r.stats.night > 0, 'US/BR leads must be deferred at launch (night)');
  assert.ok(r.stats.weekend > 0, 'the day-7 step falls on a Sunday');
});

test('a reply in ANY channel stops the whole chain', () => {
  const { r } = run();
  let stopped = 0;
  for (const [, evs] of byLead(r.events)) {
    const reply = evs.find((e) => e.type === 'reply');
    if (!reply) continue;
    stopped++;
    const later = evs.filter((e) => e.t > reply.t && (e.type === 'send' || e.type === 'call' || e.type === 'like'));
    assert.equal(later.length, 0, `lead ${reply.lead} got ${later.length} touches after replying`);
    assert.ok(evs.some((e) => e.type === 'auto_stop' && e.t === reply.t));
  }
  assert.ok(stopped >= 5, 'demo should produce several replies');
  assert.ok(r.stats.cancelled > 0, 'some future steps must have been cancelled');
});

test('messenger cascade: no WhatsApp → Telegram → Signal → SMS', () => {
  const { r } = run((c) => {
    c.leads = c.leads.slice(0, 4).map((l, i) => ({
      ...l, id: `T${i}`, tz: 3, emailValid: true, ooo: false,
      persona: { ...l.persona, open: 1, reply: 0, click: 0 },
      has: [
        { email: true, phone: true, whatsapp: true, telegram: true, signal: true, linkedin: false },
        { email: true, phone: true, whatsapp: false, telegram: true, signal: true, linkedin: false },
        { email: true, phone: true, whatsapp: false, telegram: false, signal: true, linkedin: false },
        { email: true, phone: true, whatsapp: false, telegram: false, signal: false, linkedin: false },
      ][i],
    }));
    c.steps = [c.steps.find((s) => s.channel === 'messenger')];
    c.steps[0].condition = 'no_reply';
    c.steps[0].ref = null;
    c.steps[0].day = 1;
  });
  const sent = Object.fromEntries(r.events.filter((e) => e.type === 'send').map((e) => [e.lead, e.channel]));
  assert.deepEqual(sent, { T0: 'whatsapp', T1: 'telegram', T2: 'signal', T3: 'sms' });
  const casc = r.events.filter((e) => e.type === 'cascade').map((e) => e.tried.join('>'));
  assert.deepEqual(plain(casc.sort()), ['whatsapp', 'whatsapp>telegram', 'whatsapp>telegram>signal']);
});

test('daily limits are hard caps, overflow moves to the next day', () => {
  const { r } = run((c) => { c.channels.linkedin.inviteLimit = 5; c.channels.whatsapp.dailyPerNumber = 3; });
  const perDay = {};
  for (const e of r.events.filter((x) => x.type === 'send')) {
    const k = `${e.channel}|${e.via}|${Math.floor(e.t / Engine.DAY)}`;
    perDay[k] = (perDay[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(perDay)) {
    if (k.startsWith('linkedin|invite')) assert.ok(n <= 5, `${k} = ${n}`);
    if (k.startsWith('whatsapp|')) assert.ok(n <= 3, `${k} = ${n}`);
  }
  assert.ok(r.stats.limit > 0);
});

test('email warm-up caps young mailboxes and rotation spreads the load', () => {
  const { c, r } = run((x) => { x.channels.email.dailyLimit = 100; });
  const day0 = Math.floor(r.startT / Engine.DAY);
  const young = c.channels.email.mailboxes.find((m) => m.ageDays === 3);
  const cap = Engine.emailCap(young, 0, c.channels.email);
  assert.equal(cap, 10 + 4 * 3);
  const used = r.usage[`mb:${young.id}:${day0}`] || 0;
  assert.ok(used <= cap);
  const vias = new Set(r.events.filter((e) => e.type === 'send' && e.channel === 'email').map((e) => e.via));
  assert.equal(vias.size, 3, 'round-robin uses every enabled mailbox');
});

test('links are stripped from the first messenger message only', () => {
  const { r } = run((c) => {
    const m = c.steps.find((s) => s.channel === 'messenger');
    m.text += ' relay.app/case';
    m.condition = 'no_reply';
    m.ref = null;
  });
  const firstSends = r.events.filter((e) => e.type === 'send' && ['whatsapp', 'telegram', 'signal'].includes(e.channel));
  assert.ok(firstSends.length > 0);
  assert.ok(firstSends.every((e) => e.linkStripped));
  assert.equal(r.stats.stripped, firstSends.length);
});

test('pixel off: email opens are invisible, so «opened» branches only fire via clicks', () => {
  const { r } = run((c) => { c.channels.email.trackOpens = false; });
  assert.equal(r.events.filter((e) => e.type === 'open' && e.channel === 'email').length, 0);
  const s3 = r.stepStats.s3;
  const withPixel = run().r.stepStats.s3;
  assert.ok(s3.sent < withPixel.sent, `${s3.sent} < ${withPixel.sent}`);
});

test('branch «clicked» only reaches people who clicked the referenced step', () => {
  const { r } = run();
  const clicked = new Set(r.events.filter((e) => e.type === 'click' && e.step === 's1').map((e) => e.lead));
  const called = r.events.filter((e) => e.type === 'call' && e.step === 's5').map((e) => e.lead);
  assert.ok(called.length > 0);
  for (const id of called) assert.ok(clicked.has(id), `${id} was called without clicking`);
});

test('stop word reply unsubscribes the lead', () => {
  const { r } = run();
  const stops = r.events.filter((e) => e.type === 'reply' && e.intent === 'stop');
  for (const s of stops) assert.ok(r.events.some((e) => e.type === 'unsubscribe' && e.lead === s.lead));
});

test('AMD off makes the AI talk to voicemail; AMD on detects it', () => {
  const on = run((c) => { c.steps.find((s) => s.id === 's5').condition = 'no_reply'; }).r;
  const off = run((c) => { c.steps.find((s) => s.id === 's5').condition = 'no_reply'; c.channels.call.amd = false; }).r;
  assert.ok(on.events.some((e) => e.type === 'amd'));
  assert.equal(on.events.filter((e) => e.type === 'machine').length, 0);
  assert.ok(off.events.some((e) => e.type === 'machine'));
  assert.equal(off.events.filter((e) => e.type === 'amd').length, 0);
});

test('project() folds the timeline consistently with the final stats', () => {
  const { r } = run();
  const P = Engine.project(r, r.endT);
  assert.equal(P.n, r.events.length);
  assert.equal(P.metrics.replied, r.stats.humanReplies);
  assert.equal(P.metrics.stops, r.stats.stops);
  const half = Engine.project(r, r.startT + Engine.DAY);
  assert.ok(half.n < P.n && half.metrics.sends <= P.metrics.sends);
});

test('nextWindow skips nights and weekends', () => {
  const rules = { workStart: 9, workEnd: 19, skipWeekends: true };
  const sat10 = 5 * Engine.DAY + 10 * 60; // Saturday 10:00 UTC
  const next = Engine.nextWindow(sat10, 0, rules);
  assert.deepEqual(plain(Engine.localInfo(next, 0)), { day: 7, dow: 0, min: 540, hh: 9, mm: 0 });
  const ny = Engine.nextWindow(Engine.LAUNCH_T, -5, rules);
  assert.equal(Engine.localInfo(ny, -5).hh, 9);
});

test('timezone detection by phone code (area codes win over country codes)', () => {
  assert.equal(Engine.tzFromPhone('+7 383 222-33-44').tz, 7);
  assert.equal(Engine.tzFromPhone('+7 495 222-33-44').tz, 3);
  assert.equal(Engine.tzFromPhone('+1 (415) 555-0192').tz, -8);
  assert.equal(Engine.tzFromPhone('+1 212 555 0101').tz, -5);
  assert.equal(Engine.tzFromPhone('+49 30 1234 5678').city, 'berlin');
  assert.equal(Engine.tzFromPhone('12'), null);
});

test('SMS segmentation: GSM-7 160 vs UCS-2 70', () => {
  assert.deepEqual(plain(Engine.smsInfo('a'.repeat(160))), { encoding: 'GSM-7', length: 160, perSegment: 160, segments: 1 });
  assert.equal(Engine.smsInfo('a'.repeat(161)).segments, 2);
  assert.equal(Engine.smsInfo('я'.repeat(70)).segments, 1);
  assert.equal(Engine.smsInfo('я'.repeat(71)).segments, 2);
  assert.equal(Engine.smsInfo('€').length, 2, 'extension chars count double in GSM-7');
  assert.equal(Data.composeDrafts({ goal: 'demo', lang: 'en' }).drafts.sms_reminder.text.length < 160, true);
});

test('performance: a 48-lead campaign simulates in well under a frame budget × 10', () => {
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) Engine.simulate(base, { seed: i + 1 });
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 160, `${ms.toFixed(1)} ms per run`);
});

/* ------------------- regression tests from the code review ------------------- */

test('stop words are matched against the reply text (configurable)', () => {
  const withText = (c) => Engine.simulate(c, { seed: 42, replyText: Data.replyTextAll });
  const on = withText(clone(base));
  const stopReplies = on.events.filter((e) => e.type === 'reply' && e.intent === 'stop');
  assert.ok(stopReplies.length > 0, 'demo has stop-word replies');
  const unsub = on.events.filter((e) => e.type === 'unsubscribe');
  assert.equal(unsub.length, stopReplies.length);
  assert.ok(unsub.every((e) => e.word), 'the matched word is reported');
  const off = clone(base);
  off.channels.sms.stopWords = [];
  assert.equal(withText(off).events.filter((e) => e.type === 'unsubscribe').length, 0);
});

test('tz-by-code off: SMS follows sender time and lands in some recipients\' night', () => {
  const { r: onR } = run();
  const { c, r } = run((x) => { x.channels.sms.tzByCode = false; });
  assert.equal(onR.stats.offHours, 0);
  assert.ok(r.stats.offHours > 0, 'US/BR leads get SMS outside their window');
  const tzOf = Object.fromEntries(c.leads.map((l) => [l.id, l.tz]));
  // Only the fixed SMS step: cascade-resolved SMS keep the lead's own timezone by design.
  for (const e of r.events.filter((x) => x.type === 'send' && x.step === 's6')) {
    assert.ok(Engine.inWindow(e.t, Engine.SENDER_TZ, c.rules), 'sent inside the sender window');
    assert.equal(e.offHours, !Engine.inWindow(e.t, tzOf[e.lead], c.rules));
  }
});

test('typing speed scales the typing delay', () => {
  const avg = (speed) => {
    const { r } = run((c) => { for (const m of ['whatsapp', 'telegram', 'signal']) c.channels[m].typingSpeed = speed; });
    const xs = r.events.filter((e) => e.type === 'send' && e.typing).map((e) => e.typing);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  assert.ok(avg('slow') > avg('human') && avg('human') > avg('fast'));
});

test('LinkedIn warm-up: profile views are logged and raise acceptance', () => {
  const warm = run().r;
  assert.ok(warm.events.some((e) => e.type === 'view'));
  const cold = run((c) => { c.channels.linkedin.likeWarmup = false; c.channels.linkedin.viewProfile = false; }).r;
  assert.equal(cold.events.filter((e) => e.type === 'like' || e.type === 'view').length, 0);
  const acc = (r) => r.events.filter((e) => e.type === 'accepted').length;
  assert.ok(acc(warm) >= acc(cold), `${acc(warm)} >= ${acc(cold)}`);
});

test('a branch waits for a delayed referenced step instead of skipping it', () => {
  // The LinkedIn invite (s2) is squeezed by a cap of 2/day; a step branching on it must not be lost.
  const { r } = run((c) => {
    c.channels.linkedin.inviteLimit = 2;
    c.steps.push({ id: 'sx', day: 3, channel: 'email', kind: 'message', tpl: 'email_followup', condition: 'not_opened', ref: 's2', sendAt: 'auto', subject: 'x', text: 'x' });
  });
  const delayed = new Set(r.events.filter((e) => e.type === 'limit' && e.step === 's2').map((e) => e.lead));
  assert.ok(delayed.size > 0);
  const lostToRace = r.events.filter((e) => e.type === 'skip' && e.step === 'sx' && e.reason === 'ref_not_sent' && delayed.has(e.lead));
  const sentInvite = new Set(r.events.filter((e) => e.type === 'send' && e.step === 's2').map((e) => e.lead));
  assert.equal(lostToRace.filter((e) => sentInvite.has(e.lead)).length, 0);
});

test('AMD→SMS follow-ups respect the SMS daily quota', () => {
  const { r } = run((c) => {
    c.channels.call.amdAction = 'sms';
    c.channels.sms.dailyLimit = 1;
    c.steps.find((s) => s.id === 's5').condition = 'no_reply';
  });
  const perDay = {};
  for (const e of r.events.filter((x) => x.type === 'send' && x.channel === 'sms')) {
    const d = Math.floor(e.t / Engine.DAY);
    perDay[d] = (perDay[d] || 0) + 1;
  }
  assert.ok(Object.values(perDay).every((n) => n <= 1), JSON.stringify(perDay));
});

test('forecast days use the sender calendar (matches the live clock)', () => {
  const { r } = run();
  assert.equal(r.byDay[0].day, 1);
  assert.ok(r.byDay[0].byCh.email > 0, 'day 1 = launch day in Moscow time');
  assert.equal(Object.keys(r.byDay[5].byCh).length, 0, 'day 6 is a Saturday: nothing is sent');
});

test('link detection ignores e-mail addresses and dotted words', () => {
  assert.equal(Engine.hasLink('write to alex@relay.io please'), false);
  assert.equal(Engine.hasLink('Relay.Company is great'), false);
  assert.equal(Engine.hasLink('see relay.app/case'), true);
  assert.equal(Engine.hasLink('https://x.y/z?c=1'), true);
  assert.equal(Engine.stripLinks('Найдётся 15 минут? Кейс: relay.app/case'), 'Найдётся 15 минут?');
  assert.equal(Engine.stripLinks('See https://relay.app/case now'), 'See now');
});
