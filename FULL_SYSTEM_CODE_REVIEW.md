# Складской Терминал — Full Systematic Code Review

## 1) Executive summary (Top-10 priority issues)

1. **CRITICAL — Basic Auth credentials are persisted in plain text in `localStorage` and used directly from client JS** (`sets.user`, `sets.pass`, `sets.apiKey`, default `mgr`). This allows instant credential theft via any XSS/browser compromise/device access. **Fix:** move auth to backend session/token, never store ERP password in browser storage; remove default secrets.  
   Location: `defSets`, `save`, settings load/save.
2. **CRITICAL — Role enforcement is client-only (`isMgr`, `app_is_mgr`, `app_mgr_expires`) and fully bypassable from DevTools/localStorage.** **Fix:** enforce authorization server-side for any privileged API/operation; sign/verify roles server-issued.
3. **HIGH — Unsafe HTML interpolation in `renderForm` (`value="${sets.printNameDefault || ''}"`) enables stored XSS from manipulated settings/localStorage.** **Fix:** build form via DOM APIs or escape attribute values.
4. **HIGH — Default API endpoint is plain HTTP (`http://83.237.242.90:3000`) while Basic Auth is used.** Credentials can be intercepted. **Fix:** enforce HTTPS-only URL and block insecure protocol.
5. **HIGH — IDB persistence appears half-integrated: `saveDb()` writes to IndexedDB but is never called after mutations (`save()` writes only localStorage).** Risk of stale/partial offline state and migration confusion. **Fix:** unify persistence path; call single atomic persistence function.
6. **HIGH — `flushOutbox()` lacks `finally` reset of `outboxFlushing`; unexpected runtime error can deadlock queue forever.** **Fix:** wrap flushing body in `try/finally`.
7. **MEDIUM — `renderRows()` dereferences `d.items` without null-check (`d = db[curTab].find(...)`), can crash on stale `curDocId` after async/navigation.** **Fix:** guard `if (!d) return` and resync state.
8. **MEDIUM — Scanner keystroke capture is global and simplistic (`keydown` + 180ms reset); can misclassify human typing/scanner noise and lose scans.** **Fix:** dedicated hidden input scanner mode + prefix/suffix framing and stricter debounce.
9. **MEDIUM — PWA manifest is minimal and incomplete for robust installability (no `icons`, `id`, `scope`).** **Fix:** add full manifest fields and icon set.
10. **LOW — Accessibility gaps: `user-scalable=no`, icon-only controls missing labels in dynamic UI (`renderSettingsWh`).** **Fix:** allow zoom, add `aria-label` systematically.

---

## 2) Full findings table

| Section | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| 1.1 AuthZ | CRITICAL | `defSets` / `save()` / `openSettings()` / `saveSets()` | Sensitive credentials are stored in `localStorage` (`sets.user`, `sets.pass`, `sets.apiKey`, manager data). Any XSS or local access exfiltrates them. | Keep credentials server-side; issue short-lived tokens; if unavoidable, store only opaque refresh/session IDs with secure backend rotation. |
| 1.1 AuthZ | CRITICAL | `checkSessionValidity()`, `saveAppState()`, `loginSuccess()` | Manager role depends on mutable browser state (`app_is_mgr`, `app_mgr_expires`, `isMgr`) and can be tampered with client-side. | Enforce RBAC on backend endpoints and document submission API; ignore client-declared roles. |
| 1.1 AuthZ | HIGH | `defSets` | Hardcoded defaults include manager password (`mgr:"1234"`) and static API key. | Remove hardcoded secrets from client bundle; bootstrap securely from backend with rotation. |
| 1.2 XSS | HIGH | `renderForm()` receive template | Unsafe interpolation into HTML attribute: `value="${sets.printNameDefault || ''}"`. A quote payload can break out and inject event handlers. | Use DOM creation (`input.value = ...`) or HTML-escape (`&quot;`, `&lt;`, etc.). |
| 1.2 XSS | MEDIUM | `renderReceivePhotoPreview()` | `src="${src}"` in `innerHTML`; currently fed by processed data URL, but sink is unsafe if source changes later. | Create `<img>` via DOM API and assign `img.src`; validate protocol whitelist (`data:image/`, `https:`). |
| 1.2 XSS | INFO | `loadStockPreview()` | Positive: 1C row data inserted via `textContent`, not `innerHTML`. | Keep this pattern across all API-derived fields. |
| 1.3 Input validation | MEDIUM | `handleScan()`, `search1C()`, `resolveCodeToArt()` | Scanner/manual input is trimmed but not normalized with strict charset/length before use in business logic and API calls. | Add centralized validator (`^[A-Z0-9._\-/]{1,64}$` by mode), reject invalid payloads early. |
| 1.3 Input validation | LOW | `doManualSearch()` | Manual input uppercases in HTML handler but no formal validation/error feedback beyond not-empty. | Add explicit validation message and sanitization helper reused by scanner/manual paths. |
| 1.4 API/network | HIGH | `defSets.url`, `validateUrlField()` | HTTP is allowed and default URL is HTTP while Basic Auth is sent. | Force HTTPS in validator and block save/test for insecure endpoints in production. |
| 1.4 API/network | MEDIUM | all `fetch` to 1C backend | CORS/security model depends entirely on backend; app sends Basic Auth headers from JS, exposing credentials to browser context and extensions. | Move to backend session proxy; lock CORS allowlist and origin checks server-side. |
| 1.4 API/network | LOW | `showApiError()`, `logError()` usages | Endpoint/status surfaced to UI (good for support) but may leak internals if expanded with raw backend messages later. | Keep user-safe generic errors, store detailed diagnostics in protected logs. |
| 1.5 Sensitive data | HIGH | `exportData()` | Backup exports full `{db, sets}` including credentials/API keys into portable JSON without warning/redaction. | Redact secrets by default; provide “include credentials” opt-in behind manager warning. |
| 2.1 State mgmt | HIGH | Global mutable state block | Large shared mutable globals (`db`, `sets`, `curTab`, `curDocId`, caches, flags) increase race/staleness risk. | Introduce centralized store/state machine with immutable updates for critical transitions. |
| 2.1 State mgmt | HIGH | `saveDb()` vs `save()` | Two persistence paths; `saveDb()` exists for IDB but app mutations call `save()` (localStorage), so IDB can go stale. | Consolidate to one async `persistAll()` writing IDB + fallback atomically. |
| 2.2 Async | HIGH | `flushOutbox()` | `outboxFlushing` lock reset is not in `finally`; unexpected throw leaves lock stuck and queue never flushes. | Wrap lock lifecycle in `try { ... } finally { outboxFlushing = false; }`. |
| 2.2 Async | MEDIUM | periodic callbacks (`setInterval`/`setTimeout`) | Several async invocations are fire-and-forget; failures may be swallowed. | Add guarded wrappers or `.catch(logError)` for scheduled async actions. |
| 2.3 Scanner | MEDIUM | `window keydown` scanner buffer | Buffer reset 180ms and global key capture can drop slower scanner streams or conflict with keyboard usage. | Use scanner suffix (Enter/TAB), min/max length, and configurable inter-key timeout profile. |
| 2.3 Scanner | INFO | `handleScan()` | Duplicate prevention exists (`SCAN_COOLDOWN_MS` + same code check). | Keep, but persist last scan per document to avoid replays after reload. |
| 2.4 Outbox | MEDIUM | `flushOutbox()` + `outboxMarkError()` | Item removal only after success; crash mid-loop can repeat send on restart (at-least-once semantics). | Add idempotency key (`doc.id`) server-side and local per-item in-flight marker/ack checkpoint. |
| 2.4 Outbox | INFO | `outboxFlushing` | Concurrency gate prevents simultaneous flush calls in normal flow. | Keep gate, add `finally` and telemetry for lock health. |
| 2.5 Data integrity | MEDIUM | `normalizeId(v){ return String(v) }` + mixed comparisons | ID normalization is weak; not consistently used in all equality checks (`===` vs normalized). | Normalize on write (UUID/string canonical form) and use helper consistently. |
| 2.5 Data integrity | MEDIUM | `renderRows()` | Possible null dereference when document not found: `d.items.forEach(...)`. | Guard document existence and reroute to list view if stale. |
| 2.6 Persistence | LOW | `saveOutbox()` | No quota/error handling around outbox writes. | Add try/catch with user feedback and fallback compression/cleanup policy. |
| 2.6 Persistence | INFO | `save()` and `saveDb()` | QuotaExceeded handling exists for main `save()` and localStorage fallback in `saveDb()`. | Good baseline; extend same behavior to all storage writes. |
| 2.7 Event leaks | LOW | `initOutbox()`, `window.onload` listeners | Listeners/timers are not de-registered (acceptable in single-page lifetime) but can duplicate if `initOutbox()` ever re-called. | Add idempotent init guard flag. |
| 3.1 Service Worker | MEDIUM | `sw.js` | Cache strategy is generic cache-first + runtime put for all GET; can cache API responses unintentionally and serve stale data. | Exclude API paths from cache or use network-first for API, cache-first for static assets. |
| 3.1 Manifest | MEDIUM | `manifest.webmanifest` | Missing icons/scope/id/description/screenshots reduces install quality/compliance across platforms. | Add at least 192/512 icons, `id`, `scope`, `description`, `lang`. |
| 3.2 Viewport/mobile | LOW | `<meta viewport ... user-scalable=no>` | Disables zoom and hurts accessibility/WCAG 1.4.4. | Remove `user-scalable=no` and allow zoom. |
| 3.2 Viewport/mobile | INFO | CSS `100dvh` with JS sync | Positive: app uses `--app-height` + resize/orientation updates to mitigate mobile viewport issues. | Keep fallback strategy and test on iOS Safari keyboard edge cases. |
| 3.2 Keyboard offset | LOW | `setupKeyboardAvoidance()` | Virtual keyboard heuristics may vary across vendors; risk of layout jumps. | Feature-detect VisualViewport robustly and clamp offsets by safe bounds. |
| 3.3 Burn-in guard | MEDIUM | `burnInGuard` IIFE monkey patch | Patching `window.loginSuccess/logout` assumes definitions already exist; fragile with script ordering/refactors. | Convert to explicit hook calls from login/logout, or event-based integration. |
| 3.3 Burn-in guard | LOW | `EVENTS.forEach(document.addEventListener...)` | High-frequency `pointermove` reset can create extra timer churn. | Throttle reset calls (e.g., once per 250–500ms). |
| 4.1 Rendering | MEDIUM | `renderDocList()`, `renderRows()`, `renderForm()` | Full re-renders for every update; no virtualization/pagination for large datasets. | Introduce keyed incremental updates or virtual list for history/docs. |
| 4.2 Memory | INFO | `exportData()` | Positive: object URL revoked via `URL.revokeObjectURL`. | Keep this pattern in all future blob flows. |
| 4.3 Timers | LOW | `window.onload` session interval | `setInterval` for session expiry is never cleared (page lifetime acceptable). | Keep reference for cleanup if hot-reload/re-init becomes possible. |
| 4.3 Timers | INFO | `outboxTimer` | Existing `if (outboxTimer) clearInterval(outboxTimer)` before reassign. | Good practice; keep idempotent init. |
| 5.1 Dead code | MEDIUM | `saveDb()` | Function appears unused after initialization path, indicating dead/unfinished persistence integration. | Either wire into `save()` or remove/refactor. |
| 5.2 Inconsistency | LOW | codebase-wide | Mixed error handling styles: silent catches, logged catches, UI toasts; inconsistent observability. | Standardize with `handleError(context, err, userMessage)` helper. |
| 5.3 Magic values | LOW | multiple | Hardcoded numbers: scan 180ms/250ms/1200ms, retry 30s, timers 3/5 min, 15s overlays, etc. | Extract to named constants grouped by domain (`SCAN_CFG`, `BURNIN_CFG`, `OUTBOX_CFG`). |
| 5.4 SRP | MEDIUM | `renderForm()`, `saveLine()`, `showProduct()` | High-complexity multi-responsibility functions (UI build + business logic + side effects). | Split into pure mappers/validators + view renderers + command handlers. |
| 6.1 Keyboard nav | LOW | dynamic UI areas | Many controls are buttons/inputs (good), but scanner-focus forcing may steal focus unexpectedly. | Gate focus hijack when user is actively typing in form fields/modal controls. |
| 6.2 ARIA | LOW | `renderSettingsWh()` dynamic buttons | Generated arrow/delete buttons have no explicit `aria-label`. | Add semantic labels (`Переместить склад вверх/вниз`, `Удалить склад ...`). |
| 6.3 Contrast | INFO | main theme variables | Most text/background combinations appear high-contrast; danger/warning chips should still be verified with tooling. | Run automated contrast audit (axe/lighthouse) on key screens. |
| 6.4 SR announcements | LOW | validation helpers (`fieldError`) | Visual field errors are shown, but no `aria-live`/`role="alert"` for screen readers. | Add live region and `aria-invalid` + `aria-describedby` wiring for error messages. |

---

## 3) Positive notes

- Good defensive use of `textContent` in multiple API-data render paths (e.g., stock rows), reducing XSS exposure.
- Outbox design has explicit states (`pending/sent/error`) and user-visible indicator, which improves offline transparency.
- `apiFetch` uses `AbortController` timeout wrapper (prevents hanging network calls).
- LocalStorage quota handling exists in key save paths with user notification.
- Session expiry workflow exists (timer + periodic check), better than permanent admin mode.
- Service worker registration is guarded for unsupported protocols (`file:`, `blob:`, `about:`).

---

## 4) Recommended refactoring roadmap (impact × effort)

1. **(High impact / Medium effort)** Replace client-stored Basic Auth with backend-mediated auth/session proxy and remove all client secrets.
2. **(High / Low)** Enforce HTTPS-only configuration; block insecure URL save and add migration warning for existing `http://` config.
3. **(High / Medium)** Unify persistence (`save` + IDB + outbox) into one atomic async storage layer with schema versioning and integrity checks.
4. **(High / Low)** Harden outbox reliability: `try/finally` lock reset, idempotency keys, per-item in-flight markers.
5. **(Medium / Medium)** Replace string-template `innerHTML` form builders with DOM factories (or trusted templating + escaping).
6. **(Medium / Medium)** Introduce centralized validation/sanitization module for scanner/manual/articul/cell inputs.
7. **(Medium / Medium)** Break “god” functions (`renderForm`, `saveLine`, `showProduct`) into composable units and add unit tests for validators and mappers.
8. **(Medium / Low)** Improve accessibility: allow zoom, add ARIA labels to dynamic icon buttons, add `aria-live` error announcements.
9. **(Low / Low)** Externalize timing and retry constants into config objects for maintainability.
10. **(Low / Medium)** Improve PWA metadata/assets (icons, scope/id, screenshots) and tune SW caching by resource class.
