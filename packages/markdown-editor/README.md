# Markdown editor

`@docode/markdown-editor` is an experimental, browser-based hybrid Markdown
editor. It keeps Markdown source as the canonical document while presenting
inactive blocks in rendered form and active blocks in editable source form.

## Package releases

The npm release pipelines run `pnpm exec turbo build --filter=@docode/markdown-editor`.
The package build depends on the workspace observables, HubRPC, and web-editors
builds. Fixture-only dependencies (Component Explorer and the cmark WASM compiler)
remain in the fixture/screenshot task graph, not the library release graph.
Both stable and nightly release jobs install Chromium before running the package
tests, which include real-browser clipboard and widget tests.

The Markdown test runner is temporarily pinned to Playwright 1.56.1, matching
Monaco's release tooling. Its Chromium download uses Microsoft's distribution
endpoint; newer Chrome-for-Testing downloads redirect to Google storage, which
failed with `EPERM` on the Azure release agent. Keep the exact pin until the newer
download route is approved and verified on that agent. This affects test tooling,
not the published editor's runtime dependencies or Component Explorer's renderer.

## Embedded editor presentation

`EditorView` calls the embedded editor factory's optional `layout()` hook after
measuring the document. The virtualized iframe factory uses it to keep retained
iframes aligned when edits move their placeholders without resizing them.

Iframe editor descriptors can opt into host-owned presentation controls:

```ts
presentation: {
    resizable: true,
    fullWidth: true,
    fullView: true,
    minHeight: 180,
}
```

These controls work without an editor protocol implementation in the iframe.
Full width uses the Markdown viewport width while retaining document flow.
Full view fills the visible Markdown viewport, keeps the same iframe alive,
and restores the previous width mode, inline height, and scroll position on exit.
The host toolbar groups copy and presentation actions in a compact, themed Codicon
overlay. It appears on hover or keyboard focus without reserving a header row,
alongside a rounded border around the iframe and its resize grip. These use the
same 4px frame and 6px toolbar radii as the Mermaid preview controls.
The toolbar and border fade in and out over 200ms with `ease-in-out`, matching
Markdown preview. Reduced-motion preferences disable these transitions.
The toolbar always provides an exit button in full view. Escape also exits when handled
by the injected iframe bootstrap (nested remote pages can use the message below).
Resize handles support pointer capture and Arrow Up/Down. After a user resize,
content-size reports no longer override the chosen height; **Automatic height**
returns control to the content. Full view always uses the host viewport height.
Presentation changes never edit the Markdown source.
The host iframe uses the page theme's background in every presentation mode.
Guest HTML can remain transparent to show that color without revealing the
Markdown document behind it in full view.

Cooperative pages can advertise the same preferences with
`parent.postMessage({ type: 'docode-markdown-editor::presentation', preferences }, '*')`.
Explicit descriptor properties override guest preferences, including `false`.
The host sends `{ type: 'docode-markdown-editor::presentation', mode }` to the
iframe on binding, loading, and mode changes. Modes are `inline`, `full-width`,
and `full-view`; pages measure dimensions with their own resize observer.
Pages should check `event.source === parent` before accepting this notification.
Send the same message type with `action: 'request-state'` to request the current
mode, or `action: 'exit-full-view'` to leave full view.

The **Experimental / Embedded presentation** group contains page-sized fixtures,
each with one embedded editor. Provider controls, guest preferences, and explicit
provider overrides use a release-notes editor backed by the sample web editor's
text mode. Its borderless red background
distinguishes guest UI from the Markdown host's themed controls. Edits update the underlying Markdown
block through the real web editor protocol. **Transparent editor** shows only
centered text, with no guest background or border, and a host-owned height-resize
grip. Embedded mode fills the browser; Explorer page mode supports desktop/mobile
viewports. Their light/dark Playwright tests exercise scaled-preview alignment,
drag capture, minimum height, size-report precedence, full-width
and full-view geometry, mode notifications, state retention, and restoration.

**Red editor (hover)** and **Transparent editor (hover)** default the `mockHover`
fixture input to true for deterministic visual verification. This sets
`data-md-iframe-hover="true"` on the fixture container, exercising the same chrome
visibility rules as real hover/focus without moving the pointer. Set the input
to false to test natural hover behavior.
The `animations` fixture input defaults to false for stable screenshots. Set it
to true to exercise the production fades, with either real or mocked hover.

## Browser tests

`pnpm test:e2e` builds the fixture dependencies and runs the Playwright interaction
suite. Tests use isolated browser contexts and run in parallel, with four workers
in CI (override with Playwright's `--workers` option). This is separate from
Component Explorer's screenshot renderer, which already defaults to available
CPUs capped at eight workers. Screenshot computation remains Turbo-cached.

The Playwright `e2e/milestone-one.spec.ts` suite is temporarily skipped to unblock
CI while its debug-panel-based checks are replaced with fixture-native assertions.
The milestone fixtures remain in the screenshot pipeline; other E2E and unit
tests remain enabled.

In locked mode, submitting a comment or dismissing it with Escape keeps the input
hidden for the current selection, including across layout changes. Changing the
selection makes comment entry available again.

## Editing policies

The editor has three independent policies:

- `EditorModel.readonlyMode`: disables text editing. The lock/pencil button
  changes only this permission, not parsing, layout, or syntax visibility.
- `EditorModel.presentation`: `reading` uses conventional Markdown whitespace;
  `editing` preserves source line breaks, blank lines, repeated spaces and tabs
  while keeping rich formatting. Both work while locked or editable.
- `EditorModel.renderMarkupText`: `none` hides syntax, `selection` uses the
  existing active-block revelation rules, and `all` reveals syntax throughout
  the document. Hidden inline syntax occupies no width in either presentation.
  Find can temporarily reveal hidden source for the current match without
  changing this policy or cursor-navigation rules; closing Find removes the reveal.

Non-obvious spaces (leading, trailing, and runs of two or more) show dot
indicators wherever markup is revealed; tabs show an arrow. Ordinary single
inter-word spaces remain unmarked. The view-data layer maps markup visibility
to per-leaf `showWhitespace` booleans, so whitespace rendering does not depend
on the public policy enum. In editing presentation these are overlays on real
source whitespace: line breaks, wrapping, source offsets, and clipboard text
remain unchanged.

The model defaults to editable, reading presentation, and selection markup.
Hosts can initialize presentation with `EditorView`'s `presentation` option.
Switching presentation reparses without changing source or selection. Locking
does not reparse the document.

Authoritative host updates preserve selection identity and caret affinity when
the mapped endpoints are unchanged, avoiding a second render for an identical
edit echo. Pending-paragraph state is still cleared and stale offsets are clamped.
Rich-link layout batches DOM reads and writes across independent blocks, while
keeping dependent pills within a paragraph or table sequential.

The editing preset maps to explicit parser options rather than a parser UI mode:
`explicitBlankLineBlocks`, `explicitFinalEmptyLine`,
`preserveTrailingListContinuation`, and `allowEmptyListItemInterrupts`.
Blank source lines become empty blocks; the final unfinished line stays in its
list paragraph when it can continue that paragraph. A blank line ends this lazy
continuation. Empty nested list prefixes are structural before their first text
character is typed. These narrow recognition deviations avoid structural jumps
while typing or deleting, without depending on editing history. The reading
preset leaves these extensions off.

Editing presentation recognizes empty task checkboxes (`[ ]`, `[x]`, and `[]`)
at end-of-file as well as before whitespace or a newline. Enter exits an empty
task just like an empty list item; a nested empty task first outdents.

In editing presentation, Enter continues complete list items and exits/outdents
empty ones. Elsewhere it inserts a single newline without creating a virtual
paragraph. Arrow Down also stays within
the existing source instead of creating a virtual paragraph.

At a soft wrap, the end of one visual line and start of the next share a source
offset. Mouse placement and visual-line navigation retain upstream caret
affinity when targeting the preceding line, without changing source offsets.
Explicit newlines and programmatic selections keep their existing behavior.

See [Editing property tests](docs/editing-properties.md) for the interactive
assertion fixtures, CI contracts, deterministic editing corpus, and the
red/green/visual evidence required for layout fixes.

### Rich link display hints (experimental)

Inline Markdown link titles can opt into two rendering experiments:

- `[commit](commit:1234567 "md:max-width=32")` bounds the entire pill to `32ch`.
- `[commit](commit:1234567 "md:icon-only")` shows only the resource icon, retaining
  its tooltip, accessible name, keyboard activation and original destination.

Only these complete title values are interpreted as hints; other titles do not
change pill rendering. The source title and URL remain editable and unchanged.
These are fixture-driven experiments, not an extension contribution API.

### Automatic links

Bare HTTP(S) URLs, `www.` addresses, and email addresses are detected using GFM
autolink rules. Angle-bracket autolinks are supported too. They use the same link
nodes and host presentation provider as explicit Markdown links, so recognized
GitHub issue URLs can receive DoCode rich presentations without `[label](url)`
syntax. Active links retain their exact editable source. Code spans and fenced
code do not auto-link; trailing punctuation is excluded from link targets.

Pasting a single HTTP(S) URL over selected inline text turns that selection into
a Markdown link, preserving inline formatting. Pasting without a selection,
inside code or an existing link, or across block boundaries keeps ordinary text
replacement. Ctrl/Cmd+Shift+V bypasses link creation with the async clipboard
strategy (including DoCode). Typed URLs do not wrap selections.

### Fixture reference rendering

The real-editor examples expose **Interactive mode** in the fixture toolbar.
This live input enables browser typing and cursor blinking without resetting the
editor, selection, or recording; it defaults off for deterministic screenshots.

In the sidebar, **showEditModeToggle** restores the editor's lock button.
**readonly**, **presentation** (`reading` / `editing`), and **renderMarkupText**
(`none` / `selection` / `all`) control permission, presentation, and markup policy.
In read-only mode, `selection` keeps Markdown rendered even when text is selected;
unlocking restores selection-driven source markers. Explicit `all` still exposes
source for inspection, and diff/find diagnostics retain their explicit source reveals.
These controls are
live in the examples, main demos, content/selection fixtures, and Mermaid
fixtures: edits and selection survive changes. The dropdown follows the editor
button and replayed state. Legacy recordings with `sourceEditing` and
`activeEverywhere` are translated when loaded; new recordings store the explicit
policies. Existing fixture defaults are preserved, including
hidden buttons in the examples and selection fixtures. Browser input remains
controlled separately by **Interactive mode**.

The Compare diagnostics (injectivity, Arrow Down coverage, and active/inactive
comparison) also honor **showEditModeToggle**, defaulting to hidden. They retain
their diagnostic selection/presentation setup rather than synchronizing the
compared models through the interactive policy controls.
Injectivity activates each source character and compares its start and end in
that same layout. It does not compare coordinates across cell activations,
which can resize table columns when inline markers appear or collapse.

The **Reference** debug tab follows the editor's source and replay position.
Its renderer selector defaults to **GitHub (cmark-gfm)**, using the
[`@vscode/cmark-gfm-wasm`](../../../cmark-gfm-wasm/README.md) workspace package
with GFM tables, task lists, strikethrough, and autolinks. **markdown-it** retains
the previous reference engine for comparison (including its different task-list
behavior). Both use `github-markdown-css` in a script-disabled iframe.
Ordinary paragraphs and lists therefore usually look identical. For a visible
engine difference, try `- [x] Done`: cmark-gfm renders a checkbox, while the
markdown-it configuration leaves `[x]` as text.
This is GitHub's Markdown parser plus reference CSS, not GitHub's complete site
rendering/sanitization pipeline. cmark's safe HTML defaults remain enabled.
Initialization/rendering errors are displayed in the pane, not replaced by a
different engine.

The **Trees** pane groups **AST**, **Tokens**, **View data**, and **View** behind
a dropdown. **Split right** opens another copy with an independent tree
selection; both continue to follow live edits and replay. **Layout** remains a
separate pane.

Fixture dependency builds now require Emscripten 4.0.15 and CMake for cmark-gfm.
Alternatively, build that package with `pnpm --filter @vscode/cmark-gfm-wasm
build:docker`, then run `pnpm run build:fixtures` once the other fixture
dependencies have been built. Production editor bundles do not include this
fixture-only renderer.

### Language feature widgets

`RenameModel` / `RenameWidget` and `SuggestModel` / `SuggestWidget` are isolated,
observable-driven contributions exported from the package. Import
`@docode/markdown-editor/rename.css` or `@docode/markdown-editor/suggest.css`
alongside the corresponding widget. Hosts own provider requests, edit application,
command routing, and editor integration; importing a widget does not enable a
language feature automatically.

See the [rename integration guide](src/contrib/rename/README.md) and
[suggest integration guide](src/contrib/suggest/README.md) for their contracts,
focus handling, and lifecycle requirements.

### Milestone 1 editing coverage

The `editor/milestone-1` fixture group is generated from
`src/view/fixture/milestoneOneScenarios.ts`. Each unique source, directed
selection, and presentation state mounts the real editor directly. Screenshot
fixtures do not replay editing history: restored undo/redo states and other
identical states are deduplicated across the group. Behavioral tests cover
typing and history separately. The star has detailed prefix coverage; other
list markers each have a sanity state rather than a duplicate sequence.
Examples default to 360px wide and content-sized height. **Editor margin**,
width, markup policy, read-only toggle, and interactive input controls support
live visual review. Disabling editor margins retains a left rail for hanging
source markers. The source-selection status uses a fixed-height, ellipsized row.

| Family | Source-state coverage | Still to verify before milestone completion |
| --- | --- | --- |
| Text and whitespace | Spaces, tabs, soft line breaks, graphemes, empty/populated documents, directed selections | Empty-file DoCode integration, wrapping, clipboard and IME |
| Headings | ATX levels 1/2/6, setext creation, incomplete prefixes | Other levels, Enter/split/join and caret geometry across wrapping |
| Lists | Star prefixes, alternate-marker sanity checks, lazy continuation, stable blank-line carets, source/bullet alignment, list continuation/exit | Broader active-block ownership, indentation/outdent and nested combinations |
| Task lists | Checked/unchecked prefixes, nested task ownership, mixed sibling label alignment | Toggling/history and broader nested task transitions |
| Links | Inline destination completion, reference definition completion, formatted labels | Escapes/titles, selections at boundaries, mouse placement and wrapped labels |
| Inline formatting | Star/underscore italics, bold, strike, bold-italic and nested/adjacent emphasis | Delimiter boundary matrix, escaped punctuation, cross-line and cross-block selections |

These are coverage seeds, not a claim that every combination is complete.
Concrete feedback must receive a named fixture plus behavioral/geometry
assertions; screenshot review alone does not close a regression.
Point-to-source resolution always uses the editor's geometric hit test. The
demo's `caretDomPosArea` visualization samples that same path; the browser
caret hit-test alternative and its `caretDomPos`/`ownHitTest` switches are removed.

The list-marker review deliberately distinguishes presentation policies.
Editing presentation treats a bare `*`, `-`, `+`, or ordered marker as paragraph
text until its separator space/tab exists. A standalone bare marker has no list
indentation; a bare continuation stays in its existing bullet paragraph. Inserting
the separator promotes it, and deleting the separator reverses that promotion.
Reading presentation retains CommonMark empty-list parsing, with the caret
immediately after the actual marker rather than its synthetic gutter separator.
The `lists/lazy-continuation` checkpoints, parser ownership tests, and browser
geometry/history regressions cover these differences.

The `lists/empty-line-0` and `lists/lazy-empty-line`
checkpoints compare the same caret at EOF and before an additional newline,
without duplicate restored-state screenshots. The first empty continuation line of a
populated list paragraph keeps its indentation even when another newline follows;
the final line after the list terminator remains outside the list. Empty
marker-only items retain their existing empty-line placement.

`lists/nested-indent-dots` spreads source indentation indicators over the reserved
gutter. `lists/indent-space-1`, `lists/indent-space-2`, and `lists/indent-space-3`
isolate individual space selections and caret movement before a list marker.
Parsed list depth determines the gutter width; the actual source whitespace
shares that width evenly, rather than assuming two spaces per nesting level.
Each space's source-mapped text and dot fill its allocated cell. At the final
indentation boundary the caret meets the actual source glyph, including its
normal font sidebearing; the selection spans those exact caret endpoints.
Source-only spaces that do not create a nested item extend
leftward into the gutter instead of moving the logical bullet or text column.
Their display width uses the parsed marker prefix, not a fixed two-space rule.
Native bullet typography is unchanged.
Nested task prefixes use half-width indentation cells to bring their first
source-space dot closer to ordinary siblings without moving bullets, checkboxes,
or labels. Unordered-list continuation indentation reuses the source prefix's
indentation, marker, and separator cells, including an indented blank line
following a list. `lists/mixed-prefix-spaces`, `lists/blank-continuation-spaces`,
and `lists/nested-continuation-spaces` isolate these cases; browser tests verify
each cell's geometry, clicking, arrow movement, and typing at four font sizes.
Within a list paragraph, continuation whitespace takes no space while the block
is inactive. Activating the block reveals the source prefix inline so its spaces
indent the continuation text, rather than placing them in a left-hand gutter.
Quote prefixes and list indentation on the same line share that source span.
Whitespace remains source-mapped for clicking, navigation, and editing.
The `lists/same-paragraph-continuation`, `lists/nested-same-paragraph-continuation`,
`lists/quoted-same-paragraph-continuation`, and
`lists/uneven-same-paragraph-continuation` fixtures show inactive and active
states. Browser tests cover ordinary, ordered, task, nested and quoted lists,
tabs, CRLF, hard breaks, wrapped lines, cross-line formatting/link labels,
multiple continuation lines, prefix clicks, and caret movement.
Reading presentation retains its existing soft-line-break behavior.
The `lists/indent-depth-2`, `lists/indent-depth-uneven`, and `lists/indent-prefix-3`
fixtures reconstruct the nested-spacing feedback with minimal sources.
Browser geometry assertions also cover wider ordered prefixes, tabs,
markup visibility, typing, and undo.

Typing the third backtick of a new opening fence inserts a closing fence on the
next line, leaving the caret on the opener for a language name. Container
indentation is retained; pasted, inline, already-paired, and closing fences are
not completed. `formatting/fence-completion` captures the typing states. Enter
inside a fenced block preserves its indentation in editing presentation.
`lists/fenced-continuation-spaces` covers list-contained fences: opening, code,
and closing-line spaces reuse the list's source prefix cells, including with
syntax highlighting, without changing reading presentation.

The mode toggle is a sticky overlay in the right margin when there is room,
and may overlap content in narrow editors. It never changes text flow or reserves
an asymmetric rail. Left and right padding use two fixed sizes, without
intermediate scaling: 8px through 600px editor width, then 48px.
Once the document reaches its configured maximum width (900px by default),
it stays that width and additional space goes equally to the outer margins.
Disabling the width limit keeps the 48px margins on wide editors.
Top-level headings retain
symmetric 2em minimum clearance for their hanging markers, independent of heading
level. Long prefixes scale to fit that gutter instead of moving the document.
Top padding stays at 32px regardless of editor width, document content, or
scrollbar gutters. The DoCode webview uses thin scrollbars with transparent
tracks. First and later headings use identical font line boxes, preserving the
same text-to-underline spacing. Only the first block's top margin is removed;
the fixed top padding provides the optical spacing adjustment.
The `editor/readonly-toggle/` fixtures include wide, narrow, and scrolling documents.
The first block has no additional top margin in either presentation. The first
block inside a blockquote also has no top margin, preventing it from collapsing
outward and shifting the quote when a marker-only line gains content. The
paired `HeadingReading` and `HeadingEditing` fixtures and lock-toggle browser
tests guard its text position. DoCode themes map whitespace indicators to
`editorWhitespace.foreground`, including its dark-theme opacity.
The `HeadingSpacingH1` and `HeadingSpacingH2` fixtures compare first and later
headings; browser tests cover their underline spacing across themes, widths,
wrapped text, presentation modes, and active or inactive selections.

An empty, unlocked document in editing presentation always keeps a collapsed
selection at offset zero and its active typing block, including after Escape,
margin clicks, clicks below the document, and external selection clearing.
This does not take keyboard focus: the caret blinks only while the editor is
focused. Reading and locked documents keep their existing selection behavior.
`EmptyEditing` captures the empty surface; browser tests verify actual blink
cycles, blur, typing/deleting, and presentation/lock transitions.

Escape clears an existing selection, including a collapsed caret, and cancels
any pending empty paragraph. The exception is an empty, unlocked editing
document: Escape keeps its caret and active block visible so typing can begin
immediately. Open find/suggestion widgets and focused nested
controls handle Escape first. With no selection or pending paragraph, Escape
remains available to the host. Clicking beside or below a non-empty document also
clears selection. The empty-document invariant is enforced by the view, not by
individual input handlers. The editor fills a fixed-height host so its blank
area receives the same pointer handling as the margins, without stretching the
document itself.

Set `EditorViewOptions.highlightActiveBlock` to `false` to disable the active
block's background and glow, or update the live `view.highlightActiveBlock`
observable. This does not change active source markers, selection, or editing
behavior. Highlighting is enabled by default.

Empty ATX headings keep their separator whitespace in the same source marker
as populated headings. A zero-source-length line anchor preserves the heading
caret's column and line box when typing or removing its first character.
The existing `headings/atx-*` empty-prefix states and `headings/prefix-caret-*`
populated states cover this transition.

Rich-link pills at the end of a rendered line may use the remaining content
width before truncating their title. Short titles retain their natural width;
pills followed by prose retain their compact title limit. The width is updated
with editor layout and metadata changes, respecting list indentation and the
mode toggle's local exclusion rectangle. `Links/Rich links/Static/Trailing titles`
provides long, short, mid-line, formatted, and session-link examples.

`task-lists/nested-task-ownership` prevents a child checkbox from turning its
parent into a task. `task-lists/mixed-task-labels` aligns labels of task and
ordinary sibling items while preserving nested indentation. The ordinary
item's real separator spaces expand to fill the extra label-column width.
`task-lists/nested-task-empty-sibling-*` and `task-lists/mixed-task-separated-lists-*`
isolate populated/empty nested tasks and mixed lists separated by a thematic break.
In both presentations, checkboxes and ordinary bullets share a gutter column;
the task's extra source bullet hangs farther left. Labels keep their position
when markup visibility changes, except for extra source-only separator padding.
`lists/mixed-label-column` compares the same nested labels in reading and editing;
both use one shared marker/label layout rather than separate task indentation.
The expanded ordinary separator has a visible
whitespace dot. Browser tests click task-label characters with markup hidden,
selection-revealed, and fully revealed, then verify exact insertion offsets.
`task-lists/empty-task-label` keeps a completed checkbox plus separator structural
before label text is typed in editing presentation. Reading retains standard GFM
parsing. Typing or deleting the label must not change checkbox ownership or move
the empty caret's text column.
The `task-lists/checkbox-separator-*` fixtures cover the caret immediately
after `]`, after its first separator, and after an extra space. In editing
presentation, the first separator reaches the label column and each additional
space advances normally. The checkbox and separator participate in inline layout,
so native text ranges, clicks, and the painted caret agree.
The `lists/extra-separator-continuation-spaces` and
`lists/extra-separator-blank-line` fixtures protect `-   test` followed by a blank
line and `    test`: the four prefix cells align and the blank-line caret sits
at the active label column.
Editing also treats `- [] test` as unchecked, preserving task layout through
`[x]` -> `[]` -> `[ ]` edits without inserting a space into the source.
Reading keeps `[]` as literal text. The normal separator requirement remains;
`- []text` and a bare `- []` at EOF are not tasks. The reduced
`task-lists/checkbox-value-0`, `checkbox-value-1`, and `checkbox-value-2`
fixtures cover all three values in reading and editing presentation.
The paired `task-lists/checkbox-line-end-empty` and `task-lists/checkbox-line-end-filled`
states extend this guarantee to a checkbox followed directly by a newline:
typing on the continuation must neither create the checkbox nor move the caret
column. Bare `* [ ]` without a separator retains standard non-task parsing.
`lists/nested-parent-filled` and `lists/nested-parent-empty` preserve the parent's
marker separator and its own visual line when its last label character is
removed. The nested item's row and indentation must not move. Parser tests cover
LF, CRLF, CR, source tiling, and incremental edits; browser tests assert the
caret and nested-item coordinates through deletion and retyping.
`task-lists/continuation-enter` covers a blank task continuation: editing Enter
inserts only `\n`. List auto-continuation still applies on the item's own marker
line, not every later line owned by that item.
`task-lists/checkbox-newline` keeps the line ending after `[ ]` in paragraph
flow instead of the absolutely positioned checkbox source.
The paired `lists/marker-separator-1` and `lists/marker-separator-2` states keep
the marker fixed while additional separator characters move the content right.
Extra spaces occupy half-em source cells. Unordered source symbols use the
body font and baseline in a one-em gutter cell, followed by a half-em separator.
Native reading bullets retain their original size, font, and nested list style;
we do not require unrelated glyphs to have identical pixel ink bounds across
fallback fonts. Geometry tests cover multiple font families and sizes.

`lists/separator-activation-inactive` and `lists/separator-activation-active`
show that extra source-only separator padding collapses outside the active
item. Nested logical gutters do not move. The explicit `all` and `none` markup
policies still force revelation or hiding.
`formatting/table-cell-outside`, `formatting/table-cell-first`, and
`formatting/table-cell-second` keep inline formatting markers out of the
inactive cells' layout. Activating another cell may resize columns; source
offsets remain distinct within each resulting layout.

`lists/blank-between-items` keeps list-level blank separators at their
surrounding container's margin, including typing and undo/redo. These separators
are distinct from continuation lines within a list-item paragraph.
`lists/first-blank-between-items` covers the first empty line immediately after
populated item text: its caret stays at the item's text indent, even when later
blank lines and another item follow. Moving to the next blank line moves to the
document margin. Browser tests compare each empty-line caret with the position
of ordinary text inserted there, across nested, ordered, and quoted lists,
empty items, and LF and CRLF endings. Parser source-ownership and incremental
reconciliation tests also cover CR endings.

`listMarkerAlignment/Source versus rendered bullet` places the production
source star and rendered bullet side by side. Reading bullets retain native
browser typography; source symbols use the body font and baseline, centered
in a one-em gutter slot. Browser regressions check the source column and
baseline across font families and sizes, and ensure reading bullets are not
replaced or resized. They deliberately do not require optical ink centers to
match across different glyphs and fallback fonts.

### Screenshot CI

All fixtures use the package-local `fixtureUtils.ts` wrapper to disable CSS
animations and transitions within their own container, including the mode
toggle and cursor. Editor examples restore live motion when **Interactive mode**
is enabled. The custom cycling highlighter stays fixed by default; enable
**Cycle keyword colors** to exercise its live observable updates. Property
fixtures keep their complete diagnostic evidence in a **Replay log** disclosure,
collapsed by default so screenshots capture the editor rather than the JSON.

The `markdown-editor-screenshots` workflow captures every fixture discovered
by this package's Component Explorer configuration, including content,
diagnostic, property, and widget fixtures. There is no fixture-ID allowlist
or fixed fixture count; new fixtures are included automatically. The separate
screenshot job runs for every PR targeting main and every push to main, without
changed-path gates. Turbo decides which computations can be reused; commit
manifest publication always runs for authorized events, including cache hits.
This registers unchanged snapshots for new commit SHAs so unrelated main
changes do not leave holes in the baseline history. Pages reload
between fixtures to isolate their rendering. Capture uses `build:fixtures`
and `component-explorer.screenshots.json` to serve a static build on an
ephemeral local port, avoiding dev-server dependency optimization and module
reloads during a full run. Interactive exploration still uses the regular
`component-explorer.json` dev-server configuration. On the hosted Ubuntu runner,
CI removes the unused Android SDK before installing dependencies to leave
disk space for the full capture. The package-owned
`scripts/screenshots.mjs` and `screenshots` task store their
validated render JSON (without Git commit metadata or PNGs) in Turborepo's
cross-commit cache. The publish step attaches the *current* commit and the
`markdown-editor` service project ID, checks each content hash against
the screenshot service, and uploads only missing PNGs. If a cached hash is
missing remotely and its PNG is no longer local, it recaptures and verifies
the image before publishing; unchanged hashes already present remotely need
no browser run on a cache hit.

CI restores only the published-cache namespace and saves it after successful
image/manifest upload and validation. Fork and Dependabot runs do not populate
this cache. Thus a reusable CI snapshot's images have already been published;
PNGs remain in the service rather than in Turbo. The existing missing-image
recovery also supports local caches and older snapshots.

Before consulting the screenshot cache, CI builds the renderer and its
dependencies with `pnpm --filter @vscode/component-explorer-cli... run build`.
This deliberately bypasses Turbo's dependency-build cache: package builds can
also generate external dependency outputs (such as LinkRPC), which are not
restored by a cache entry containing only that package's `dist` directory.
Screenshot render results remain cached across commits.
Screenshot-script tests and fixture typechecking are explicit Turbo tasks.
Rendering depends on successful fixture typechecking, including on cache hits;
unchanged successful checks need not execute again. Commit metadata, service
publication, and PR reporting remain outside the cached tasks.

Image lookups run in batches of at most eight, use a 10-second timeout per attempt, and retry transient network
errors and HTTP 429/500/502/503/504 responses up to three total attempts, with
one- and two-second backoffs logged to CI. Only HTTP 404 means an image is
missing; persistent service errors fail preparation rather than being hidden.
The workflow archives the per-commit manifest and writes an advisory
base-commit comparison with before/after screenshots to the job summary.
Non-fork PRs also get a single updated comparison comment. Large comments
stop at a complete fixture boundary below GitHub's size limit; the complete
comparison remains in the job summary and `markdown-editor-screenshot-report`
artifact. Comparisons can
read the legacy `markdown-editor-pilot` baseline until main has published
under the new project ID; new uploads always use `markdown-editor`.
Diagnostic fixture errors remain in the published manifest and are listed
explicitly in the comparison report, including fixtures that could not produce
an image. Every fixture must pass diagnostics for required CI to be green,
including when its result is restored from the screenshot cache. The diagnostic
check runs after artifacts, uploads, reports, and PR comments so failures retain
their evidence. Run `node scripts/screenshots.mjs check` locally to check the
cached manifest, or pass a manifest path to check a specific capture.
Visual screenshot changes remain advisory, not merge gates.
Empty, duplicate, or malformed manifests, infrastructure failures, and
invalid image hashes still fail CI.

The service must support its existing `/images/<sha256>`,
`/commits/<owner>/<repo>/<sha>`, and authenticated `/upload` endpoints, with
project snapshots enabled. The upload step sends the manifest and
missing PNGs as a ZIP directly; no service-side GitHub token is needed to
download Actions artifacts. Main-branch pushes and non-fork PRs authenticate using GitHub
Actions OIDC (the same mechanism used by DoCode screenshot CI), not a new
repository secret. The service must authorize this repository's main pushes
and non-fork PR tokens for its OIDC audience. Fork and Dependabot PRs skip
OIDC upload and commenting; their job summary links to the workflow artifacts
instead of embedding unpublished images. Upload or unexpected baseline-service
errors fail CI explicitly, while artifacts are preserved for inspection.
The reusable `markdown-editor-screenshots` workflow handles rendering,
archiving, upload, and reporting for both callers. Both `required` and the
main-push-only `markdown-editor-screenshots-publish` caller explicitly grant
`contents: read`, `id-token: write`, and `pull-requests: write`; reusable
workflows cannot elevate their caller's permissions.
The workflow's
public service URL and runner/font configuration must be updated together
when changing service or rendering environment; renderer source, fixture
inputs, dependency lockfile, and the runner image version participate in
the Turbo cache key. Branch protection still requires the repository
administrator to mark the umbrella `Required / required` check as required.

Screenshot orchestration, contract tests (`pnpm run test:screenshots`), and
the Turbo task configuration live in this package. Component Explorer provides
the reusable renderer and screenshot service, with no Markdown-specific scripts.
The `markdown-editor-screenshots` artifact contains the upload manifest and new
PNGs; `markdown-editor-screenshot-render` preserves render diagnostics.

Start with the [current implementation specification](./docs/specification.md).
It explains the architecture, runtime data flow, public integration surface,
extension points, the DoCode custom text editor adapter, tests, and current
limitations.

Other package documents:

- [Original design](./docs/design.md) - historical design intent.
- [Original implementation plan](./docs/plan.md) - historical roadmap; its
  checkboxes do not describe current completion.
- [Engineering backlog](./docs/todo.md) - known issues and future work.

From this package directory:

```sh
pnpm test
pnpm test:e2e
pnpm build
pnpm build:explorer
```

Playwright reuses test servers from the same worktree using a deterministic
worktree-specific port pair. Set `DOCODE_MARKDOWN_EDITOR_E2E_BASE_PORT` to the
first port of a different adjacent pair if the generated ports conflict with
another local service.

From the `docode-packages` workspace root, run `tilt up` to supervise the editor
test page in Tilt's local web UI at http://localhost:10350. Tilt checks the
workspace installation with `pnpm install --frozen-lockfile` first; the `editor`
resource then serves the test page at its worktree-specific URL (shown in the
Tilt UI). Enable the optional `fixtures` resource in the UI to build and serve
the Component Explorer fixtures on the adjacent port. The servers run locally;
Docker and Kubernetes are not needed. Disable either server in the UI to stop
it, or run `tilt down` to stop Tilt's resources. To start only the fixtures
from the command line, use `tilt up fixtures`.

Install [Tilt](https://docs.tilt.dev/install.html) and use a Node installation
that supports TypeScript type stripping (Node 22.6+). Corepack runs the pnpm
version pinned in the workspace's `package.json`. The same
`DOCODE_MARKDOWN_EDITOR_E2E_BASE_PORT` override applies to both Tilt servers.

The multi-repository workspace also has a `Tiltfile` beside
`markdown-editor.code-workspace`. Run `tilt up` from that directory to see the
package resources and optional DoCode resources in one dashboard. From either
dashboard, enable `markdown-explorer` for the interactive Component Explorer
(port 5339), `explorer-demo` for its demo app (port 5174),
`markdown-package-watch`, or `team-tools-watch`. The `fixtures` resource above
is a built preview, not the interactive Component Explorer CLI server. Enabling
`markdown-explorer` requires stopping any separately launched Component
Explorer daemon for this same project first; Tilt will not terminate it.

In the multi-repository dashboard, `docode-markdown-webview-watch` and
`docode-client-watch` run watchers from the DoCode checkout, while
`docode-explorer` serves its separate Component Explorer (port 5337).
`docode-extension-host` builds Team Tools and launches Code - OSS with an
isolated profile, no built-in or installed extensions, and only the Team Tools
development extension. Disabling the resource closes that window, not other
DoCode instances. The DoCode checkout needs its own dependencies installed
before enabling its watchers or Component Explorer.
