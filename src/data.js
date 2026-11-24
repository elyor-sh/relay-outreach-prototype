/**
 * Relay Data — demo audience, channel metadata, default campaign and the
 * template-based "AI" copywriter. Everything bilingual is stored as
 * [ru, en] tuples so translations always live side by side.
 *
 * Depends on: Engine (tzFromPhone, smsInfo).
 */
const Data = (() => {
  'use strict';

  /** Pick the right half of a [ru, en] tuple. */
  const L = (pair, lang) => (Array.isArray(pair) ? pair[lang === 'en' ? 1 : 0] : pair);

  /* ------------------------------------------------------------------ */
  /* Channels & geography                                                */
  /* ------------------------------------------------------------------ */

  const CHANNELS = {
    email: { color: '#6366F1' },
    linkedin: { color: '#0A66C2' },
    messenger: { color: '#10B981' },
    whatsapp: { color: '#22C55E' },
    telegram: { color: '#229ED9' },
    signal: { color: '#3A76F0' },
    sms: { color: '#F59E0B' },
    call: { color: '#EC4899' },
    phone: { color: '#EC4899' },
  };

  const CITIES = {
    moscow: { name: ['Москва', 'Moscow'], tz: 3, country: 'RU', code: '+7 495' },
    spb: { name: ['Санкт-Петербург', 'St Petersburg'], tz: 3, country: 'RU', code: '+7 812' },
    ekb: { name: ['Екатеринбург', 'Yekaterinburg'], tz: 5, country: 'RU', code: '+7 343' },
    nsk: { name: ['Новосибирск', 'Novosibirsk'], tz: 7, country: 'RU', code: '+7 383' },
    almaty: { name: ['Алматы', 'Almaty'], tz: 5, country: 'KZ', code: '+7 727' },
    berlin: { name: ['Берлин', 'Berlin'], tz: 1, country: 'DE', code: '+49 30' },
    london: { name: ['Лондон', 'London'], tz: 0, country: 'GB', code: '+44 20' },
    dubai: { name: ['Дубай', 'Dubai'], tz: 4, country: 'AE', code: '+971 4' },
    ny: { name: ['Нью-Йорк', 'New York'], tz: -5, country: 'US', code: '+1 212' },
    sf: { name: ['Сан-Франциско', 'San Francisco'], tz: -8, country: 'US', code: '+1 415' },
    saopaulo: { name: ['Сан-Паулу', 'São Paulo'], tz: -3, country: 'BR', code: '+55 11' },
    chicago: { name: ['Чикаго', 'Chicago'], tz: -6, country: 'US', code: '+1 312' },
    la: { name: ['Лос-Анджелес', 'Los Angeles'], tz: -8, country: 'US', code: '+1 310' },
    paris: { name: ['Париж', 'Paris'], tz: 1, country: 'FR', code: '+33' },
    madrid: { name: ['Мадрид', 'Madrid'], tz: 1, country: 'ES', code: '+34' },
    istanbul: { name: ['Стамбул', 'Istanbul'], tz: 3, country: 'TR', code: '+90' },
    yerevan: { name: ['Ереван', 'Yerevan'], tz: 4, country: 'AM', code: '+374' },
    tbilisi: { name: ['Тбилиси', 'Tbilisi'], tz: 4, country: 'GE', code: '+995' },
    belgrade: { name: ['Белград', 'Belgrade'], tz: 1, country: 'RS', code: '+381' },
    tokyo: { name: ['Токио', 'Tokyo'], tz: 9, country: 'JP', code: '+81' },
    singapore: { name: ['Сингапур', 'Singapore'], tz: 8, country: 'SG', code: '+65' },
  };

  /** Probability that a contact is reachable in a channel, by country. */
  const REACH = {
    RU: { email: 0.96, linkedin: 0.45, whatsapp: 0.78, telegram: 0.9, signal: 0.06 },
    KZ: { email: 0.95, linkedin: 0.5, whatsapp: 0.9, telegram: 0.85, signal: 0.05 },
    DE: { email: 0.97, linkedin: 0.85, whatsapp: 0.85, telegram: 0.2, signal: 0.3 },
    GB: { email: 0.97, linkedin: 0.9, whatsapp: 0.75, telegram: 0.15, signal: 0.25 },
    AE: { email: 0.95, linkedin: 0.85, whatsapp: 0.95, telegram: 0.3, signal: 0.1 },
    US: { email: 0.98, linkedin: 0.92, whatsapp: 0.3, telegram: 0.1, signal: 0.35 },
    BR: { email: 0.93, linkedin: 0.7, whatsapp: 0.98, telegram: 0.25, signal: 0.1 },
    XX: { email: 0.95, linkedin: 0.7, whatsapp: 0.7, telegram: 0.4, signal: 0.15 },
  };

  /* ------------------------------------------------------------------ */
  /* Demo audience (48 decision makers, 7 countries, 9 timezones)        */
  /* ------------------------------------------------------------------ */

  const NAMES = {
    ru: [['Мария Ковалёва', 'f'], ['Дмитрий Орлов', 'm'], ['Екатерина Лебедева', 'f'], ['Артём Козлов', 'm'],
      ['Ольга Никитина', 'f'], ['Сергей Волков', 'm'], ['Наталья Зайцева', 'f'], ['Павел Соколов', 'm'],
      ['Юлия Фёдорова', 'f'], ['Максим Егоров', 'm'], ['Ирина Павлова', 'f'], ['Никита Семёнов', 'm'],
      ['Татьяна Романова', 'f'], ['Роман Кузнецов', 'm'], ['Ксения Белова', 'f'], ['Денис Захаров', 'm'],
      ['Алина Громова', 'f'], ['Илья Миронов', 'm'], ['Андрей Тихонов', 'm'], ['Вера Степанова', 'f']],
    kz: [['Айгерим Касымова', 'f'], ['Ерлан Жумабаев', 'm'], ['Динара Сапарова', 'f'], ['Тимур Ахметов', 'm']],
    de: [['Lukas Becker', 'm'], ['Anna Schmidt', 'f'], ['Jonas Weber', 'm'], ['Lea Fischer', 'f'], ['Felix Wagner', 'm'], ['Mia Hoffmann', 'f'], ['Paul Schulz', 'm']],
    gb: [['Oliver Bennett', 'm'], ['Emily Carter', 'f'], ['James Walker', 'm'], ['Sophie Turner', 'f'], ['Harry Mitchell', 'm'], ['Charlotte Hughes', 'f']],
    ae: [['Omar Haddad', 'm'], ['Layla Mansour', 'f'], ['Yousef Khalil', 'm'], ['Sara Nasser', 'f']],
    us: [['Michael Reed', 'm'], ['Jessica Hall', 'f'], ['Ryan Cooper', 'm'], ['Ashley Parker', 'f'], ['Brandon Lee', 'm'], ['Rachel Kim', 'f']],
    br: [['Lucas Silva', 'm'], ['Beatriz Costa', 'f'], ['Rafael Souza', 'm']],
  };

  const COMPANIES = {
    ru: ['ЛогиТех', 'СеверСофт', 'Ритейл Про', 'Финполис', 'АгроЛайн', 'МедиаКуб', 'Облако24', 'ДатаМаркет',
      'Стройплатформа', 'ТрансЛоджик', 'Умный склад', 'Клиника Плюс', 'ЭдТех Лаб', 'ФудСити', 'ПромАвтоматика', 'ВолгаДата'],
    kz: ['Степь Диджитал', 'АлатауСофт', 'Каспий Лоджистик'],
    de: ['Kraftwerk Labs', 'Nordlicht GmbH', 'Fahrwerk Systems', 'Brückner Analytics', 'Elbe Commerce', 'Rheinwerk Health'],
    gb: ['Thameside Analytics', 'Brightwell & Co', 'Kestrel Cloud', 'Harbour Logistics', 'Pennine Retail'],
    ae: ['Falcon Ventures', 'Oasis Fintech', 'Dune Logistics', 'Marina Health'],
    us: ['Northwind Labs', 'Bluepeak Software', 'Summit Health', 'Redwood Retail', 'Lakeshore AI', 'Granite Payments'],
    br: ['Verde Pagamentos', 'Rio Commerce', 'Paulista Tech'],
  };

  const ROLES = ['CEO', 'Founder', 'COO', 'Head of Sales', 'Sales Director', 'VP Sales', 'CMO', 'Head of Growth', 'Head of Partnerships', 'RevOps Lead'];
  const TLD = { RU: 'ru', KZ: 'kz', DE: 'de', GB: 'co.uk', AE: 'ae', US: 'com', BR: 'com.br' };

  /** [city, count, name-pool] — the demo audience recipe (48 people in total). */
  const PLAN = [
    ['moscow', 12, 'ru'], ['spb', 3, 'ru'], ['ekb', 3, 'ru'], ['nsk', 3, 'ru'], ['almaty', 3, 'kz'],
    ['berlin', 6, 'de'], ['london', 5, 'gb'], ['dubai', 4, 'ae'], ['ny', 4, 'us'], ['sf', 2, 'us'], ['saopaulo', 3, 'br'],
  ];

  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const slug = (s) => String(s).toLowerCase().split('').map((c) => (TR[c] ?? c)).join('')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  const INTENTS = [['interested', 0.42], ['question', 0.24], ['later', 0.14], ['negative', 0.12], ['stop', 0.08]];

  function pickWeighted(rng, table) {
    let r = rng();
    for (const [v, w] of table) { if ((r -= w) < 0) return v; }
    return table[table.length - 1][0];
  }

  function persona(rng) {
    const prone = rng() < 0.4;
    return {
      open: 0.35 + rng() * 0.55,
      click: 0.18 + rng() * 0.4,
      reply: prone ? 0.2 + rng() * 0.25 : 0.008 + rng() * 0.03,
      accept: 0.25 + rng() * 0.5,
      intent: pickWeighted(rng, INTENTS),
      variant: Math.floor(rng() * 3),
    };
  }

  function digits(rng, n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(rng() * 10); return s; }

  function reachFor(country, rng) {
    const p = REACH[country] || REACH.XX;
    return {
      email: rng() < p.email, linkedin: rng() < p.linkedin, whatsapp: rng() < p.whatsapp,
      telegram: rng() < p.telegram, signal: rng() < p.signal, phone: true,
    };
  }

  /** Deterministic demo audience. Lead #1 is always «Анна Смирнова» for nicer previews. */
  function demoLeads() {
    const rng = Engine.mulberry32(7);
    const used = Object.fromEntries(Object.keys(NAMES).map((k) => [k, 0]));
    const usedCo = Object.fromEntries(Object.keys(COMPANIES).map((k) => [k, 0]));
    const rows = [];
    for (const [city, count, pool] of PLAN) {
      for (let k = 0; k < count; k++) rows.push({ city, pool });
    }
    // Deterministic shuffle so timezones are interleaved in the send order.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const first = rows.findIndex((r) => r.city === 'moscow');
    [rows[0], rows[first]] = [rows[first], rows[0]];

    return rows.map((row, i) => {
      const c = CITIES[row.city];
      const poolKey = row.pool;
      const [name, gender] = i === 0 ? ['Анна Смирнова', 'f'] : NAMES[poolKey][used[poolKey]++ % NAMES[poolKey].length];
      const coPool = COMPANIES[poolKey === 'kz' ? 'kz' : poolKey] || COMPANIES.us;
      const company = coPool[usedCo[poolKey]++ % coPool.length];
      const [firstName, lastName = ''] = name.split(' ');
      const phone = `${c.code} ${digits(rng, 3)} ${digits(rng, 4)}`;
      const has = reachFor(c.country, rng);
      if (i === 0) Object.assign(has, { email: true, whatsapp: true, telegram: true, linkedin: true });
      return {
        id: `L${String(i + 1).padStart(2, '0')}`,
        name, firstName, lastName, gender, company,
        role: ROLES[Math.floor(rng() * ROLES.length)],
        city: row.city, country: c.country, tz: Engine.tzFromPhone(phone)?.tz ?? c.tz, phone,
        email: `${slug(firstName)}.${slug(lastName)}@${slug(company)}.${TLD[c.country] || 'com'}`,
        has,
        emailValid: rng() > 0.05,
        ooo: rng() < 0.06,
        persona: persona(rng),
      };
    });
  }

  /** Build a lead from imported fields (CSV / pasted list). */
  function makeLead(fields, i) {
    const rng = Engine.mulberry32(hash(`${fields.email}|${fields.phone}|${fields.name}|${i}`));
    const phoneTz = Engine.tzFromPhone(fields.phone);
    const city = phoneTz ? phoneTz.city : 'moscow';
    const c = CITIES[city] || CITIES.moscow;
    const name = (fields.name || '').trim() || (fields.email ? fields.email.split('@')[0] : `Lead ${i + 1}`);
    const [firstName, ...rest] = name.split(/\s+/);
    const has = reachFor(c.country, rng);
    has.email = !!fields.email;
    has.phone = !!fields.phone;
    if (!has.phone) Object.assign(has, { whatsapp: false, telegram: false, signal: false });
    if (fields.linkedin) has.linkedin = true;
    return {
      id: `I${String(i + 1).padStart(3, '0')}`,
      name, firstName, lastName: rest.join(' '), gender: /[ая]$/i.test(firstName) ? 'f' : 'm',
      company: fields.company || '—', role: fields.role || '—',
      city, country: c.country, tz: phoneTz ? phoneTz.tz : c.tz, phone: fields.phone || '',
      email: fields.email || '', has, emailValid: rng() > 0.05, ooo: rng() < 0.05, persona: persona(rng),
    };
  }

  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const PHONE_RE = /\+?\d[\d\s\-()]{7,}\d/;

  /** Parse a CSV (comma / semicolon / tab) with a header row. */
  function parseCSV(text) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const delim = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
    const head = lines[0].split(delim).map((h) => h.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
    const idx = {
      name: col('name', 'имя', 'фио'), email: col('email', 'mail', 'почт'), phone: col('phone', 'тел', 'mobile'),
      company: col('company', 'компан', 'org'), role: col('title', 'role', 'должн'), linkedin: col('linkedin'),
    };
    const hasHeader = Object.values(idx).some((v) => v >= 0);
    if (!hasHeader) return parseList(text);
    return lines.slice(1).map((line, i) => {
      const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
      const get = (k) => (idx[k] >= 0 ? cells[idx[k]] || '' : '');
      return makeLead({ name: get('name'), email: get('email'), phone: get('phone'), company: get('company'), role: get('role'), linkedin: get('linkedin') }, i);
    }).filter((l) => l.email || l.phone);
  }

  /** Parse free-form lines like «Иван Петров, ivan@acme.ru, +7 495 123-45-67». */
  function parseList(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line, i) => {
      const email = (line.match(EMAIL_RE) || [''])[0];
      const phone = (line.match(PHONE_RE) || [''])[0].trim();
      const name = line.replace(email, '').replace(phone, '').replace(/[,;|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      return makeLead({ name, email, phone }, i);
    }).filter((l) => l.email || l.phone);
  }

  function coverage(leads) {
    const c = { email: 0, linkedin: 0, whatsapp: 0, telegram: 0, signal: 0, phone: 0, sms: 0, call: 0 };
    for (const l of leads) for (const k of ['email', 'linkedin', 'whatsapp', 'telegram', 'signal', 'phone']) if (l.has[k]) c[k]++;
    c.sms = c.call = c.phone;
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Default campaign                                                    */
  /* ------------------------------------------------------------------ */

  const CALLER_IDS = {
    moscow: '+7 495 120-45-18', spb: '+7 812 409-22-10', ekb: '+7 343 288-11-05', nsk: '+7 383 310-77-40',
    almaty: '+7 727 350-12-90', berlin: '+49 30 2290 4410', london: '+44 20 3807 1150', dubai: '+971 4 576 2210',
    ny: '+1 212 555 0148', sf: '+1 415 555 0192', saopaulo: '+55 11 4003 2210', default: '+7 495 120-45-18',
  };

  const MANAGERS = {
    oleg: { name: ['Олег Петров', 'Oleg Petrov'], status: 'online' },
    maria: { name: ['Мария Ким', 'Maria Kim'], status: 'busy' },
  };
  const VOICES = {
    alina: { name: ['Алина', 'Ava'], style: ['тёплый, спокойный', 'warm, calm'] },
    max: { name: ['Максим', 'Max'], style: ['деловой, уверенный', 'confident, crisp'] },
  };

  function defaultSteps() {
    const base = { kind: 'message', condition: 'no_reply', ref: null, sendAt: 'auto', subject: '', text: '' };
    return [
      { ...base, id: 's1', day: 1, channel: 'email', tpl: 'email_intro' },
      { ...base, id: 's2', day: 2, channel: 'linkedin', kind: 'invite', tpl: 'li_invite' },
      { ...base, id: 's3', day: 3, channel: 'messenger', tpl: 'msg_intro', condition: 'opened', ref: 's1' },
      { ...base, id: 's4', day: 4, channel: 'email', tpl: 'email_followup', condition: 'not_opened', ref: 's1' },
      { ...base, id: 's5', day: 5, channel: 'call', kind: 'call', tpl: 'call_script', condition: 'clicked', ref: 's1' },
      { ...base, id: 's6', day: 7, channel: 'sms', tpl: 'sms_reminder' },
    ];
  }

  function defaultChannels() {
    return {
      email: {
        rotation: 'round_robin', dailyLimit: 40, warmup: { enabled: true, start: 10, step: 4 },
        trackOpens: true, trackClicks: true, plainText: true,
        mailboxes: [
          { id: 'm1', address: 'alex@relay-mail.io', health: 98, ageDays: 64, enabled: true },
          { id: 'm2', address: 'alex@getrelay.io', health: 94, ageDays: 21, enabled: true },
          { id: 'm3', address: 'hello@tryrelay.co', health: 81, ageDays: 3, enabled: true },
        ],
      },
      linkedin: { likeWarmup: true, warmupDays: 1, viewProfile: true, inviteLimit: 20, messageLimit: 50, inviteNote: true, proxy: 'residential', proxyRegion: 'auto' },
      whatsapp: { noLinksFirst: true, typing: true, typingSpeed: 'human', voiceNotes: false, videoNotes: false, dailyPerNumber: 25, numbers: [{ id: 'w1', label: '+49 151 2290 0213' }, { id: 'w2', label: '+7 916 402-18-77' }] },
      telegram: { noLinksFirst: true, typing: true, typingSpeed: 'human', voiceNotes: false, videoNotes: true, dailyPerNumber: 30, numbers: [{ id: 't1', label: '@alex_relay' }, { id: 't2', label: '@relay_team' }] },
      signal: { noLinksFirst: true, typing: true, typingSpeed: 'human', voiceNotes: true, videoNotes: false, dailyPerNumber: 25, numbers: [{ id: 'g1', label: '+44 7700 900412' }] },
      sms: { singleSegment: true, tzByCode: true, stopWords: ['стоп', 'stop', 'отписаться', 'unsubscribe', 'не пишите'], senderId: 'Relay', dailyLimit: 300 },
      call: { localPresence: true, amd: true, amdAction: 'voicemail', mode: 'hybrid', aiVoice: 'alina', transferTo: 'oleg', maxAttempts: 2, recording: true, dailyLimit: 120, callerIds: { ...CALLER_IDS } },
    };
  }

  function defaultCampaign(lang) {
    return {
      name: L(['Демо-встречи · Q4', 'Demo meetings · Q4'], lang),
      leads: [], goal: '', tone: 'friendly', messagesReady: false, textsCustom: false,
      steps: defaultSteps(),
      rules: {
        workStart: 9, workEnd: 19, skipWeekends: true,
        bounceFallback: true, ignoreAutoReply: true,
        cascade: Engine.CASCADE_DEFAULT.map((id) => ({ id, on: true })),
      },
      channels: defaultChannels(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* "AI" copywriter: intent detection + channel-aware templates          */
  /* ------------------------------------------------------------------ */

  const QUICK_GOALS = [
    { label: ['Демо-звонок', 'Demo call'], text: ['Хочу договориться о 15-минутном демо-звонке, чтобы показать, как Relay экономит отделу продаж 10 часов в неделю', 'I want to book a 15-minute demo call to show how Relay saves a sales team 10 hours a week'] },
    { label: ['Партнёрство', 'Partnership'], text: ['Хотим обсудить партнёрство и совместные продажи для наших клиентов', 'We want to discuss a partnership and co-selling to our customers'] },
    { label: ['Пригласить на вебинар', 'Webinar invite'], text: ['Хочу пригласить на закрытый вебинар о том, как автоматизировать продажи с помощью ИИ', 'I want to invite you to a closed webinar on automating sales with AI'] },
    { label: ['Вернуть клиента', 'Win back'], text: ['Хочу вернуть бывших клиентов и показать, что изменилось в продукте за год', 'I want to win back former customers and show what changed in the product this year'] },
  ];

  /** What the simulated dictation "hears" when the Web Speech API is unavailable. */
  const VOICE_SAMPLE = [
    'Хочу договориться о коротком звонке на 15 минут, чтобы показать, как мы сокращаем время ответа клиентам в два раза',
    'I want to book a short 15-minute call to show how we cut customer response time in half',
  ];

  const SENDER = ['Алексей', 'Alex'];

  function detectIntent(goal) {
    const g = String(goal || '').toLowerCase();
    if (/партн|partner|co-sell|совместн/.test(g)) return 'partner';
    if (/вебинар|webinar|мероприят|event|конференц/.test(g)) return 'webinar';
    if (/вернуть|ушедш|бывш|win back|winback|former/.test(g)) return 'winback';
    return 'meeting';
  }

  /** Turn «Хочу договориться о звонке…» into a clause that fits the templates. */
  function goalClause(goal, lang) {
    let g = String(goal || '').trim().replace(/[.!\s]+$/, '');
    if (lang === 'en') {
      g = g.replace(/^(i|we)\s+(really\s+)?(want|would like|'d like|need|plan)\s+to\s+/i, '');
    } else {
      g = g.replace(/^(я\s+|мы\s+)?(очень\s+)?(хочу|хотим|хотел бы|хотела бы|хотелось бы|нужно|надо|планирую|планируем)\s+/i, '');
    }
    if (!g) g = L(['обсудить одну идею', 'discuss an idea'], lang);
    g = g.charAt(0).toLowerCase() + g.slice(1);
    const short = g.split(/[,;:—–]|\s(?:чтобы|to show|so that)\s/)[0].trim();
    return { full: g, short: short.length >= 8 ? short : g };
  }

  const CTA = {
    meeting: ['Найдётся 15 минут на этой неделе?', 'Would you have 15 minutes this week?'],
    partner: ['Удобно обсудить на коротком созвоне?', 'Open to a quick call to discuss?'],
    webinar: ['Забронировать для вас место?', 'Shall I save you a seat?'],
    winback: ['Покажу, что изменилось, — за 10 минут. Удобно?', 'Can I show you what changed? It takes 10 minutes.'],
  };
  const SUBJECT = {
    meeting: ['{{firstName}}, 15 минут для {{company}}?', '{{firstName}}, 15 minutes for {{company}}?'],
    partner: ['{{company}} × Relay: идея партнёрства', '{{company}} × Relay: a partnership idea'],
    webinar: ['{{firstName}}, приглашение на закрытый вебинар', '{{firstName}}, an invite to a closed webinar'],
    winback: ['{{firstName}}, мы многое изменили', '{{firstName}}, a lot has changed'],
  };
  const SMS = {
    // Kept under ~60 chars + name: a single Cyrillic name switches SMS to UCS-2 (70 chars).
    meeting: ['{{firstName}}, это {sender} из Relay. Созвонимся на 15 мин? Ответьте ДА', '{{firstName}}, it\'s {sender} (Relay). Quick 15-min call? Reply YES'],
    partner: ['{{firstName}}, это {sender} из Relay. Обсудим партнёрство? Ответьте ДА', '{{firstName}}, it\'s {sender} (Relay). Partnership chat? Reply YES'],
    webinar: ['{{firstName}}, место на вебинаре Relay ещё есть. Записать? Ответьте ДА', '{{firstName}}, your Relay webinar seat is held. Reply YES'],
    winback: ['{{firstName}}, это {sender} из Relay. Покажу новое за 10 мин? Ответьте ДА', '{{firstName}}, it\'s {sender} (Relay). 10 min on what\'s new? Reply YES'],
  };

  /** Personal greetings / sign-offs per tone. */
  const TONE = {
    friendly: { hi: ['Здравствуйте, {{firstName}}!', 'Hi {{firstName}},'], bye: ['Хорошего дня,\n{sender}', 'Have a great day,\n{sender}'] },
    business: { hi: ['Добрый день, {{firstName}}.', 'Good afternoon, {{firstName}}.'], bye: ['С уважением,\n{sender}, Relay', 'Best regards,\n{sender}, Relay'] },
    short: { hi: ['{{firstName}}, добрый день!', '{{firstName}}, hi!'], bye: ['— {sender}', '— {sender}'] },
  };

  /**
   * Compose drafts for every template slot. Channel rules are baked in:
   * no links in the first messenger message, SMS fits a single segment,
   * the LinkedIn note stays under 300 characters.
   */
  function composeDrafts({ goal, tone = 'friendly', lang = 'ru' }) {
    const intent = detectIntent(goal);
    const g = goalClause(goal, lang);
    const T = TONE[tone] || TONE.friendly;
    const sender = L(SENDER, lang);
    const fill = (s) => s.replace(/\{sender\}/g, sender);
    const ru = lang !== 'en';
    const cta = L(CTA[intent], lang);
    const subject = L(SUBJECT[intent], lang);

    const introBody = tone === 'short'
      ? (ru ? `${L(T.hi, lang)} Хочу ${g.full}. Кейс с цифрами: relay.app/case\n\n${cta}\n${L(T.bye, lang)}`
        : `${L(T.hi, lang)} I'd love to ${g.full}. Case study with numbers: relay.app/case\n\n${cta}\n${L(T.bye, lang)}`)
      : ru
        ? `${L(T.hi, lang)}\n\nМеня зовут {sender}, я из Relay. ${tone === 'business' ? `Цель письма — ${g.full}.` : `Хочу ${g.full}.`}\n\nКоротко, почему пишу именно вам: команды вроде {{company}} теряют часы на рутине, а мы помогаем вернуть это время. Пример с цифрами — в кейсе: relay.app/case\n\n${cta}\n\n${L(T.bye, lang)}`
        : `${L(T.hi, lang)}\n\nI'm {sender} from Relay. ${tone === 'business' ? `The purpose of this email: to ${g.full}.` : `I'd love to ${g.full}.`}\n\nWhy you: teams like {{company}} lose hours to routine work, and we help win that time back. A case study with numbers: relay.app/case\n\n${cta}\n\n${L(T.bye, lang)}`;

    const drafts = {
      email_intro: { subject, text: introBody },
      email_followup: {
        subject: ru ? 'Re: ' + subject : 'Re: ' + subject,
        text: ru
          ? `{{firstName}}, возвращаюсь к своему письму — вдруг оно потерялось среди других.\n\nЕсли коротко: хочу ${g.short}. ${cta}\n\n${L(T.bye, lang)}`
          : `{{firstName}}, following up on my email in case it got buried.\n\nIn short: I'd love to ${g.short}. ${cta}\n\n${L(T.bye, lang)}`,
      },
      li_invite: {
        text: ru
          ? `{{firstName}}, добрый день! Слежу за тем, как растёт {{company}}. Хочу ${g.short} — буду рад контакту.`
          : `{{firstName}}, hi! I've been following how {{company}} grows. I'd love to ${g.short} — happy to connect.`,
      },
      li_message: {
        text: ru
          ? `Спасибо, что приняли приглашение, {{firstName}}! Писал вам на почту: хочу ${g.short}. ${cta}`
          : `Thanks for connecting, {{firstName}}! I emailed you earlier: I'd love to ${g.short}. ${cta}`,
      },
      msg_intro: {
        text: ru
          ? `{{firstName}}, здравствуйте! Это {sender} из Relay, писал вам на почту. Хочу ${g.short}. ${cta}`
          : `{{firstName}}, hi! It's {sender} from Relay — I emailed you earlier. I'd love to ${g.short}. ${cta}`,
      },
      msg_followup: {
        text: ru
          ? `{{firstName}}, как обещал — короткий кейс: relay.app/case. ${cta}`
          : `{{firstName}}, as promised — a short case study: relay.app/case. ${cta}`,
      },
      sms_reminder: { text: L(SMS[intent], lang) },
      call_script: {
        text: ru
          ? `1. Приветствие: «{{firstName}}, добрый день! Это ассистент {sender} из Relay».\n2. Цель: ${g.full}.\n3. Вопрос: как сейчас это устроено в {{company}}?\n4. Если интересно — предложить слот или перевести на менеджера.\n5. Если «не сейчас» — уточнить, когда вернуться.`
          : `1. Greeting: “{{firstName}}, hi! This is {sender}'s assistant from Relay.”\n2. Goal: ${g.full}.\n3. Question: how does {{company}} handle this today?\n4. If interested — offer a slot or transfer to a manager.\n5. If “not now” — ask when to follow up.`,
      },
    };
    for (const d of Object.values(drafts)) {
      d.text = fill(d.text);
      if (d.subject) d.subject = fill(d.subject);
    }
    return { intent, drafts };
  }

  /** Default template slot for a newly added step. */
  const TPL_FOR_CHANNEL = {
    email: 'email_followup', linkedin: 'li_message', messenger: 'msg_followup', whatsapp: 'msg_followup',
    telegram: 'msg_followup', signal: 'msg_followup', sms: 'sms_reminder', call: 'call_script',
  };

  /** Replace {{vars}} with lead data. */
  function personalize(text, lead, lang) {
    if (!lead) return text || '';
    const city = CITIES[lead.city] ? L(CITIES[lead.city].name, lang) : '';
    // Function replacers: names like "A$&B" must never be treated as replacement patterns.
    return String(text || '')
      .replace(/\{\{\s*firstName\s*\}\}/g, () => lead.firstName)
      .replace(/\{\{\s*company\s*\}\}/g, () => lead.company)
      .replace(/\{\{\s*city\s*\}\}/g, () => city)
      .replace(/\{\{\s*role\s*\}\}/g, () => lead.role);
  }

  /* ------------------------------------------------------------------ */
  /* Inbound replies & AI insights                                       */
  /* ------------------------------------------------------------------ */

  const REPLIES = {
    interested: [
      ['Да, интересно. Давайте созвонимся в четверг после 14:00?', 'Yes, interesting. Can we talk on Thursday after 2 PM?'],
      ['Звучит любопытно — пришлите пару слотов на следующей неделе.', 'Sounds intriguing — send me a couple of slots next week.'],
      ['Можно, только коротко: 15 минут во вторник утром подойдёт?', 'Sure, but keep it short: does 15 minutes on Tuesday morning work?'],
    ],
    question: [
      ['А сколько это стоит для команды из 20 человек?', 'How much would it cost for a team of 20?'],
      ['Чем вы отличаетесь от того, что у нас уже стоит?', 'How are you different from what we already use?'],
      ['Напишите подробнее, я перешлю коллеге из продаж.', 'Send more details, I’ll forward it to our sales lead.'],
    ],
    later: [
      ['Сейчас не до этого, вернитесь ко мне в январе.', 'Not a good time — please come back in January.'],
      ['Интересно, но бюджет уже расписан. Давайте после нового года.', 'Interesting, but the budget is set. Let’s talk after New Year.'],
      ['Я в командировке до конца месяца, напишите позже.', 'I’m travelling until the end of the month, write later.'],
    ],
    negative: [
      ['Спасибо, но нам это не актуально.', 'Thanks, but this isn’t relevant for us.'],
      ['Нет, у нас всё устроено.', 'No, we’re all set.'],
      ['Не интересно.', 'Not interested.'],
    ],
    stop: [
      ['Стоп. Не пишите мне больше.', 'STOP. Please don’t write to me again.'],
      ['Отписаться', 'Unsubscribe'],
      ['Стоп', 'Stop'],
    ],
  };

  const CALL_SUMMARY = {
    interested: ['Разговор с ИИ-ассистентом: есть интерес, согласился на демо — звонок передан менеджеру.', 'Call with the AI assistant: interested, agreed to a demo — call handed over to a manager.'],
    later: ['Разговор: «сейчас некогда, наберите через пару недель».', 'Call: “busy right now, call me back in a couple of weeks”.'],
    negative: ['Разговор: вежливый отказ, интереса нет.', 'Call: a polite no, not interested.'],
  };

  const INSIGHT = {
    interested: { label: ['Интерес — готов к встрече', 'Interested — ready to meet'], summary: ['Просит слот для звонка. Ответьте в течение часа — конверсия выше в 3 раза.', 'Asks for a call slot. Reply within an hour — conversion is 3× higher.'], reply: ['Отлично, {{firstName}}! Предлагаю четверг в 14:30 или пятницу в 11:00 по вашему времени. Как удобнее?', 'Great, {{firstName}}! How about Thursday 2:30 PM or Friday 11 AM your time? Which works better?'] },
    question: { label: ['Вопрос — нужна информация', 'Question — needs info'], summary: ['Интерес есть, но сначала хочет понять цену и отличия. Отправьте кейс и тарифы.', 'Some interest, but wants pricing and differentiation first. Send a case study and pricing.'], reply: ['{{firstName}}, спасибо за вопрос! Для команды из 20 человек — тариф Team, детали и кейс прикладываю. Удобно разобрать за 10 минут на звонке?', 'Thanks for asking, {{firstName}}! For a team of 20 it’s our Team plan — details and a case study attached. Shall we go through it in a 10-minute call?'] },
    later: { label: ['Позже — вернуться', 'Later — follow up'], summary: ['Не отказ: просит вернуться позже. Поставьте напоминание и не давите.', 'Not a no: asks to come back later. Set a reminder and don’t push.'], reply: ['Понял, {{firstName}}, спасибо! Напишу вам в начале января. Хорошего завершения года!', 'Got it, {{firstName}}, thanks! I’ll reach out in early January. Have a great end of the year!'] },
    negative: { label: ['Отказ', 'Not interested'], summary: ['Вежливый отказ. Поблагодарите и закройте диалог — без дожима.', 'A polite no. Thank them and close the thread — no pressure.'], reply: ['Спасибо за ответ, {{firstName}}! Больше не буду беспокоить. Успехов {{company}}!', 'Thanks for letting me know, {{firstName}}! I won’t bother you again. All the best to {{company}}!'] },
    stop: { label: ['Стоп-слово — отписан', 'Stop word — unsubscribed'], summary: ['Автоматически отписан во всех каналах и добавлен в стоп-лист.', 'Automatically unsubscribed from every channel and added to the block list.'], reply: ['Вы отписаны. Извините за беспокойство.', 'You’re unsubscribed. Sorry for the trouble.'] },
  };

  /**
   * Inbound reply text in both languages — handed to the engine so stop words are
   * matched against what the person actually wrote, independent of the UI language.
   */
  function replyTextAll(intent, variant) {
    const pool = REPLIES[intent] || REPLIES.question;
    return pool[(variant || 0) % pool.length].join(' \n ');
  }

  return {
    replyTextAll,
    L, CHANNELS, CITIES, REACH, CALLER_IDS, MANAGERS, VOICES, QUICK_GOALS, VOICE_SAMPLE, SENDER,
    REPLIES, CALL_SUMMARY, INSIGHT, TPL_FOR_CHANNEL,
    demoLeads, makeLead, parseCSV, parseList, coverage, defaultCampaign, defaultSteps, defaultChannels,
    composeDrafts, detectIntent, goalClause, personalize, hash,
  };
})();

if (typeof module === 'object' && module && module.exports) module.exports = Data;
