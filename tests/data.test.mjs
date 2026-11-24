import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCampaign } from './_load.mjs';

const { Engine, Data } = demoCampaign();

test('demo audience: 48 leads, 7 countries, deterministic', () => {
  const a = Data.demoLeads();
  const b = Data.demoLeads();
  assert.equal(a.length, 48);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(new Set(a.map((l) => l.country)).size, 7);
  assert.equal(a[0].name, 'Анна Смирнова');
  for (const l of a) {
    assert.equal(Engine.tzFromPhone(l.phone).tz, l.tz, `${l.phone} → ${l.tz}`);
    assert.match(l.email, /^[a-z]+\.[a-z]+@[a-z0-9]+\.[a-z.]+$/);
  }
});

test('AI drafts respect channel rules', () => {
  for (const lang of ['ru', 'en']) {
    for (const g of Data.QUICK_GOALS) {
      for (const tone of ['friendly', 'business', 'short']) {
        const { drafts } = Data.composeDrafts({ goal: g.text[lang === 'en' ? 1 : 0], tone, lang });
        assert.equal(Engine.hasLink(drafts.msg_intro.text), false, 'no link in the first messenger touch');
        assert.ok(drafts.li_invite.text.length <= 300, 'LinkedIn note ≤ 300');
        const sms = Engine.smsInfo(Data.personalize(drafts.sms_reminder.text, { firstName: 'Екатерина', company: 'X', city: 'moscow', role: '' }, lang));
        assert.equal(sms.segments, 1, `${lang}/${tone}: SMS must fit one segment (${sms.length}/${sms.perSegment})`);
        assert.ok(Engine.hasLink(drafts.email_intro.text), 'email carries the tracked link');
        assert.ok(!/\{sender\}/.test(JSON.stringify(drafts)), 'sender placeholder filled');
      }
    }
  }
});

test('intent detection and goal normalisation', () => {
  assert.equal(Data.detectIntent('Хотим обсудить партнёрство'), 'partner');
  assert.equal(Data.detectIntent('invite to a webinar'), 'webinar');
  assert.equal(Data.detectIntent('вернуть ушедших клиентов'), 'winback');
  assert.equal(Data.detectIntent('созвониться'), 'meeting');
  assert.equal(Data.goalClause('Хочу договориться о звонке, чтобы показать демо.', 'ru').full, 'договориться о звонке, чтобы показать демо');
  assert.equal(Data.goalClause('I want to book a call to show the demo', 'en').short, 'book a call');
});

test('CSV and free-form list import', () => {
  const csv = 'Name;Email;Phone;Company\nIvan Petrov;ivan@acme.ru;+7 383 111-22-33;Acme\nJane Doe;jane@x.com;+1 415 555 0101;X';
  const leads = Data.parseCSV(csv);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].tz, 7);
  assert.equal(leads[1].city, 'sf');
  assert.equal(leads[0].company, 'Acme');
  const list = Data.parseList('Иван Петров, ivan@acme.ru, +7 495 123-45-67\n\nno contacts here');
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Иван Петров');
  assert.equal(list[0].email, 'ivan@acme.ru');
});

test('personalisation never interprets $ patterns in lead data', () => {
  const out = Data.personalize('Hi {{firstName}}!', { firstName: "A$&B$'C", company: '', city: 'moscow', role: '' }, 'en');
  assert.equal(out, "Hi A$&B$'C!");
});

test('personalisation fills every variable', () => {
  const lead = Data.demoLeads()[0];
  const out = Data.personalize('{{firstName}} / {{company}} / {{city}} / {{role}}', lead, 'en');
  assert.equal(out, `${lead.firstName} / ${lead.company} / Moscow / ${lead.role}`);
});
