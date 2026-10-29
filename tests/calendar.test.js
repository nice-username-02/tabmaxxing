import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, groupWeek, weekDays, validateUrls, googleEventLink } from '../calendar-core.js';

process.env.TZ = 'Europe/London';
const now = new Date(2026, 9, 28, 12);
const event = (body, uid = 'test') => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Meeting\r\n${body}\r\nEND:VEVENT`;
const calendar = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
const parse = (...events) => parseCalendar(calendar(...events), now);

test('exactly seven local dates, including today; no events from day eight', () => {
  const events = parse(event('DTSTART:20261028T000000Z'), event('DTSTART:20261103T235959Z', 'last'), event('DTSTART:20261104T000000Z', 'outside'));
  const days = groupWeek(events, now);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(d => d.events.length), [1, 0, 0, 0, 0, 0, 1]);
});
test('daily recurrence includes every day without a display cap', () => {
  const events = parse(event('DTSTART:20260101T090000Z\r\nRRULE:FREQ=DAILY'));
  assert.equal(events.length, 7);
});
test('all-day ranges use exclusive DTEND and appear on each covered day', () => {
  const events = parse(event('DTSTART;VALUE=DATE:20261027\r\nDTEND;VALUE=DATE:20261031'));
  assert.deepEqual(groupWeek(events, now).map(d => d.events.length), [1, 1, 1, 0, 0, 0, 0]);
  assert.equal(events[0].allDay, true);
});
test('overnight event carries into tomorrow but stops at midnight boundaries', () => {
  const events = parse(event('DTSTART:20261027T230000Z\r\nDTEND:20261029T000000Z'));
  assert.deepEqual(groupWeek(events, now).map(d => d.events.length), [1, 0, 0, 0, 0, 0, 0]);
});
test('EXDATE, COUNT, and moved/cancelled instances are respected', () => {
  const events = parse(
    event('DTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nRRULE:FREQ=DAILY;COUNT=5\r\nEXDATE:20261029T090000Z'),
    event('RECURRENCE-ID:20261030T090000Z\r\nDTSTART:20261030T140000Z\r\nDTEND:20261030T150000Z'),
    event('RECURRENCE-ID:20261031T090000Z\r\nSTATUS:CANCELLED')
  );
  assert.equal(events.length, 3);
  assert.equal(new Date(events[1].start).getUTCHours(), 14);
});
test('unrelated recurring series do not inherit each other’s overrides', () => {
  const events = parse(
    event('DTSTART:20261028T090000Z\r\nRRULE:FREQ=DAILY;COUNT=2', 'a'),
    event('DTSTART:20261028T090000Z\r\nRRULE:FREQ=DAILY;COUNT=2', 'b'),
    event('RECURRENCE-ID:20261029T090000Z\r\nDTSTART:20261029T130000Z', 'a')
  );
  assert.equal(events.length, 4);
  assert.deepEqual(events.slice(2).map(e => new Date(e.start).getHours()), [9, 13]);
});
test('an instance moved into the week from a later date appears once', () => {
  const events = parse(event('DTSTART:20261028T090000Z\r\nRRULE:FREQ=WEEKLY'),
    event('RECURRENCE-ID:20261111T090000Z\r\nDTSTART:20261030T150000Z'));
  assert.equal(events.length, 2);
});
test('monthly ordinal BYDAY and RDATE are expanded', () => {
  const events = parse(event('DTSTART:20260930T090000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=-1WE\r\nRDATE:20261102T090000Z'));
  assert.deepEqual(events.map(e => new Date(e.start).getDate()), [28, 2]);
});
test('cancelled standalone events are excluded and untitled events retained', () => {
  const events = parse(event('DTSTART:20261028T090000Z\r\nSTATUS:CANCELLED'),
    'BEGIN:VEVENT\r\nUID:untitled\r\nDTSTART:20261029T090000Z\r\nEND:VEVENT');
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, '(Untitled event)');
});
test('weeks crossing DST use calendar-day boundaries', () => {
  const dates = weekDays(new Date(2026, 9, 24, 12));
  assert.equal(dates.length, 8);
  assert.equal((+dates[2] - +dates[1]) / 3600000, 25);
  assert.equal(dates[7].getDate(), 31);
  assert.ok(dates.every(date => date.getHours() === 0));
});
test('VTIMEZONE recurring events maintain wall time through DST', () => {
  const zone = 'BEGIN:VTIMEZONE\r\nTZID:Europe/London\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T010000\r\nTZOFFSETFROM:+0000\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nDTSTART:19701025T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE';
  const events = parseCalendar(calendar(zone, event('DTSTART;TZID=Europe/London:20261024T090000\r\nRRULE:FREQ=DAILY;COUNT=3')), new Date(2026, 9, 24));
  assert.deepEqual(events.map(e => new Date(e.start).getHours()), [9, 9, 9]);
  assert.deepEqual(events.map(e => new Date(e.start).getUTCHours()), [8, 9, 9]);
});
test('multiple feeds remain separate and all-day entries sort first', () => {
  const a = parseCalendar(calendar(event('DTSTART:20261028T090000Z')), now, 0);
  const b = parseCalendar(calendar(event('DTSTART;VALUE=DATE:20261028')), now, 1);
  const items = groupWeek([...a, ...b], now)[0].events;
  assert.equal(items.length, 2);
  assert.equal(items[0].allDay, true);
  assert.notEqual(items[0].key, items[1].key);
});
test('invalid feeds and unsupported URL hosts fail visibly, duplicates removed', () => {
  assert.throws(() => parseCalendar('<html>Login</html>', now));
  assert.throws(() => validateUrls('https://example.com/calendar.ics'));
  assert.throws(() => validateUrls('http://calendar.google.com/a.ics'));
  assert.throws(() => validateUrls('https://calendar.google.com.evil.test/a.ics'));
  const url = 'https://calendar.google.com/calendar/ical/example/basic.ics';
  assert.deepEqual(validateUrls(url + '\n' + url), [url]);
  assert.deepEqual(validateUrls(''), []);
});
test('all events in a busy week are retained', () => {
  const events = parse(...Array.from({ length: 400 }, (_, i) => event('DTSTART:20261028T090000Z', String(i))));
  assert.equal(groupWeek(events, now)[0].events.length, 400);
});
test('missing timezone definitions fail instead of silently shifting event times', () => {
  assert.throws(() => parse(event('DTSTART;TZID=America/New_York:20261028T090000')), /timezone/);
});
test('extended calendar window expands and groups later recurring instances', () => {
  const text = calendar(event('DTSTART:20260101T090000Z\r\nDTEND:20260101T100000Z\r\nRRULE:FREQ=DAILY'));
  const events = parseCalendar(text, now, 0, 21);
  const groups = groupWeek(events, now, 21);
  assert.equal(groups.length, 21);
  assert.ok(groups.every(day => day.events.length === 1));
  assert.equal(events.length, 21);
});

test('Google event links use the correct calendar and original recurring occurrence, without feed secrets', () => {
  const feed = 'https://calendar.google.com/calendar/ical/person%40example.com/private-secret-token/basic.ics';
  const events = parse(event('DTSTART:20261028T090000Z\r\nRRULE:FREQ=DAILY;COUNT=2', 'abc123def456@google.com'));
  const link = googleEventLink(events[1], feed);
  assert.equal(link.exact, true);
  const eid = new URL(link.url).searchParams.get('eid');
  assert.equal(atob(eid), 'abc123def456_20261029T090000Z person@example.com');
  assert.ok(!link.url.includes('secret-token'));
  const moved = parse(event('DTSTART:20261028T090000Z\r\nRRULE:FREQ=DAILY;COUNT=2', 'abc123def456@google.com'),
    event('RECURRENCE-ID:20261029T090000Z\r\nDTSTART:20261029T150000Z', 'abc123def456@google.com'));
  assert.equal(moved[1].occurrence, '20261029T090000Z');
});

test('explicit Google links are preserved; imported IDs and unsafe URLs use a search fallback', () => {
  const url = 'https://www.google.com/calendar/event?eid=explicit-event';
  const [item] = parse(event('DTSTART:20261028T090000Z\r\nURL:' + url));
  assert.deepEqual(googleEventLink(item, ''), {url, exact: true});
  for (const unsafe of ['javascript:alert(1)', 'https://calendar.google.com.evil.test/calendar/event?eid=bad', 'https://calendar.google.com/calendar/ical/person/private-secret/basic.ics']) {
    const result = googleEventLink({uid:'external-id@other.test',summary:'Meeting & lunch',url:unsafe}, '');
    assert.equal(result.exact, false);
    assert.equal(new URL(result.url).hostname, 'calendar.google.com');
    assert.equal(new URL(result.url).searchParams.get('q'), 'Meeting & lunch');
  }
});
