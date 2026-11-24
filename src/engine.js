/**
 * Relay Engine — a deterministic discrete-event simulator of a multichannel
 * outreach sequence.
 *
 * The engine is pure and DOM-free. The very same module powers:
 *   - the live campaign monitor (playback of the event timeline),
 *   - the PRO-mode forecast (dry-run of the current settings),
 *   - the Node unit tests in /tests.
 *
 * Time model: integer minutes since Monday 00:00 UTC of the launch week.
 * Timezones are fixed UTC offsets (DST is intentionally ignored in the prototype).
 *
 * All "under the hood" protections live here, so the UI only has to *show* them:
 *   - auto-stop of the whole chain on a reply in ANY channel,
 *   - sending only inside the recipient's working hours (by phone-code timezone),
 *   - messenger cascade WhatsApp → Telegram → Signal → SMS,
 *   - per-mailbox / per-number / per-account daily limits with rotation,
 *   - no links in the first messenger message (anti-ban),
 *   - branching conditions: opened / not opened / clicked / no reply.
 */
const Engine = (() => {
  'use strict';

  const DAY = 1440;
  /** The sender works in Moscow time (UTC+3). */
  const SENDER_TZ = 3;
  /** Launch moment: Monday 10:00 sender time → 07:00 UTC. */
  const LAUNCH_T = 10 * 60 - SENDER_TZ * 60;
  /** Minutes between two consecutive leads — human-like throttling. */
  const STAGGER = 3;
  const MESSENGERS = ['whatsapp', 'telegram', 'signal'];
  const CASCADE_DEFAULT = ['whatsapp', 'telegram', 'signal', 'sms'];

  /** Typing-simulation delay multipliers. */
  const TYPING_SPEED = { slow: 1.6, human: 1, fast: 0.5 };

  /** Relative likelihood that a message gets read, per channel. */
  const READ_FACTOR = { email: 1, linkedin: 0.9, whatsapp: 1.25, telegram: 1.2, signal: 1.2, sms: 1.1 };
  /** Relative likelihood of a human reply, per channel. */
  const REPLY_FACTOR = { email: 1, linkedin: 0.8, whatsapp: 1.5, telegram: 1.4, signal: 1.3, sms: 0.8 };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  /** Small, fast, seedable PRNG (mulberry32). Same seed → same campaign. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  /* ------------------------------------------------------------------ */
  /* Timezone detection by phone code (longest prefix wins)              */
  /* ------------------------------------------------------------------ */

  const PHONE_TZ = [
    ['+7495', 3, 'moscow'], ['+7499', 3, 'moscow'], ['+7812', 3, 'spb'], ['+7343', 5, 'ekb'],
    ['+7383', 7, 'nsk'], ['+7727', 5, 'almaty'], ['+77', 5, 'almaty'], ['+7', 3, 'moscow'],
    ['+49', 1, 'berlin'], ['+44', 0, 'london'], ['+971', 4, 'dubai'], ['+33', 1, 'paris'],
    ['+34', 1, 'madrid'], ['+90', 3, 'istanbul'], ['+374', 4, 'yerevan'], ['+995', 4, 'tbilisi'],
    ['+381', 1, 'belgrade'], ['+81', 9, 'tokyo'], ['+65', 8, 'singapore'],
    ['+1212', -5, 'ny'], ['+1646', -5, 'ny'], ['+1917', -5, 'ny'], ['+1312', -6, 'chicago'],
    ['+1415', -8, 'sf'], ['+1650', -8, 'sf'], ['+1310', -8, 'la'], ['+1213', -8, 'la'], ['+1', -5, 'ny'],
    ['+5511', -3, 'saopaulo'], ['+55', -3, 'saopaulo'],
  ].map(([prefix, tz, city]) => ({ prefix, tz, city }));

  /**
   * Resolve a timezone from a phone number. Works on area codes where a country
   * spans several zones (+7 383 → Novosibirsk UTC+7, +1 415 → San Francisco UTC−8).
   * @returns {{prefix:string,tz:number,city:string}|null}
   */
  function tzFromPhone(phone) {
    const digits = '+' + String(phone || '').replace(/\D/g, '');
    if (digits.length < 4) return null;
    let best = null;
    for (const e of PHONE_TZ) {
      if (digits.startsWith(e.prefix) && (!best || e.prefix.length > best.prefix.length)) best = e;
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Text helpers: SMS segments, link detection                          */
  /* ------------------------------------------------------------------ */

  const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM7_EXT = '^{}\\[~]|€';

  /**
   * SMS segmentation. Latin text uses GSM-7 (160 chars per SMS); any Cyrillic
   * or emoji switches the whole message to UCS-2 (70 chars per SMS).
   */
  function smsInfo(text) {
    const s = String(text || '');
    let gsm = true;
    let gsmLen = 0;
    for (const ch of s) {
      if (GSM7_BASIC.includes(ch)) gsmLen += 1;
      else if (GSM7_EXT.includes(ch)) gsmLen += 2;
      else { gsm = false; break; }
    }
    const length = gsm ? gsmLen : s.length; // UCS-2 counts UTF-16 code units
    const single = gsm ? 160 : 70;
    const multi = gsm ? 153 : 67;
    const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
    return { encoding: gsm ? 'GSM-7' : 'UCS-2', length, perSegment: single, segments };
  }

  // A URL, or a bare domain with a known TLD. The look-behind keeps e-mail
  // addresses (alex@relay.io) and dotted words (Relay.Company) from matching.
  const LINK_SRC = '(?:https?:\\/\\/|www\\.)[^\\s<]+|(?<![@\\w.-])[a-z0-9][a-z0-9-]*\\.(?:com|io|ru|app|co|net|org|me|ai|dev)\\b(?:\\/[^\\s<]*)?';
  const LINK_TEST = new RegExp(LINK_SRC, 'i');
  const hasLink = (text) => LINK_TEST.test(String(text || ''));
  const findLinks = (text) => String(text || '').match(new RegExp(LINK_SRC, 'gi')) || [];
  /** Remove links and tidy whitespace — used for the "no links in the first message" rule. */
  const stripLinks = (text) => String(text || '')
    .replace(new RegExp(LINK_SRC, 'gi'), '')
    .replace(/[ \t]+([.,!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  /* ------------------------------------------------------------------ */
  /* Working-hours math                                                  */
  /* ------------------------------------------------------------------ */

  /** Local calendar info for a UTC minute in a fixed-offset timezone. dow: 0 = Monday. */
  function localInfo(t, tz) {
    const l = t + tz * 60;
    const day = Math.floor(l / DAY);
    const min = l - day * DAY;
    return { day, dow: ((day % 7) + 7) % 7, min, hh: Math.floor(min / 60), mm: min % 60 };
  }

  function inWindow(t, tz, rules) {
    const i = localInfo(t, tz);
    if (rules.skipWeekends && i.dow >= 5) return false;
    return i.min >= rules.workStart * 60 && i.min < rules.workEnd * 60;
  }

  /** The earliest moment ≥ t that falls into the recipient's working window. */
  function nextWindow(t, tz, rules) {
    const ws = rules.workStart * 60;
    const we = rules.workEnd * 60;
    let l = t + tz * 60;
    for (let guard = 0; guard < 21; guard++) {
      const day = Math.floor(l / DAY);
      const min = l - day * DAY;
      const dow = ((day % 7) + 7) % 7;
      const weekend = rules.skipWeekends && dow >= 5;
      if (!weekend && min >= ws && min < we) return l - tz * 60;
      l = !weekend && min < ws ? day * DAY + ws : (day + 1) * DAY + ws;
    }
    return t; // unreachable with sane rules
  }

  /** Daily capacity of a mailbox, taking the warm-up ramp into account. */
  function emailCap(mailbox, campaignDay, cfg) {
    if (!cfg.warmup || !cfg.warmup.enabled) return cfg.dailyLimit;
    return Math.min(cfg.dailyLimit, cfg.warmup.start + cfg.warmup.step * (mailbox.ageDays + campaignDay));
  }

  /** Which previous steps can be referenced by a branching condition. */
  function conditionSupport(step, campaign) {
    const ch = step.channel;
    const CH = campaign.channels;
    const readable = ch === 'email' ? !!CH.email.trackOpens : ch === 'messenger' || MESSENGERS.includes(ch) || (ch === 'linkedin' && step.kind === 'message');
    const clickable = hasLink(step.text) && (ch !== 'email' || !!CH.email.trackClicks) && !(isFirstMessengerStep(step, campaign) && messengerNoLinks(step, campaign));
    return { readable, clickable };
  }

  function isFirstMessengerStep(step, campaign) {
    const first = [...campaign.steps].sort((a, b) => a.day - b.day)
      .find((s) => s.channel === 'messenger' || MESSENGERS.includes(s.channel));
    return !!first && first.id === step.id;
  }

  function messengerNoLinks(step, campaign) {
    const CH = campaign.channels;
    if (step.channel === 'messenger') return MESSENGERS.every((m) => CH[m].noLinksFirst);
    return MESSENGERS.includes(step.channel) ? !!CH[step.channel].noLinksFirst : false;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Run the whole campaign and return its full event timeline.
   * @param {object} campaign  {leads, steps, rules, channels}
   * @param {{seed?:number,startT?:number,replyText?:(intent:string,variant:number,channel:string)=>string}} [opts]
   *        replyText lets the engine match inbound text against the campaign stop words.
   */
  function simulate(campaign, opts = {}) {
    const seed = (opts.seed ?? 42) >>> 0;
    const R = mulberry32(seed);
    const rand = (a, b) => a + Math.floor(R() * (b - a + 1));
    const rules = campaign.rules;
    const CH = campaign.channels;
    const leads = campaign.leads || [];
    const steps = (campaign.steps || [])
      .map((s, i) => ({ ...s, _i: i }))
      .sort((a, b) => a.day - b.day || a._i - b._i);
    const startT = opts.startT ?? LAUNCH_T;
    const startDay = Math.floor(startT / DAY);

    const events = [];
    let seq = 0;
    const emit = (t, lead, type, meta) => {
      const ev = { t: Math.round(t), seq: seq++, lead: lead ? lead.id : null, type };
      if (meta) Object.assign(ev, meta);
      events.push(ev);
      return ev;
    };

    // Priority queue as a sorted array (stable for equal timestamps).
    const queue = [];
    const push = (job) => {
      let lo = 0;
      let hi = queue.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (queue[m].t <= job.t) lo = m + 1; else hi = m;
      }
      queue.splice(lo, 0, job);
    };

    const usage = Object.create(null);
    const used = (k) => usage[k] || 0;
    const take = (k) => { usage[k] = used(k) + 1; };
    const cursor = Object.create(null); // round-robin cursors per resource pool
    const rotationLogged = new Set();
    const cascadeOrder = (rules.cascade || CASCADE_DEFAULT.map((id) => ({ id, on: true })))
      .filter((c) => c.on).map((c) => c.id);
    const S = new Map(); // runtime state per lead

    leads.forEach((lead, i) => {
      S.set(lead.id, {
        stopped: false, bounced: false, unsub: false, connected: false, invited: false,
        touches: 0, oooSent: false, msgFirst: Object.create(null), hist: Object.create(null), attempts: Object.create(null),
        pending: new Set(steps.map((s) => s.id)), // steps not yet resolved (sent / skipped) for this lead
      });
      for (const step of steps) {
        const t = nominalTime(step, lead, i);
        push({ t, kind: 'step', lead, step });
        if (step.channel === 'linkedin' && step.kind !== 'message' && (CH.linkedin.likeWarmup || CH.linkedin.viewProfile)) {
          const lt = Math.max(startT + i * STAGGER, t - (CH.linkedin.warmupDays || 0) * DAY - 120);
          push({ t: lt, kind: 'like', lead, step });
        }
      }
    });

    function nominalTime(step, lead, i) {
      const base = startT + (step.day - 1) * DAY;
      if (step.sendAt === 'auto' || step.sendAt == null || step.sendAt === '') return base + i * STAGGER + rand(0, 2);
      const dayStart = Math.floor(base / DAY) * DAY;
      const t = dayStart + Number(step.sendAt) * 60 - lead.tz * 60 + (i % 20) * 2;
      return Math.max(t, startT + i * STAGGER);
    }

    function reachable(lead, c, st) {
      if (st.unsub) return false;
      switch (c) {
        case 'email': return !!lead.has.email && !st.bounced;
        case 'linkedin': return !!lead.has.linkedin;
        case 'whatsapp': case 'telegram': case 'signal': return !!lead.has[c];
        case 'sms': case 'call': return !!lead.has.phone;
        default: return false;
      }
    }

    /** SMS and calls follow the phone-code timezone only when tz-by-code is on; otherwise sender time. */
    function tzFor(lead, channel) {
      return (channel === 'sms' || channel === 'call') && CH.sms.tzByCode === false ? SENDER_TZ : lead.tz;
    }

    function checkCondition(step, st) {
      if (!step.condition || step.condition === 'no_reply' || !step.ref) return { ok: true };
      const h = st.hist[step.ref];
      // The referenced step may itself be delayed (limits, weekend): wait for it instead of skipping.
      if (!h) return st.pending.has(step.ref) ? { ok: false, wait: true } : { ok: false, reason: 'ref_not_sent' };
      switch (step.condition) {
        case 'opened': return h.opened ? { ok: true } : { ok: false, reason: 'not_opened' };
        case 'not_opened': return !h.opened ? { ok: true } : { ok: false, reason: 'opened' };
        case 'clicked': return h.clicked ? { ok: true } : { ok: false, reason: 'not_clicked' };
        default: return { ok: true };
      }
    }

    /** Take a sending resource (mailbox, number, account quota) or return null if limits are exhausted. */
    function acquire(channel, step, t, lead) {
      const day = Math.floor(t / DAY);
      if (channel === 'email') {
        const cfg = CH.email;
        const pool = cfg.mailboxes.filter((m) => m.enabled);
        if (!pool.length) return null;
        const start = cursor.email || 0;
        const order = cfg.rotation === 'health'
          ? [...pool].sort((a, b) => b.health - a.health)
          : pool.map((_, k) => pool[(start + k) % pool.length]);
        for (let k = 0; k < order.length; k++) {
          const m = order[k];
          const key = `mb:${m.id}:${day}`;
          if (used(key) < emailCap(m, day - startDay, cfg)) {
            take(key);
            if (cfg.rotation !== 'health') cursor.email = (pool.indexOf(m) + 1) % pool.length;
            let rotatedFrom = null;
            const logKey = `${order[0].id}:${day}`;
            if (k > 0 && !rotationLogged.has(logKey)) { rotationLogged.add(logKey); rotatedFrom = order[0].address; }
            return { label: m.address, key, rotatedFrom };
          }
        }
        return null;
      }
      if (channel === 'linkedin') {
        const invite = step.kind !== 'message';
        const key = `li:${invite ? 'inv' : 'msg'}:${day}`;
        const cap = invite ? CH.linkedin.inviteLimit : (CH.linkedin.messageLimit || 50);
        if (used(key) >= cap) return null;
        take(key);
        return { label: invite ? 'invite' : 'message', key };
      }
      if (MESSENGERS.includes(channel)) {
        const cfg = CH[channel];
        const pool = cfg.numbers;
        const start = cursor[channel] || 0;
        for (let k = 0; k < pool.length; k++) {
          const idx = (start + k) % pool.length;
          const key = `num:${channel}:${pool[idx].id}:${day}`;
          if (used(key) < cfg.dailyPerNumber) {
            take(key);
            cursor[channel] = (idx + 1) % pool.length;
            return { label: pool[idx].label, key };
          }
        }
        return null;
      }
      if (channel === 'sms') {
        const key = `sms:${day}`;
        if (used(key) >= CH.sms.dailyLimit) return null;
        take(key);
        return { label: CH.sms.senderId, key };
      }
      if (channel === 'call') {
        const key = `call:${day}`;
        if (used(key) >= (CH.call.dailyLimit || 120)) return null;
        take(key);
        const ids = CH.call.callerIds || {};
        const label = CH.call.localPresence ? (ids[lead.city] || ids.default) : ids.default;
        return { label, key };
      }
      return null;
    }

    function richMedia(channel) {
      const cfg = CH[channel];
      if (channel === 'telegram' && cfg.videoNotes) return 'circle';
      return cfg.voiceNotes ? 'voice' : null;
    }

    /** People reply while awake (08:00–22:00 local), not at 3 AM. */
    function wakingTime(t, tz) {
      const i = localInfo(t, tz);
      if (i.min >= 8 * 60 && i.min < 22 * 60) return t;
      const dayStartLocal = (i.min < 8 * 60 ? i.day : i.day + 1) * DAY;
      return dayStartLocal + 8 * 60 - tz * 60 + rand(10, 150);
    }

    function altChannel(lead, channel, st) {
      const pref = ['email', 'telegram', 'whatsapp', 'linkedin'];
      return pref.find((c) => c !== channel && reachable(lead, c, st)) || channel;
    }

    function onLike(job) {
      const { lead } = job;
      if (!lead.has.linkedin) return;
      if (!inWindow(job.t, lead.tz, rules)) {
        push({ ...job, t: nextWindow(job.t, lead.tz, rules) + rand(5, 60) });
        return;
      }
      if (CH.linkedin.viewProfile) emit(job.t, lead, 'view', { channel: 'linkedin', step: job.step.id });
      if (CH.linkedin.likeWarmup) emit(job.t + 1, lead, 'like', { channel: 'linkedin', step: job.step.id });
    }

    function onStep(job, st) {
      const { lead, step } = job;

      // 1) Branching condition — evaluated once, at the nominal time of the step.
      const resolve = () => st.pending.delete(step.id);
      if (!job.checked) {
        const verdict = checkCondition(step, st);
        // Re-check twice a day for up to 3 weeks (the campaign horizon), then give up.
        if (verdict.wait && (job.waits || 0) < 42) {
          push({ ...job, t: job.t + DAY / 2, waits: (job.waits || 0) + 1 });
          return;
        }
        if (!verdict.ok) {
          emit(job.t, lead, 'skip', { step: step.id, channel: step.channel, reason: verdict.reason || 'ref_not_sent', ref: step.ref });
          resolve();
          return;
        }
        job.checked = true;
      }

      // 2) Working hours in the recipient's timezone (sender time for SMS/calls if tz-by-code is off).
      const tz = tzFor(lead, step.channel);
      if (!inWindow(job.t, tz, rules)) {
        const until = nextWindow(job.t, tz, rules) + rand(4, 45);
        const info = localInfo(job.t, lead.tz);
        emit(job.t, lead, 'deferred', {
          step: step.id, channel: step.channel, until, local: info.min,
          reason: rules.skipWeekends && info.dow >= 5 ? 'weekend' : 'night',
        });
        push({ ...job, t: until });
        return;
      }

      // 3) Channel resolution: messenger cascade or a fixed channel.
      let channel = step.channel;
      let tried = null;
      if (channel === 'messenger') {
        const found = cascadeOrder.find((c) => reachable(lead, c, st));
        if (!found) { emit(job.t, lead, 'no_channel', { step: step.id, channel: 'messenger' }); resolve(); return; }
        const pos = cascadeOrder.indexOf(found);
        if (pos > 0) tried = cascadeOrder.slice(0, pos);
        channel = found;
      } else if (!reachable(lead, channel, st)) {
        emit(job.t, lead, 'skip', { step: step.id, channel, reason: channel === 'email' && st.bounced ? 'bounced' : 'no_contact' });
        resolve();
        return;
      }
      if (channel === 'linkedin' && step.kind === 'message' && !st.connected) {
        emit(job.t, lead, 'skip', { step: step.id, channel, reason: 'not_connected' });
        resolve();
        return;
      }
      if (channel === 'linkedin' && step.kind !== 'message' && st.invited) {
        emit(job.t, lead, 'skip', { step: step.id, channel, reason: 'already_invited' });
        resolve();
        return;
      }

      // 4) Rate limits & resource rotation.
      const res = acquire(channel, step, job.t, lead);
      if (!res) {
        const day = Math.floor(job.t / DAY);
        const until = nextWindow((day + 1) * DAY, tz, rules) + rand(4, 60);
        emit(job.t, lead, 'limit', { step: step.id, channel, until });
        push({ ...job, t: until });
        return;
      }
      if (tried) emit(job.t, lead, 'cascade', { step: step.id, channel, tried });
      if (res.rotatedFrom) emit(job.t, lead, 'rotation', { step: step.id, channel, from: res.rotatedFrom, to: res.label });
      st.touches++;
      resolve();
      const offHours = !inWindow(job.t, lead.tz, rules); // only possible when tz-by-code is off

      if (channel === 'call') { onCall(job, st, res, offHours); return; }

      // 5) Messenger safety: links in the first message, typing, rich media.
      const isMsgr = MESSENGERS.includes(channel);
      const link = hasLink(step.text);
      const linkStripped = isMsgr && !st.msgFirst[channel] && link && !!CH[channel].noLinksFirst;
      emit(job.t, lead, 'send', {
        step: step.id, channel, via: res.label, kind: step.kind || 'message',
        typing: isMsgr && CH[channel].typing ? Math.max(1, Math.round(rand(3, 12) * (TYPING_SPEED[CH[channel].typingSpeed] || 1))) : 0,
        media: isMsgr ? richMedia(channel) : null,
        linkStripped, offHours, local: localInfo(job.t, lead.tz).min,
      });
      if (linkStripped) emit(job.t, lead, 'link_stripped', { step: step.id, channel });
      st.msgFirst[channel] = true;
      if (channel === 'linkedin' && step.kind !== 'message') st.invited = true;
      const hist = { channel, t: job.t, opened: false, clicked: false, link: link && !linkStripped };
      st.hist[step.id] = hist;
      scheduleOutcomes(job, st, channel, hist);
    }

    function scheduleOutcomes(job, st, channel, hist) {
      const { lead, step, t } = job;
      const P = lead.persona;
      if (channel === 'email' && !lead.emailValid) {
        push({ t: t + rand(1, 4), kind: 'outcome', type: 'bounce', lead, step });
        return;
      }
      const isInvite = channel === 'linkedin' && step.kind !== 'message';
      // A like and a profile view before the invite make the name familiar.
      const acceptP = clamp01(P.accept * (CH.linkedin.likeWarmup ? 1.15 : 1) * (CH.linkedin.viewProfile ? 1.08 : 1));
      if (isInvite && R() < acceptP) push({ t: t + rand(90, 2200), kind: 'outcome', type: 'accepted', lead, step });

      // HTML emails land in "Promotions" more often than plain text.
      const formatFactor = channel === 'email' && !CH.email.plainText ? 0.88 : 1;
      const reads = !isInvite && R() < clamp01(P.open * (READ_FACTOR[channel] || 1) * formatFactor);
      const readT = t + rand(6, 540);
      if (reads) {
        const observable = channel === 'email' ? !!CH.email.trackOpens : MESSENGERS.includes(channel) || channel === 'linkedin';
        push({ t: readT, kind: 'outcome', type: 'open', lead, step, observable });
        if (hist.link && R() < P.click) {
          const clickObservable = channel !== 'email' || !!CH.email.trackClicks;
          push({ t: readT + rand(1, 25), kind: 'outcome', type: 'click', lead, step, observable: clickObservable });
        }
      }

      const boost = 1 + 0.18 * (st.touches - 1); // persistence pays off a little
      const pReply = P.reply * (REPLY_FACTOR[channel] || 1) * (reads || isInvite ? 1 : 0.2) * boost;
      if (R() < pReply) {
        const rt = wakingTime((reads ? readT : t) + rand(12, 900), lead.tz);
        const replyCh = R() > 0.78 ? altChannel(lead, channel, st) : channel;
        push({ t: rt, kind: 'outcome', type: 'reply', lead, step, channel: replyCh });
      } else if (channel === 'email' && lead.ooo && !st.oooSent) {
        st.oooSent = true;
        push({ t: t + rand(1, 3), kind: 'outcome', type: 'auto_reply', lead, step, channel: 'email' });
      }
    }

    function onCall(job, st, res, offHours) {
      const { lead, step } = job;
      const C = CH.call;
      const P = lead.persona;
      const attempt = (st.attempts[step.id] = (st.attempts[step.id] || 0) + 1);
      emit(job.t, lead, 'call', { step: step.id, channel: 'call', via: res.label, localNumber: !!C.localPresence, attempt, offHours });
      st.hist[step.id] = { channel: 'call', t: job.t, opened: false, clicked: false, link: false };

      // Local caller ID noticeably lifts the pickup rate.
      const pickup = clamp01(0.34 * (C.localPresence ? 1.45 : 1) * (0.6 + P.open * 0.6));
      const r = R();
      if (r < pickup) {
        const minutes = rand(2, 7);
        const positive = P.intent === 'interested' ? R() < 0.8 : P.intent === 'question' ? R() < 0.35 : false;
        emit(job.t + 1, lead, 'call_talk', { step: step.id, channel: 'call', who: C.mode === 'manager' ? 'manager' : 'ai', voice: C.aiVoice, minutes });
        const intent = positive ? 'interested' : (P.intent === 'negative' || P.intent === 'stop') ? 'negative' : 'later';
        if (positive && C.mode === 'hybrid') emit(job.t + minutes, lead, 'transfer', { step: step.id, channel: 'call', manager: C.transferTo });
        push({ t: job.t + minutes + 1, kind: 'outcome', type: 'reply', lead, step, channel: 'call', intent, meeting: positive });
        return;
      }
      if (r < pickup + 0.4) {
        if (!C.amd) {
          emit(job.t + 1, lead, 'machine', { step: step.id, channel: 'call', seconds: rand(25, 50) });
          return;
        }
        emit(job.t + 1, lead, 'amd', { step: step.id, channel: 'call', action: C.amdAction });
        if (C.amdAction === 'retry' && attempt < C.maxAttempts) {
          push({ ...job, t: job.t + DAY + rand(-40, 40), checked: true, retry: true });
        } else if (C.amdAction === 'sms' && reachable(lead, 'sms', st)) {
          // The follow-up SMS goes through the same daily SMS quota as any other SMS.
          const sms = acquire('sms', step, job.t, lead);
          if (sms) emit(job.t + 2, lead, 'send', { step: step.id, channel: 'sms', via: sms.label, kind: 'call_followup', local: localInfo(job.t, lead.tz).min });
        }
        return;
      }
      emit(job.t + 1, lead, 'no_answer', { step: step.id, channel: 'call', attempt });
      if (attempt < C.maxAttempts) push({ ...job, t: job.t + rand(180, 300), checked: true, retry: true });
    }

    /** Which campaign stop word (if any) the inbound text contains. */
    function stopWordIn(intent, variant, channel) {
      const words = (CH.sms.stopWords || []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
      if (!words.length || channel === 'call') return null;
      if (!opts.replyText) return intent === 'stop' ? words[0] : null; // headless callers without texts
      const text = String(opts.replyText(intent, variant, channel) || '').toLowerCase();
      return words.find((w) => text.includes(w)) || null;
    }

    function stopLead(t, lead, st, reason, channel) {
      st.stopped = true;
      let cancelled = 0;
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i];
        if (j.lead.id === lead.id && j.kind !== 'outcome') {
          if (j.kind === 'step' && !j.retry) cancelled++; // a call retry is not a separate step
          queue.splice(i, 1);
        }
      }
      emit(t, lead, 'auto_stop', { reason, channel, cancelled });
    }

    function onOutcome(job, st) {
      const { lead, step } = job;
      const h = st.hist[step.id];
      switch (job.type) {
        case 'open':
          if (job.observable && !st.stopped) { h.opened = true; emit(job.t, lead, 'open', { step: step.id, channel: h.channel }); }
          break;
        case 'click':
          if (job.observable && !st.stopped) { h.clicked = true; h.opened = true; emit(job.t, lead, 'click', { step: step.id, channel: h.channel }); }
          break;
        case 'accepted':
          st.connected = true;
          if (!st.stopped) emit(job.t, lead, 'accepted', { step: step.id, channel: 'linkedin' });
          break;
        case 'bounce':
          st.bounced = true;
          emit(job.t, lead, 'bounce', { step: step.id, channel: 'email', fallback: !!rules.bounceFallback });
          if (!rules.bounceFallback && !st.stopped) stopLead(job.t, lead, st, 'bounce', 'email');
          break;
        case 'auto_reply':
          if (st.stopped) break;
          emit(job.t, lead, 'auto_reply', { step: step.id, channel: 'email', ignored: !!rules.ignoreAutoReply });
          if (!rules.ignoreAutoReply) stopLead(job.t, lead, st, 'auto_reply', 'email');
          break;
        case 'reply': {
          if (st.stopped) break;
          const intent = job.intent || lead.persona.intent;
          const variant = lead.persona.variant || 0;
          emit(job.t, lead, 'reply', { step: step.id, channel: job.channel, intent, variant });
          const word = stopWordIn(intent, variant, job.channel);
          if (word) { st.unsub = true; emit(job.t, lead, 'unsubscribe', { channel: job.channel, word }); }
          if (job.meeting) emit(job.t + 1, lead, 'meeting', { channel: job.channel, manager: CH.call.transferTo });
          stopLead(job.t, lead, st, 'reply', job.channel);
          break;
        }
        default: break;
      }
    }

    let guard = 0;
    while (queue.length && guard++ < 200000) {
      const job = queue.shift();
      const st = S.get(job.lead.id);
      if (job.kind === 'outcome') { onOutcome(job, st); continue; }
      if (st.stopped) continue; // safety net: cancelled jobs are removed in stopLead()
      if (job.kind === 'like') { onLike(job); continue; }
      onStep(job, st);
    }

    return summarize({ seed, startT, events, steps, usage, leads });
  }

  /** Aggregate the raw timeline into forecast-friendly structures. */
  function summarize({ seed, startT, events, steps, usage, leads }) {
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
    // Days are counted in the sender's calendar — the same "Day N" the track and live clock show.
    const senderDay = (t) => Math.floor((t + SENDER_TZ * 60) / DAY);
    const startDay = senderDay(startT);
    const lastT = events.length ? events[events.length - 1].t : startT;
    const endT = Math.max(lastT + 30, startT + DAY);
    const days = Math.max(1, senderDay(endT) - startDay + 1);
    const byDay = Array.from({ length: days }, (_, d) => ({ day: d + 1, byCh: {}, sends: 0, deferred: 0, limit: 0, replies: 0 }));
    const stepStats = {};
    for (const s of steps) stepStats[s.id] = { sent: 0, skipped: 0, deferred: 0, limit: 0 };
    const stats = {
      leads: leads.length, sends: 0, contacted: 0, opens: 0, clicks: 0, humanReplies: 0, positive: 0,
      deferred: 0, night: 0, weekend: 0, limit: 0, cascades: 0, stripped: 0, stops: 0, cancelled: 0,
      skips: 0, bounces: 0, meetings: 0, amd: 0, unsub: 0, autoReplies: 0, rotations: 0, offHours: 0,
    };
    const contacted = new Set();
    for (const e of events) {
      const d = byDay[senderDay(e.t) - startDay];
      const ss = e.step ? stepStats[e.step] : null;
      switch (e.type) {
        case 'send': case 'call':
          stats.sends++; contacted.add(e.lead);
          if (e.offHours) stats.offHours++;
          if (d) { d.sends++; d.byCh[e.channel] = (d.byCh[e.channel] || 0) + 1; }
          if (ss && e.kind !== 'call_followup' && !(e.type === 'call' && e.attempt > 1)) ss.sent++;
          break;
        case 'open': stats.opens++; break;
        case 'click': stats.clicks++; break;
        case 'reply':
          stats.humanReplies++; if (d) d.replies++;
          if (e.intent === 'interested') stats.positive++;
          break;
        case 'deferred': stats.deferred++; stats[e.reason === 'weekend' ? 'weekend' : 'night']++; if (d) d.deferred++; if (ss) ss.deferred++; break;
        case 'limit': stats.limit++; if (d) d.limit++; if (ss) ss.limit++; break;
        case 'cascade': stats.cascades++; break;
        case 'link_stripped': stats.stripped++; break;
        case 'auto_stop': stats.stops++; stats.cancelled += e.cancelled || 0; break;
        case 'skip': case 'no_channel': stats.skips++; if (ss) ss.skipped++; break;
        case 'bounce': stats.bounces++; break;
        case 'meeting': stats.meetings++; break;
        case 'amd': stats.amd++; break;
        case 'unsubscribe': stats.unsub++; break;
        case 'auto_reply': stats.autoReplies++; break;
        case 'rotation': stats.rotations++; break;
        default: break;
      }
    }
    stats.contacted = contacted.size;
    return { seed, startT, endT, days, events, byDay, stepStats, stats, usage: { ...usage } };
  }

  /* ------------------------------------------------------------------ */
  /* Projection: what the world looks like at minute T                   */
  /* ------------------------------------------------------------------ */

  const LIGHT = { interested: 'green', question: 'yellow', later: 'yellow', negative: 'red', stop: 'red' };

  function upperBound(events, T) {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (events[m].t <= T) lo = m + 1; else hi = m;
    }
    return lo;
  }

  /**
   * Fold all events up to minute T into per-lead state and live metrics.
   * O(n) over visible events — cheap enough to recompute on every frame.
   */
  function project(result, T) {
    const n = upperBound(result.events, T);
    const leads = Object.create(null);
    const m = {
      sends: 0, contacted: 0, opened: 0, clicked: 0, replied: 0, green: 0, yellow: 0, red: 0,
      night: 0, weekend: 0, limit: 0, cascades: 0, stripped: 0, stops: 0, cancelled: 0,
      meetings: 0, amd: 0, bounces: 0, skips: 0, unsub: 0, rotations: 0,
    };
    const stepStats = Object.create(null);
    const lead = (id) => leads[id] || (leads[id] = {
      touches: 0, opened: false, clicked: false, reply: null, stop: null, last: null, lastSend: null, channels: [],
    });
    for (let i = 0; i < n; i++) {
      const e = result.events[i];
      const L = e.lead ? lead(e.lead) : null;
      if (L) L.last = e;
      switch (e.type) {
        case 'send': case 'call':
          m.sends++;
          if (L.touches === 0) m.contacted++;
          L.touches++; L.lastSend = e;
          if (!L.channels.includes(e.channel)) L.channels.push(e.channel);
          if (e.step && e.kind !== 'call_followup') {
            const ss = stepStats[e.step] || (stepStats[e.step] = { sent: 0 });
            if (!(e.type === 'call' && e.attempt > 1)) ss.sent++;
          }
          break;
        case 'open': if (!L.opened) { L.opened = true; m.opened++; } break;
        case 'click': if (!L.clicked) { L.clicked = true; m.clicked++; } break;
        case 'reply':
          if (!L.reply) { m.replied++; m[LIGHT[e.intent] || 'yellow']++; }
          L.reply = e;
          break;
        case 'auto_stop': m.stops++; m.cancelled += e.cancelled || 0; L.stop = e; break;
        case 'deferred': m[e.reason === 'weekend' ? 'weekend' : 'night']++; break;
        case 'limit': m.limit++; break;
        case 'cascade': m.cascades++; break;
        case 'link_stripped': m.stripped++; break;
        case 'meeting': m.meetings++; break;
        case 'amd': m.amd++; break;
        case 'bounce': m.bounces++; break;
        case 'skip': case 'no_channel': m.skips++; break;
        case 'unsubscribe': m.unsub++; break;
        case 'rotation': m.rotations++; break;
        default: break;
      }
    }
    return { n, T, leads, metrics: m, stepStats };
  }

  return {
    DAY, SENDER_TZ, LAUNCH_T, STAGGER, MESSENGERS, CASCADE_DEFAULT, LIGHT,
    mulberry32, tzFromPhone, smsInfo, hasLink, findLinks, stripLinks,
    localInfo, inWindow, nextWindow, emailCap, conditionSupport, isFirstMessengerStep,
    simulate, project, upperBound,
  };
})();

if (typeof module === 'object' && module && module.exports) module.exports = Engine;
