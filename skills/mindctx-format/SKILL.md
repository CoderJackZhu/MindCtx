---
name: mindctx-format
description: Convert, organize, and modify documents into the .mind.md format used by MindCtx. Use this skill whenever the user asks to create a mind map document, restructure notes into an outline, convert unstructured text/meeting notes/brainstorms into structured hierarchical markdown, create or edit .mind.md files, or organize any content into a tree-like structure. Also trigger when you see references to "mind.md", "mindctx", "大纲", "思维导图格式", or when the user wants to turn messy notes into clean structured documents.
---

# MindCtx Document Formatting

You are formatting documents into `.mind.md` — a structured markdown format that renders as outlines and mind maps in the MindCtx tool. The format is pure standard Markdown with no proprietary syntax, just conventions.

## Format Overview

A `.mind.md` file has two parts: YAML frontmatter + hierarchical content.

### Frontmatter (required)

```yaml
---
mindctx: true
default-view: outline
heading-depth: 4
---
```

| Field | Values | Purpose |
|-------|--------|---------|
| `mindctx` | `true` | Marks this as a MindCtx document |
| `default-view` | `"outline"` or `"mindmap"` | How the document opens |
| `heading-depth` | 1–6 (default 4) | Max depth that uses `#` headings; deeper nodes become list items |

### Choosing `heading-depth`

This is the most important structural decision:

- **`heading-depth: 2`** — Use for flat documents where most content lives in lists (reading notes, simple lists, brainstorms). Only H1 and H2 use heading syntax.
- **`heading-depth: 3`** — Use for documents with clear category/subcategory structure but shallow nesting.
- **`heading-depth: 4`** (default) — Use for most documents with category/subcategory/detail structure (PRDs, architecture docs, plans with phases). H1–H4 use headings.
- **`heading-depth: 5+`** — Rarely needed. Only for deeply nested formal documents.

Rule of thumb: if a level contains mostly leaf content (action items, details), it should be a list, not a heading.

### Choosing `default-view`

- `"outline"` — For work documents, reference material, anything read sequentially
- `"mindmap"` — For plans, brainstorms, overviews meant to be scanned spatially

## Tree Structure Rules

### Headings = Branch Nodes

```markdown
# Root Title          ← depth 1 (always exactly one)
## Major Section      ← depth 2
### Subsection        ← depth 3
#### Detail Section   ← depth 4 (if heading-depth >= 4)
```

- There is exactly ONE H1 — the document title
- Heading levels must not skip (no H1 → H3 without H2)

### Lists = Leaf Nodes

```markdown
## Section

- Item A
  - Sub-item 1
  - Sub-item 2
- Item B
```

- Use 2-space indentation for nesting
- Unordered lists use `-` (not `*` or `+`)
- Ordered lists use `1.` prefix

### Notes (optional body text under headings)

```markdown
## Project Background

This paragraph is the "note" for the heading above.
It provides context but isn't a child node.

- These list items ARE child nodes
```

A paragraph directly under a heading (before any list or next heading) becomes that node's note/description.

## Supported Features

### Checkboxes (task lists)

```markdown
- [ ] Pending task
- [x] Completed task
- Regular item (no checkbox)
```

### Tags (in heading text)

```markdown
## Feature Design #important #v2
```

### Content Blocks (attached to nodes)

Nodes can have code blocks, tables, blockquotes, images, and math blocks attached:

```markdown
## API Design

> Important: maintain backward compatibility

| Method | Path | Description |
|--------|------|-------------|
| GET | /users | List users |
```

## Conversion Guidelines

When converting unstructured content into `.mind.md`:

1. **Identify the root topic** — This becomes H1
2. **Find 3–7 major categories** — These become H2 sections
3. **Group details under categories** — Subcategories become H3/H4 (if heading-depth allows) or top-level list items
4. **Atomic leaf nodes** — Each list item should be one concept/action/fact. If a bullet has "and" connecting two ideas, split it.
5. **Consistent depth** — Sibling nodes at the same level should have similar granularity
6. **Preserve meaning, improve structure** — Don't lose information; reorganize it hierarchically

### Handling ambiguous structure

- If the source has no clear hierarchy → group by theme/category
- If the source is already an outline → preserve its structure, just add frontmatter
- If the source mixes detail levels → normalize: move details deeper, keep categories shallow
- If content is action-oriented → use checkboxes for actionable items

## Modification Rules

When editing an existing `.mind.md` file:

- Preserve the frontmatter values unless the user asks to change them
- Maintain the existing heading-depth convention
- Don't restructure sections the user didn't ask to change
- Keep the same indentation style (2 spaces)
- When adding nodes, match the granularity of sibling nodes

## Output Checklist

Before finalizing any `.mind.md` output, verify:

- [ ] Frontmatter has all three fields (`mindctx`, `default-view`, `heading-depth`)
- [ ] Exactly one H1 title
- [ ] No skipped heading levels
- [ ] List indentation uses 2 spaces
- [ ] `heading-depth` matches the actual structure used
- [ ] Leaf nodes are atomic (one idea per bullet)
- [ ] File extension is `.mind.md` (or existing `.md` with `mindctx: true`)
