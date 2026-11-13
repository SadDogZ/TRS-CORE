# Employee schedule storage

## Current model

Runtime schedule algorithm uses **only** `WorkScheduleInterval`.

- Writes (`setScheduleRange`, `deleteScheduleRange`, `replaceScheduleRanges`, generate, shift-partners) persist intervals only.
- Reads (`/intervals`, `/annual/intervals`, legacy daily `/` and `/annual`) expand intervals into day rows when a day-shaped response is required.
- `WorkScheduleEntry` remains in the Prisma schema for historical compatibility but is **not** read or written by the application algorithm.

## Demo / local

Demo data importance is low: empty interval tables simply mean empty schedules. Prefer seeding intervals directly if fixtures are needed.

The optional script `app/api/prisma/backfill-work-schedule-intervals.ts` can still convert leftover Entry rows into intervals if an old database dump is restored.
