# Sessions Layer Rules

> **Specification change gate:** Do not update this document for a bug fix that restores the existing import hierarchy. Update it only when the enforced layering contract intentionally changes.

This document describes the import layering rules for `src/do/sessions/`, enforced by the `local/code-import-patterns` ESLint rule.

The sessions layer sits above `do/workbench` in the VS Code source code hierarchy. For the broader VS Code layer rules (base → platform → editor → workbench → sessions), see `.github/instructions/source-code-organization.instructions.md`.

## Layer Hierarchy

```
┌─────────────────────────────────────────────────────┐
│  Entry Points                                       │
│  sessions.common.main.ts / .desktop.main.ts /       │
│  .web.main.ts / .web.main.internal.ts               │
│  (can import everything below)                      │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────────┐
│ contrib/*  │  │ contrib/   │  │                │
│ (chat,     │  │ providers/ │  │  services/*    │
│  sessions, │  │ (agentHost,│  │                │
│  changes,  │  │  copilot,  │  │                │
│  ...)      │  │  remote)   │  │                │
└─────┬──────┘  └─────┬──────┘  └───────┬────────┘
      │               │                │
      │               │                │
      ▼               ▼                ▼
┌─────────────────────────────────────────────────────┐
│  sessions/~  (core: browser/, common/, electron-browser/) │
└─────────────────────────────────────────────────────┘
```

## Rules by Target

### `sessions/~` — Sessions Core

**Path:** `src/do/sessions/{browser,common,electron-browser}/**`

The foundational layer. It may import from the sessions **services** layer, but not from any `contrib/` code above it.

**Can import from:**
- `do/base/~`, `do/base/parts/*/~`
- `do/platform/*/~`
- `do/editor/~`, `do/editor/contrib/*/~`
- `do/workbench/~`, `do/workbench/browser/**`, `do/workbench/services/*/~`
- `do/sessions/~` (self), `do/sessions/services/*/~`

> **Note:** The desktop bootstrap entry `src/do/sessions/electron-browser/sessions.ts` has its own, **more restrictive** rule: it may import only `do/base/~`, `do/base/parts/*/~`, `do/platform/*/~`, `do/sessions/~`, and `do/sessions/sessions.desktop.main.js`.

**Cannot import from:**
- ❌ `do/sessions/contrib/*` — no contrib dependencies
- ❌ `do/sessions/contrib/providers/*` — no provider dependencies

---

### `sessions/services/*/~` — Sessions Services

**Path:** `src/do/sessions/services/*/{browser,common}/**`

Service layer sits alongside core. Provides shared service interfaces and implementations.

**Can import from:**
- Everything `sessions/~` can import (**except** `do/workbench/browser/**`, which is not granted to services), plus:
- `do/sessions/services/*/~` (sibling services)
- `do/workbench/contrib/*/~`

**Cannot import from:**
- ❌ `do/sessions/contrib/*` — no contrib dependencies
- ❌ `do/sessions/contrib/providers/*` — no provider dependencies

---

### `sessions/contrib/*/~` — Contributions (non-provider)

**Path:** `src/do/sessions/contrib/*/{browser,common}/**` (excluding `contrib/providers/`)

Feature contributions like `chat`, `sessions`, `changes`, `terminal`, etc.

**Can import from:**
- Everything `sessions/services/*/~` can import, plus:
- `do/sessions/contrib/*/~` (sibling contributions)

**Cannot import from:**
- ❌ `do/sessions/contrib/providers/*/~` — **providers are isolated from non-provider contribs**

---

### `sessions/contrib/providers/*/~` — Session Providers

**Path:** `src/do/sessions/contrib/providers/*/{browser,common}/**`

Provider implementations (`agentHost`, `copilotChatSessions`, `remoteAgentHost`). These are the compute backends that register with `ISessionsProvidersService`.

**Can import from:**
- Everything `sessions/contrib/*/~` can import, plus:
- `do/sessions/contrib/providers/*/~` (sibling providers)

This is the **most permissive** contrib layer — providers can reach into non-provider contribs and sibling providers, but not vice versa.

---

### Entry Points

| File | Layer | Notes |
|------|-------|-------|
| `sessions.common.main.ts` | `browser` | Shared contributions for all platforms |
| `sessions.desktop.main.ts` | `electron-browser` | Desktop-specific, imports `sessions.common.main.js` |
| `sessions.web.main.ts` | `browser` | Web-specific, imports `sessions.common.main.js` |
| `sessions.web.main.internal.ts` | `browser` | Internal web variant, imports `sessions.web.main.js` |

Entry points can import from all sessions layers: `sessions/~`, `services/*/~`, `contrib/*/~`, and `contrib/providers/*/~`.

---

## Key Constraint

```
contrib/*  ──✕──▶  contrib/providers/*
```

Non-provider contributions **must not** import from provider code. If a provider exposes a symbol needed by non-provider code, that symbol should be extracted to a shared location (`do/sessions/services/`, `do/sessions/common/`, or a shared contrib module).

Providers **can** import from non-provider contributions and from sibling providers.
