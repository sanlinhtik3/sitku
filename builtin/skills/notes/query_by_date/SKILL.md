---
name: query_by_date
description: Queries notes by creation or modification date using instant SQLite indexes. Use when the user asks for notes created or modified today, yesterday, this week, this month, or after/before a specific date.
---

# query_by_date Skill

Queries the active vault's note index by temporal timestamps (`ctime_ms` for creation time, `mtime_ms` for modification time).

## Parameters

- `dateRange`: String indicating the relative timeframe. Valid values:
  - `"today"`: Notes created/modified since midnight today (local time).
  - `"yesterday"`: Notes created/modified during yesterday (00:00 to 23:59).
  - `"this_week"`: Notes created/modified during the last 7 days.
  - `"this_month"`: Notes created/modified during the last 30 days.
- `action`: Temporal filtering target. Valid values:
  - `"created"`: Filter and sort by `ctime_ms` (creation time).
  - `"modified"`: Filter and sort by `mtime_ms` (modification time).
- `createdAfter` / `modifiedAfter` (optional): Unix timestamp in milliseconds for exact date boundary filtering.
- `limit` (optional): Maximum number of notes to return (default 500).

## Behavior

1. Evaluates the requested `dateRange` into start and end Unix timestamps in milliseconds.
2. Executes an instant SQLite indexed query against the `note_index` table (`ctime_ms` or `mtime_ms`).
3. Returns a list of matching notes formatted with their file path, title, and timestamp in under 5 milliseconds.
4. Operates completely behind the scenes without adding visual clutter to the minimalist editor UI.
