import ICAL from './vendor/ical.js';

// Advance calendar dates, not 24-hour durations: DST days can be 23 or 25 hours.
export function weekDays(now = new Date(), count = 7) {
  return Array.from({ length: count + 1 }, (_, offset) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

export function validateUrls(text) {
  return [...new Set(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))].map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error('Enter a complete Google Calendar iCal URL on each line.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' ||
        url.port || url.username || url.password || !url.pathname.endsWith('.ics')) {
      throw new Error('Use Google Calendar HTTPS iCal links ending in .ics.');
    }
    return url.href;
  });
}

export function googleEventLink(event, feedURL) {
  // Prefer an explicit Google event link when the feed provides one.
  try {
    const direct = new URL(event.url);
    if (direct.protocol === 'https:' && !direct.username && !direct.password && !direct.port &&
        ['calendar.google.com', 'www.google.com', 'google.com'].includes(direct.hostname) &&
        /^\/calendar\/(?:u\/\d+\/)?(?:r\/)?(?:event(?:edit)?)(?:\/|$)/.test(direct.pathname) &&
        (direct.searchParams.has('eid') || /\/eventedit\/[^/]+/.test(direct.pathname))) {
      return {url: direct.href, exact: true};
    }
  } catch {}
  let calendarID;
  try {
    const feed = new URL(feedURL);
    if (feed.protocol === 'https:' && feed.hostname === 'calendar.google.com')
      calendarID = decodeURIComponent(feed.pathname.match(/^\/calendar\/ical\/([^/]+)\//)?.[1] || '');
  } catch {}
  // Google-created UIDs encode the native ID. Imported iCal UIDs need an
  // authenticated lookup, so use Calendar search rather than inventing an ID.
  const nativeID = event.uid?.match(/^([0-9a-v]{5,1024})@google\.com$/)?.[1];
  if (calendarID && nativeID) {
    const id = nativeID + (event.occurrence ? '_' + event.occurrence : '');
    const token = btoa(String.fromCharCode(...new TextEncoder().encode(id + ' ' + calendarID))).replace(/=+$/, '');
    return {url: 'https://calendar.google.com/calendar/event?eid=' + encodeURIComponent(token), exact: true};
  }
  const search = new URL('https://calendar.google.com/calendar/r/search');
  search.searchParams.set('q', event.summary || '');
  return {url: search.href, exact: false};
}

export function parseCalendar(text, now = new Date(), source = 0, count = 7) {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('The response is not an iCal calendar.');
  const days = weekDays(now, count);
  const from = +days[0], to = +days[count];
  const components = root.getAllSubcomponents('vevent');
  for (const component of components) {
    for (const property of component.getAllProperties()) {
      const tzid = property.getParameter('tzid');
      if (tzid && tzid !== 'UTC' && !root.getTimeZoneByID(tzid)) {
        throw new Error('Calendar timezone definition is missing.');
      }
    }
  }
  const events = components.map(c => new ICAL.Event(c, { exceptions: [] }));
  // Only relate exceptions belonging to this UID; a feed contains many series.
  for (const event of events.filter(e => !e.isRecurrenceException())) {
    for (const exception of events.filter(e => e.isRecurrenceException() && e.uid === event.uid)) {
      event.relateException(exception);
    }
  }
  const result = new Map();
  const cancelled = event => event.component.getFirstPropertyValue('status') === 'CANCELLED';

  function add(item, startDate, endDate, identity, occurrence = '') {
    if (cancelled(item) || !startDate) return;
    const start = +startDate.toJSDate();
    const end = Math.max(start, +(endDate || startDate).toJSDate());
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Invalid event date.');
    if (start >= to || (end > start ? end <= from : start < from)) return;
    const key = `${source}:${item.uid || 'event'}:${identity}`;
    result.set(key, { key, start, end, allDay: startDate.isDate,
      summary: item.summary || '(Untitled event)', location: item.location || '', uid: item.uid || '',
      url: String(item.component.getFirstPropertyValue('url') || ''), occurrence, source });
  }

  for (const event of events) {
    if (cancelled(event)) continue;
    if (!event.startDate) throw new Error('An event has no start date.');
    // Detached instances are also inspected on their actual start date, so an
    // occurrence moved into this week from outside the window is not lost.
    if (event.isRecurrenceException()) {
      const original = event.recurrenceId;
      add(event, event.startDate, event.endDate, +original.toJSDate(), original.isDate ? original.toICALString() : original.convertToZone(ICAL.Timezone.utcTimezone).toICALString());
      continue;
    }
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate, +event.startDate.toJSDate());
      continue;
    }
    const iterator = event.iterator();
    let count = 0;
    for (let occurrence; (occurrence = iterator.next());) {
      if (++count > 200000) throw new Error('A recurrence is too large to expand safely.');
      const exception = event.exceptions[occurrence.toString()] ||
        event.exceptions[occurrence.convertToZone(ICAL.Timezone.utcTimezone).toString()];
      if (exception && cancelled(exception)) continue;
      const details = event.getOccurrenceDetails(occurrence);
      if (cancelled(details.item)) continue;
      if (+occurrence.toJSDate() >= to && +details.startDate.toJSDate() >= to) break;
      add(details.item, details.startDate, details.endDate, +occurrence.toJSDate(), occurrence.isDate ? occurrence.toICALString() : occurrence.convertToZone(ICAL.Timezone.utcTimezone).toICALString());
    }
  }
  return [...result.values()].sort((a, b) => a.start - b.start || a.summary.localeCompare(b.summary));
}

export function groupWeek(events, now = new Date(), count = 7) {
  const days = weekDays(now, count);
  return days.slice(0, count).map((date, i) => ({
    date,
    events: events.filter(e => e.start < +days[i + 1] &&
      (e.end > e.start ? e.end > +date : e.start >= +date))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.summary.localeCompare(b.summary))
  }));
}
