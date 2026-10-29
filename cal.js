import { groupWeek, validateUrls, weekDays, googleEventLink } from './calendar-core.js';

const $ = id => document.getElementById(id);
let urls = [], feeds = {}, generation = 0, controller, worker;
let visibleDays = 7, fetching = false, responses = [];
let lastDay = +weekDays()[0];
const time = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dateLabel = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const get = defaults => new Promise(resolve => chrome.storage.local.get(defaults, resolve));
const save = values => new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
  const error = chrome.runtime?.lastError;
  error ? reject(new Error(error.message)) : resolve();
}));

$('calsave').addEventListener('click', async () => {
  try {
    const next = validateUrls($('calurl').value);
    $('calerror').textContent = '';
    await save({ icsUrls: next, weekCache: null, calCache: null, icsUrl: '' });
    configure(next, {});
    $('calerror').textContent = 'Calendar settings saved.';
  } catch (error) { $('calerror').textContent = error.message; }
});
$('calrefresh').addEventListener('click', () => refresh());
async function loadMore() {
  if (fetching || !urls.length) return;
  visibleDays += 7;
  await refresh(true);
}
$('calmore').addEventListener('click', loadMore);
for (const id of ['agenda', 'agendadays']) $(id).addEventListener('scroll', () => {
  const el = $(id);
  if (el.scrollTop > 0 && el.scrollHeight - el.clientHeight - el.scrollTop < 70) loadMore();
}, { passive: true });
for (const id of ['agenda', 'agendadays']) $(id).addEventListener('wheel', event => {
  const el = document.body.classList.contains('modular-workspace') ? $('agendadays') : $('agenda');
  if (event.deltaY > 0 && el.scrollHeight - el.clientHeight - el.scrollTop < 70) loadMore();
}, { passive: true });

function configure(next, cache) {
  generation++;
  controller?.abort();
  worker?.terminate();
  urls = next;
  visibleDays = 7;
  responses = [];
  feeds = cache || {};
  $('calurl').value = urls.join('\n');
  render();
  if (urls.length) refresh();
}

async function refresh(reuse = false) {
  fetching = true;
  $('calmore').disabled = true;
  const version = ++generation;
  controller?.abort();
  worker?.terminate();
  controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
  $('calrefresh').disabled = true;
  $('agendanote').textContent = 'Updating calendars…';
  const snapshot = [...urls];
  const now = new Date();
  const results = reuse && responses.length === snapshot.length ? responses : await Promise.allSettled(snapshot.map(async url => {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal });
    if (!response.ok) throw new Error('Calendar unavailable');
    return response.text();
  }));
  if (version !== generation) return;
  responses = results;
  // Expand recurrence off the main thread so notes remain responsive.
  const activeWorker = worker = new Worker('calendar-worker.js', { type: 'module' });
  const parsed = await new Promise(resolve => {
    const timeout = setTimeout(() => {
      activeWorker.terminate();
      resolve(snapshot.map(() => ({ error: true })));
    }, 15000);
    activeWorker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
    activeWorker.onerror = () => { clearTimeout(timeout); resolve(snapshot.map(() => ({ error: true }))); };
    activeWorker.postMessage({ now: +now, days: visibleDays, feeds: results.map(r => r.status === 'fulfilled' ? r.value : null) });
  });
  if (version !== generation) return;
  activeWorker.terminate();
  const updated = {};
  snapshot.forEach((url, i) => {
    updated[url] = parsed[i]?.error
      ? { ...feeds[url], failed: true }
      : { events: parsed[i].events, day: +weekDays(now)[0], updated: Date.now(), failed: false };
  });
  feeds = updated;
  fetching = false;
  $('calmore').disabled = false;
  $('calrefresh').disabled = false;
  render();
  try { await save({ weekCache: updated }); }
  catch { $('agendanote').textContent += ' Calendar cache could not be saved.'; }
}

function render() {
  const scroll = $('agenda').scrollTop;
  const daysScroll = $('agendadays').scrollTop;
  const now = new Date(), today = +weekDays(now)[0];
  document.body.classList.toggle('has-calendar', urls.length > 0);
  $('agenda').hidden = !urls.length;
  $('caltext').textContent = '';
  $('agendadays').replaceChildren();
  if (!urls.length) {
    $('caltext').textContent = 'Add a calendar';
    $('calrefresh').disabled = false;
    return;
  }
  const events = urls.flatMap(url => (feeds[url]?.events || []).map(event => ({...event, calendarLink: googleEventLink(event, url)})));
  const groups = groupWeek(events, now, visibleDays);
  const next = events.filter(e => !e.allDay && e.start >= +now && e.start < +weekDays(now)[7])
    .sort((a, b) => a.start - b.start)[0];
  if (next) {
    const title = document.createElement('b');
    title.textContent = next.summary;
    const link = document.createElement('a'); link.href = next.calendarLink.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = next.calendarLink.exact ? 'Open in Google Calendar to edit' : 'Find this event in Google Calendar';
    link.append(title); $('caltext').append('next: ', link, ' · ' + dateLabel(next.start) + ' ' + time(next.start));
  } else $('caltext').textContent = 'Upcoming events';
  const missing = urls.filter(url => !feeds[url]?.events).length;
  groups.forEach(({ date, events: items }, i) => {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' });
    const stamp = document.createElement('span');
    stamp.textContent = dateLabel(date);
    heading.append(stamp);
    const list = document.createElement('ul');
    for (const event of items) {
      const row = document.createElement('li');
      if (!event.allDay && event.end <= +now && event.start < +now) row.classList.add('past');
      if (event.key === next?.key) row.classList.add('next');
      const timing = document.createElement('span');
      timing.className = 't';
      const startDate = new Date(event.start), endDate = new Date(event.end);
      const crossDay = startDate.toDateString() !== endDate.toDateString();
      timing.textContent = event.allDay ? 'all day' : time(event.start) + ' – ' + time(event.end);
      if (!event.allDay && crossDay) {
        const dates = document.createElement('small');
        dates.textContent = dateLabel(event.start) + ' – ' + dateLabel(event.end);
        timing.append(dates);
      }
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = event.summary;
      row.title = [event.summary, event.location,
        event.allDay ? 'All day' : new Date(event.start).toLocaleString() + ' – ' + new Date(event.end).toLocaleString()]
        .filter(Boolean).join('\n');
      const link = document.createElement('a'); link.className = 'calendar-event';
      link.href = event.calendarLink.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', event.summary + (event.calendarLink.exact ? ' — open in Google Calendar to edit' : ' — find in Google Calendar'));
      link.title = event.calendarLink.exact ? 'Open in Google Calendar to edit' : 'Find this event in Google Calendar';
      link.append(timing, title); row.append(link);
      list.append(row);
    }
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = missing ? 'Calendar data unavailable' : 'No events';
      list.append(empty);
    }
    section.append(heading, list);
    $('agendadays').append(section);
  });
  const failed = urls.filter(url => feeds[url]?.failed || (feeds[url] && feeds[url].day !== today)).length;
  const dates = urls.map(url => feeds[url]?.updated).filter(Boolean);
  $('agendanote').textContent = failed || missing
    ? (failed || missing) + ' calendar(s) unavailable or out of date. Saved events shown where available.'
    : dates.length ? 'Updated ' + time(Math.min(...dates)) + ' · refreshes every 5 min' : 'Loading calendars…';
  $('agenda').scrollTop = scroll;
  $('agendadays').scrollTop = daysScroll;
}

const initial = await get({ icsUrls: null, icsUrl: '', weekCache: null });
configure(initial.icsUrls ?? (initial.icsUrl ? [initial.icsUrl] : []), initial.weekCache);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.icsUrls && JSON.stringify(changes.icsUrls.newValue) !== JSON.stringify(urls)) {
    configure(changes.icsUrls.newValue || [], {});
  }
});
setInterval(() => { if (urls.length) refresh(); }, 5 * 60 * 1000);
setInterval(() => {
  const day = +weekDays()[0];
  if (day !== lastDay) { lastDay = day; if (urls.length) refresh(); }
  render();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const day = +weekDays()[0];
    if (day !== lastDay) { lastDay = day; if (urls.length) refresh(); }
    render();
  }
});
