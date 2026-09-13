# Task 3-b-settings — UnifiedSettings PRO/tab removal (self-hosted)

## Scope
Surgical removal of the 4 SaaS-backend account tabs (billing, api-keys, embeds, mcp-clients) from the settings modal in /home/z/worldmonitor, keeping settings/panels/sources/notifications fully working. Continuation of task 3-a (gating predicates hardwired always-true).

## Changes
- **src/components/UnifiedSettings.ts** (2417 → 907 lines, −1510):
  - render(): removed billing/api-keys/embeds/mcp-clients tab buttons + tab panels; availableTabs now `['settings','panels','sources', ...notifications?]`; dropped showEmbedsTab/showMcpClientsTab and the `loadAccountData` param; kept `${legalLinksHtml(WEB_APP_ORIGIN)}` (still used — Terms/Privacy row, import kept).
  - open(): removed `unavailable` computation and the onEntitlementChange / onEntitlementVerificationChange / onSubscriptionChange subscription blocks + businessSeatsSection.load() calls.
  - Click handler: removed `.upgrade-pro-cta`, `.retry-plan-status-btn`, `.upgrade-to-business-btn`, `.manage-billing-btn`, plan-limit ack/cta, api-keys create/revoke/copy, embed-keys create/revoke/copy, mcp revoke/copy-url, business-seats invite/remove branches, and the panelItem `data-pro-locked` branch (toggle kept, ungated).
  - switchTab(): removed loadApiKeys/loadEmbedKeys/loadMcpClients/loadPlanLimitNotices/startMcpQuotaPolling; notifications attach kept.
  - renderPanelsTab(): removed locked/pro-locked/data-pro-locked/panel-toggle-pro-badge + getPanelToggleA11yState (inlined `aria-pressed="${panel.enabled}"`); every panel now purely user-enabled.
  - toggleDraftPanel(): removed isPanelEntitled guard + free-panel-cap block (isProUser always true now).
  - teardownSettings()/destroy(): removed entitlement/verification/subscription/auth unsubscribes + stopMcpQuotaPolling.
  - Deleted ~45 private methods + ~29 fields + AccountRequest type (api-keys/embeds/mcp/business-seats/plan-limit/upgrade/account-request machinery).
  - Imports removed: isPanelEntitled, FREE_MAX_PANELS, countFreePanelCapUsage, isFreePanelCapCounted, isProUser, getPanelToggleA11yState, subscribeAuthState, trackApiAction, all entitlements fns, hasPremiumAccess, all billing fns, BusinessSeatsSection, all billing-state fns, api-keys/embed-keys/mcp-clients/api-plan-limit-notices services, checkoutConsentHtml.
- **src/components/settings-types.ts**: UnifiedSettingsTabId union now `'settings' | 'panels' | 'sources' | 'notifications'` (this is where the union lives; app-context.ts re-exports it and needed no change).
- **src/app/event-handlers.ts**: embed-dialog "Manage embed keys" button deep-link `open('embeds')` → `open('settings')` (only tab-id literal fix; a parallel agent was concurrently editing this file and removed the unused `wiredSandboxProButtons` field flagged at baseline).
- **src/app/pro-activation-controller.ts**: `openMcpClients` option → `undefined` (drops the MCP pointer from the activation flow since the tab no longer exists) + removed now-unused `hasFeature` import.
- **src/config/panels.ts**: removed unused imports `getSecretState`/`isEntitled` (leftover from 3-a hardwires).
- **src/components/LiveNewsPanel.ts**: fixed 4 pre-existing tsc errors (querySelector<HTMLElement> for multiview tile; `channel.videoId = undefined` instead of null).

## Verification
- `npx tsc --noEmit` → **0 errors** (baseline had 7: wiredSandboxProButtons, 4× LiveNewsPanel, 2× panels.ts unused imports, plus 2 tab-id union fallout errors from my union shrink — all fixed).
- Verified exactly 4 data-tab buttons / 4 data-panel-id panels remain; notifications attach path (switchTab → attachNotificationsTab) untouched.
- Untouched per instructions: panel-layout.ts, App.ts, no vite build, no servers started.

## Notes for next agents
- `vite preview :3002` still serves the OLD dist — a rebuild is needed before the UI reflects these changes (rebuild intentionally not done: OOM-prone, parallel agent owns panel-layout.ts).
- event-handlers.ts embed dialog still shows the "With your embed key" tier text mentioning "Settings → Embeds"; the Manage-keys button now opens generic settings — if the embed dialog tier is to be removed entirely, that's a separate task (file was under concurrent edit).
- ProActivationInterstitial.ts:838 has a stale doc comment mentioning open('mcp-clients') — comment only, harmless.
