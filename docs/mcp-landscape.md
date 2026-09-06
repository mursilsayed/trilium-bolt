# Trilium MCP Landscape Tracker

Periodic competitive catch-up: what other Trilium/TriliumNext MCP servers are
doing, especially around context/token efficiency, compared to trilium-bolt's
current tool set. Append a new dated entry each time this exercise is repeated
rather than rewriting prior entries.

---

## 2026-09-06

### Servers surveyed (ranked by GitHub stars)

| Repo | Stars | Forks | Last push | Stack | Notes |
|---|---|---|---|---|---|
| [tan-yong-sheng/triliumnext-mcp](https://github.com/tan-yong-sheng/triliumnext-mcp) | 68 | 8 | 2026-03-24 | Node/TS | 11 tools, 221 commits |
| [perfectra1n/triliumnext-mcp](https://github.com/perfectra1n/triliumnext-mcp) | 65 | 9 | 2026-09-04 | TS, multi-transport | 19 tools (consolidated from 35 in v1), very active |
| OVDEN13/trilium-mcp | 5 | 2 | 2026-06-20 | — | distant third; included for completeness, not feature-rich enough to change the analysis |

trilium-bolt (this repo) currently ships 10 tools: `search_notes`, `get_note`,
`get_note_tree`, `create_note`, `update_note`, `patch_note`, `delete_note`,
`delete_attribute`, `create_backup`, `create_revision`.

### Notable tools/features found elsewhere

**perfectra1n/triliumnext-mcp** (most relevant for token/context efficiency):
- `get_note` supports `content_start` / `content_max_chars` — true pagination
  for note bodies over ~50k chars, plus `include_content=false` for a
  metadata-only fast path.
- `get_note_history` + `get_revisions` — can **list and read** revisions
  (trilium-bolt can only *create* a revision via `create_revision`; there is
  no way to list or fetch one back).
- `write_note` supports a unified-diff edit mode in addition to search/replace
  (trilium-bolt's `patch_note` only does literal/regex find-and-replace).
- Hash-based conflict prevention on writes (rejects an update if the note
  changed since it was last read — avoids silent overwrites and wasted
  retry/re-fetch round trips).
- Deliberately consolidated 35 tools → 19 in a rewrite specifically to cut
  tool-schema token overhead sent to the model on every turn.
- `search_notes` has a "graceful fuzzy fallback": a failed multi-term query
  retries as an OR over individual terms instead of returning nothing.

**tan-yong-sheng/triliumnext-mcp**:
- `patch_note` supports multiple patch modes (css, xpath, line, fragment,
  literal, regex) — richer targeting than trilium-bolt's literal/regex-only
  approach.
- `update_note` uses hash validation to prevent concurrent-edit conflicts
  (same idea as above, independently implemented).
- `resolve_note_id` — look up a note ID by title, saving a full search
  round-trip for the common "I know the title" case.

**Neither top competitor supports named/tagged revisions** — the "named tags
on revisions" idea from the original research prompt does not appear to exist
in any surveyed implementation as of this date. Revisions in all three
projects (including trilium-bolt) are identified by ID/timestamp only. Worth
re-checking in future passes in case someone ships it.

### Suggestions for trilium-bolt

1. **Add pagination / partial fetch to `get_note`.** Introduce something like
   `contentStart` + `contentMaxChars` (or an offset/length pair) so an agent
   can pull a slice of a large note instead of the whole markdown body. This
   is the single highest-leverage token-saving gap versus perfectra1n's
   implementation — today `get_note` is all-or-nothing via `includeContent`.

2. **Add revision read tools** (`get_revisions` / `get_revision`) to pair with
   the existing write-only `create_revision`. Right now trilium-bolt can
   snapshot a note's history but never read it back — a real capability gap,
   not just an efficiency one.

3. **Add hash-based optimistic concurrency to `update_note` / `patch_note`.**
   Both top competitors independently converged on this. It prevents an agent
   from clobbering a note that changed since it last read it, and avoids the
   token cost of a failed write + re-fetch + retry cycle.

*(Honorable mention, not counted in the top 3: enrich `search_notes` with
date-range/subtree scoping and a fuzzy OR-fallback like perfectra1n's, to cut
down on irrelevant results that otherwise burn context on re-filtering.)*

trilium-bolt's own tool count (10, focused) is already leaner than either
competitor's *pre-consolidation* state — no action needed there, just keep new
additions justified rather than sprawling.
