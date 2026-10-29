import { parseCalendar } from './calendar-core.js';
self.onmessage = ({ data }) => {
  self.postMessage(data.feeds.map((text, index) => {
    if (text === null) return { error: true };
    try { return { events: parseCalendar(text, new Date(data.now), index, data.days || 7) }; }
    catch { return { error: true }; }
  }));
};
