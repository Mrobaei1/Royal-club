# Phase 1 — Persian/English localization audit

Date: 2026-10-28
Branch: `feature/chat-ai-invite-ux`

## Scope decision
Royal Club currently supports only Persian (`fa`) and English (`en`). No additional locales are in scope. Flutter's locale state and `MaterialApp.supportedLocales` already restrict selection to those two locales, and generated localization is configured with `lib/l10n/app_fa.arb` and `lib/l10n/app_en.arb`.

## Findings from source inspection
The localization framework exists, but localization coverage is incomplete. Each ARB file currently contains only 24 keys, while user-facing strings remain hard-coded in multiple screens. Examples observed in the current branch include:

- `main.dart`: session-checking status, theme/language labels, admin/contact entry points, and authentication helper text.
- `account_screen.dart`: account editing, save/cancel, username editing, and logout.
- `admin_screen.dart`: many administrative actions, validation errors, success/failure feedback, and the newly added SMS OTP settings section.
- `engine_backgammon_screen.dart`: game setup, game-over, restart/exit, AI/offline/online labels, difficulty labels, and timer text.
- `wallet_screen.dart`: wallet balance, subscription status, activation feedback, and transaction-empty state.
- `friends_screen.dart`, `chat_screen.dart`, `notifications_screen.dart`, `online_lobby_screen.dart`, `online_match_screen.dart`, `spectator_match_screen.dart`, and `leaderboard_screen.dart`: additional screen-specific text and/or dynamic status messages need a systematic pass.

These are source-level findings, not a claim that every individual string was catalogued. This audit does not yet certify visual RTL/LTR correctness on devices.

## Required completion work
1. Expand the English and Persian ARB resources to cover every user-visible app string, including validation errors, API failures, dialogs, snackbars, empty/loading states, game controls, admin tools, and SMS OTP settings.
2. Replace hard-coded UI strings with generated localization accessors; keep provider secrets and internal identifiers out of translated UI.
3. Verify Persian RTL and English LTR behavior for navigation, alignment, icons where direction matters, long labels, dialogs, and dynamic text.
4. Add localization coverage tests: exact supported locale list (`fa`, `en` only), required key parity between ARB files, and smoke/widget tests for language switching and representative screens.
5. Run `flutter gen-l10n`, `flutter analyze`, and Flutter tests in CI. Perform manual device review for overflow and directionality before closing this Phase 1 item.

## Status
**Open — not complete.** The localization infrastructure is present, but the source audit found substantial hard-coded UI text. Do not mark Phase 1 localization complete until the changes and checks above pass.
