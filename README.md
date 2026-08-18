# Daybreak

An iPhone-style planner in a single HTML file — weekly schedule, Reminders-style checklist tied to specific dates, a daily work log, and recurring alarms. No build step, no backend.

## Features

- **Today** — live clock, what's due today (tasks + reminders), and a work log for jotting down what you got done.
- **Schedule** — a weekly timetable. Pick a day, add tasks with a time range and category.
- **Reminders** — date-specific reminders (not recurring). Grouped into Overdue / Today / Upcoming / Completed. Rings at the due time if you set one, with Snooze / Mark done / Dismiss.
- **Alarms** — classic recurring alarms by day of week.

Everything is saved to the browser's local storage. Alarms and reminders only ring while the tab stays open — this is a static page with no backend or push notifications.

## Running it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

### GitHub Pages

Enable Pages on this repo (Settings → Pages → Deploy from branch → `main` / root) and it'll be live at `https://<username>.github.io/daybreak/`.
