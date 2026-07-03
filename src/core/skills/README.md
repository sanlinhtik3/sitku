# BeeBot Skill Core

BeeBot core owns the skill registry, permission checks, tool routing, and events.
Skill implementations should receive capabilities through `SkillRuntimeContext`
instead of importing filesystem, SQLite, Electron, Supabase, or network clients directly.
