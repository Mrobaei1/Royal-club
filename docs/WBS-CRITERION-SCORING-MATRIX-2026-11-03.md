# Royal Club — WBS criterion-level scoring matrix

**Baseline:** WBS v1.1 · **Audit scaffold:** 2026-11-03 · **53 leaf packages · 1,000 points**

## Rules

- Every approved package weight is divided into equal **5-point criteria**, preserving the 1,000-point baseline.
- Each criterion earns 5 points only after its acceptance outcome is evidenced and passed. Failed, blocked, untested or unsupported criteria earn 0.
- **All criteria begin Pending.** This matrix decomposes the baseline; it does not award points or claim completion.
- CI proves only the checks actually run. Manual-device, Production, provider and owner-approval criteria require separate evidence.
- Record exact commit/PR, workflow run, test report, read-only verification or manual acceptance. Do not double-count evidence.

## Scoring table

### 1.0 Product, architecture, governance

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 1.1-A | Android-first/Iran+international requirements approved | 5 | Pending | Not audited |
| 1.1-B | Persian/English and security/cost/extensibility NFRs measurable | 5 | Pending | Not audited |
| 1.1-C | Requirements trace to implementation and owner decisions | 5 | Pending | Not audited |
| 1.2-A | Flutter/API/PostgreSQL boundaries respected | 5 | Pending | Not audited |
| 1.2-B | Provider portability and deployment boundaries verified | 5 | Pending | Not audited |
| 1.2-C | Server-authoritative game/economy rules negatively tested | 5 | Pending | Not audited |
| 1.3-A | Free-by-default policy enforced | 5 | Pending | Not audited |
| 1.3-B | IP/VPN-independent identity verified | 5 | Pending | Not audited |
| 1.3-C | Username-only public identity and privacy enforced | 5 | Pending | Not audited |
| 1.4-A | WBS baseline/change control maintained | 5 | Pending | Not audited |
| 1.4-B | Owner decisions and approvals traceable | 5 | Pending | Not audited |
| 1.4-C | Evidence links and milestone reports current | 5 | Pending | Not audited |
| 1.5-A | Data lifecycle/retention/deletion approved | 5 | Pending | Not audited |
| 1.5-B | Backup/restore/DR procedures documented and tested | 5 | Pending | Not audited |
| 1.6-A | Roadmap dependencies reviewed | 5 | Pending | Not audited |
| 1.6-B | Chess/card scope preserved with backgammon priority | 5 | Pending | Not audited |

### 2.0 Accounts, security, localization

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 2.1-A | Registration/login end-to-end | 5 | Pending | Not audited |
| 2.1-B | Six-character password policy | 5 | Pending | Not audited |
| 2.1-C | Session lifecycle/logout/revocation | 5 | Pending | Not audited |
| 2.1-D | Recovery/account flows | 5 | Pending | Not audited |
| 2.2-A | OTP normalization/digest/expiry/limits | 5 | Pending | Not audited |
| 2.2-B | Purpose-bound register/login/link ownership | 5 | Pending | Not audited |
| 2.2-C | Provider credentials encrypted and owner-controlled | 5 | Pending | Not audited |
| 2.2-D | Production activation gated and approved device/provider acceptance | 5 | Pending | Not audited |
| 2.3-A | Self-profile privacy | 5 | Pending | Not audited |
| 2.3-B | Public APIs suppress private identity | 5 | Pending | Not audited |
| 2.3-C | Legacy/empty profile privacy | 5 | Pending | Not audited |
| 2.3-D | Cross-account authorization | 5 | Pending | Not audited |
| 2.4-A | ARB parity | 5 | Pending | Not audited |
| 2.4-B | Visible static UI localization | 5 | Pending | Not audited |
| 2.4-C | Dynamic errors/notifications localization | 5 | Pending | Not audited |
| 2.4-D | Locale-switch regression tests | 5 | Pending | Not audited |
| 2.5-A | Persian RTL on Android | 5 | Pending | Not audited |
| 2.5-B | English LTR on Android | 5 | Pending | Not audited |
| 2.5-C | Dialogs/forms/overflow | 5 | Pending | Not audited |
| 2.5-D | Dynamic text/directional UI | 5 | Pending | Not audited |
| 2.6-A | JWT/session negative tests | 5 | Pending | Not audited |
| 2.6-B | Rate limits/CORS/network controls | 5 | Pending | Not audited |
| 2.6-C | Sensitive log redaction | 5 | Pending | Not audited |
| 2.7-A | Same account VPN off/on | 5 | Pending | Not audited |
| 2.7-B | Identity/session continuity | 5 | Pending | Not audited |
| 2.7-C | Access/game/social recovery | 5 | Pending | Not audited |

### 3.0 Games and backgammon

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 3.1-A | Legal moves/blocked points | 5 | Pending | Not audited |
| 3.1-B | Dice/doubles/four-dice sequences | 5 | Pending | Not audited |
| 3.1-C | Hits/blots | 5 | Pending | Not audited |
| 3.1-D | Correct-side bar entry | 5 | Pending | Not audited |
| 3.1-E | Bearing-off exact/overshoot priority | 5 | Pending | Not audited |
| 3.1-F | Turn transitions | 5 | Pending | Not audited |
| 3.1-G | Malformed state fails closed | 5 | Pending | Not audited |
| 3.1-H | Mirrored host/guest regression | 5 | Pending | Not audited |
| 3.1-I | Independent rules audit | 5 | Pending | Not audited |
| 3.2-A | Approved visual design | 5 | Pending | Not audited |
| 3.2-B | Shared online/offline board | 5 | Pending | Not audited |
| 3.2-C | Checker orientation/stack/count | 5 | Pending | Not audited |
| 3.2-D | Dice/highlights/player panels | 5 | Pending | Not audited |
| 3.2-E | Responsive Android sizes | 5 | Pending | Not audited |
| 3.2-F | Themes/locales | 5 | Pending | Not audited |
| 3.2-G | Real-device visual acceptance | 5 | Pending | Not audited |
| 3.3-A | Create/join/invite authorization | 5 | Pending | Not audited |
| 3.3-B | 60-second expiry | 5 | Pending | Not audited |
| 3.3-C | Cancellation/stale invite rejection | 5 | Pending | Not audited |
| 3.3-D | Versioning/concurrency | 5 | Pending | Not audited |
| 3.3-E | Idle cleanup | 5 | Pending | Not audited |
| 3.4-A | Server-authoritative legality/state | 5 | Pending | Not audited |
| 3.4-B | Cumulative dice | 5 | Pending | Not audited |
| 3.4-C | Bar entry/turn integrity | 5 | Pending | Not audited |
| 3.4-D | Reconnect canonical resync | 5 | Pending | Not audited |
| 3.4-E | Duplicate/tampered/racing move protection | 5 | Pending | Not audited |
| 3.5-A | Heartbeat/presence | 5 | Pending | Not audited |
| 3.5-B | Lease/grace period | 5 | Pending | Not audited |
| 3.5-C | Temporary AI legal turn | 5 | Pending | Not audited |
| 3.5-D | Reconnect handback | 5 | Pending | Not audited |
| 3.5-E | Expiry/race/duplicate prevention | 5 | Pending | Not audited |
| 3.6-A | Single-game resignation | 5 | Pending | Not audited |
| 3.6-B | Match surrender | 5 | Pending | Not audited |
| 3.6-C | Confirm/cancel UX; Winner/result consistency; Idempotent repeat requests | 5 | Pending | Not audited |
| 3.7-A | Offline training isolation | 5 | Pending | Not audited |
| 3.7-B | Local AI/two-player | 5 | Pending | Not audited |
| 3.7-C | Restart/exit reset; No online-state mutation; No online XP/Elo | 5 | Pending | Not audited |
| 3.8-A | Chess entry point | 5 | Pending | Not audited |
| 3.8-B | Card/UNO entry state | 5 | Pending | Not audited |
| 3.8-C | Agreed MVP entry flow | 5 | Pending | Not audited |
| 3.8-D | Navigation state preservation; No backgammon regression | 5 | Pending | Not audited |
| 3.9-A | Game rules/state contracts | 5 | Pending | Not audited |
| 3.9-B | Account/lobby extension boundaries | 5 | Pending | Not audited |
| 3.10-A | Two-account/two-device test | 5 | Pending | Not audited |
| 3.10-B | Android size matrix | 5 | Pending | Not audited |
| 3.10-C | Network interruption/reconnect; Core game regression; Owner acceptance evidence | 5 | Pending | Not audited |

### 4.0 Social and community

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 4.1-A | Username search/privacy | 5 | Pending | Not audited |
| 4.1-B | Friend request lifecycle | 5 | Pending | Not audited |
| 4.1-C | Remove/race handling | 5 | Pending | Not audited |
| 4.1-D | 100-friend cap | 5 | Pending | Not audited |
| 4.2-A | Audience authorization | 5 | Pending | Not audited |
| 4.2-B | Text delivery | 5 | Pending | Not audited |
| 4.2-C | Image authorization | 5 | Pending | Not audited |
| 4.2-D | Emoji | 5 | Pending | Not audited |
| 4.2-E | Edit/delete; no calls; voice disabled | 5 | Pending | Not audited |
| 4.3-A | Recipient targeting | 5 | Pending | Not audited |
| 4.3-B | Localized read/unread lifecycle | 5 | Pending | Not audited |
| 4.3-C | Clear-all isolation and Android acceptance | 5 | Pending | Not audited |
| 4.4-A | Host permission | 5 | Pending | Not audited |
| 4.4-B | Friend/follower and active-match eligibility | 5 | Pending | Not audited |
| 4.4-C | Finished restriction/no replay | 5 | Pending | Not audited |
| 4.5-A | Username-only public identity | 5 | Pending | Not audited |
| 4.5-B | Legacy/empty profile audit | 5 | Pending | Not audited |
| 4.5-C | No private identity leak/regression | 5 | Pending | Not audited |
| 4.6-A | Avatar rules | 5 | Pending | Not audited |
| 4.6-B | Username edit policy | 5 | Pending | Not audited |
| 4.6-C | Private account details | 5 | Pending | Not audited |
| 4.7-A | Persian RTL | 5 | Pending | Not audited |
| 4.7-B | English LTR | 5 | Pending | Not audited |
| 4.7-C | Themes/layout/accessibility device test | 5 | Pending | Not audited |

### 5.0 Wallet, progression, leagues

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 5.1-A | Non-transferable credits | 5 | Pending | Not audited |
| 5.1-B | Auditable ledger | 5 | Pending | Not audited |
| 5.1-C | Atomic balance | 5 | Pending | Not audited |
| 5.1-D | Idempotent concurrency | 5 | Pending | Not audited |
| 5.1-E | Owner adjustments | 5 | Pending | Not audited |
| 5.2-A | Manager plans | 5 | Pending | Not audited |
| 5.2-B | Transactional activation | 5 | Pending | Not audited |
| 5.2-C | Expiry/removal | 5 | Pending | Not audited |
| 5.2-D | Server-controlled prices | 5 | Pending | Not audited |
| 5.3-A | XP policy | 5 | Pending | Not audited |
| 5.3-B | Permanent levels/curve | 5 | Pending | Not audited |
| 5.3-C | Elo/leaderboard | 5 | Pending | Not audited |
| 5.3-D | Ties/draws/unfinished matches | 5 | Pending | Not audited |
| 5.3-E | Retry/audit | 5 | Pending | Not audited |
| 5.4-A | Manager config | 5 | Pending | Not audited |
| 5.4-B | Entry/minimum participants | 5 | Pending | Not audited |
| 5.4-C | Fixtures/byes/rest fairness | 5 | Pending | Not audited |
| 5.4-D | Results/finals | 5 | Pending | Not audited |
| 5.4-E | Appeals/incidents/reschedule | 5 | Pending | Not audited |
| 5.4-F | Audit history | 5 | Pending | Not audited |
| 5.4-G | Manager UI acceptance | 5 | Pending | Not audited |
| 5.5-A | Free-by-default entry | 5 | Pending | Not audited |
| 5.5-B | Dedicated entitlement ledger | 5 | Pending | Not audited |
| 5.5-C | Exactly-once/no wallet debit | 5 | Pending | Not audited |
| 5.6-A | Owner monetization control/audit | 5 | Pending | Not audited |
| 5.6-B | Paid behavior disabled absent approval | 5 | Pending | Not audited |
| 5.7-A | Persian/English manager UI | 5 | Pending | Not audited |
| 5.7-B | Manual acceptance before activation | 5 | Pending | Not audited |

### 6.0 Administration and Agents

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 6.1-A | Mobile admin usability | 5 | Pending | Not audited |
| 6.1-B | Desktop admin usability | 5 | Pending | Not audited |
| 6.1-C | Ordinary-user denial | 5 | Pending | Not audited |
| 6.1-D | Voice-message control manager-only/OFF | 5 | Pending | Not audited |
| 6.2-A | Numeric owner identity | 5 | Pending | Not audited |
| 6.2-B | Secure configuration | 5 | Pending | Not audited |
| 6.2-C | Fail-closed owner endpoints | 5 | Pending | Not audited |
| 6.2-D | No username/email privilege | 5 | Pending | Not audited |
| 6.3-A | Permission matrix | 5 | Pending | Not audited |
| 6.3-B | 50-delegate limit | 5 | Pending | Not audited |
| 6.3-C | Grant/revoke/audit | 5 | Pending | Not audited |
| 6.3-D | Voice setting authorization | 5 | Pending | Not audited |
| 6.3-E | Deny-by-default tests | 5 | Pending | Not audited |
| 6.4-A | Task definitions/capabilities | 5 | Pending | Not audited |
| 6.4-B | Human approval | 5 | Pending | Not audited |
| 6.4-C | Run state/cancellation/audit | 5 | Pending | Not audited |
| 6.4-D | Dormant execution | 5 | Pending | Not audited |
| 6.5-A | Privileged audit | 5 | Pending | Not audited |
| 6.5-B | Secret redaction | 5 | Pending | Not audited |
| 6.5-C | Kill switch | 5 | Pending | Not audited |
| 6.5-D | Immediate revoke/cancel | 5 | Pending | Not audited |
| 6.6-A | Agent Center categories | 5 | Pending | Not audited |
| 6.6-B | Monitoring/status accuracy | 5 | Pending | Not audited |
| 6.6-C | Safe command UX and human approval | 5 | Pending | Not audited |
| 6.7-A | Provider/settlement validation | 5 | Pending | Not audited |
| 6.7-B | Idempotency and human review; no screenshot credit | 5 | Pending | Not audited |
| 6.8-A | Owner UX acceptance | 5 | Pending | Not audited |
| 6.8-B | No activation without separate approval | 5 | Pending | Not audited |

### 7.0 Infrastructure, operations, release

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 7.1-A | API build/unit | 5 | Pending | Not audited |
| 7.1-B | API DB integration | 5 | Pending | Not audited |
| 7.1-C | Flutter analyze/tests | 5 | Pending | Not audited |
| 7.1-D | Engine audit | 5 | Pending | Not audited |
| 7.1-E | Web preview checks | 5 | Pending | Not audited |
| 7.2-A | Repeatable manual deployment | 5 | Pending | Not audited |
| 7.2-B | Owner approval | 5 | Pending | Not audited |
| 7.2-C | Source provenance | 5 | Pending | Not audited |
| 7.2-D | Health/smoke/rollback | 5 | Pending | Not audited |
| 7.3-A | Source/schema reconciliation | 5 | Pending | Not audited |
| 7.3-B | Migration order | 5 | Pending | Not audited |
| 7.3-C | Tables/columns/indexes | 5 | Pending | Not audited |
| 7.3-D | Rollback test | 5 | Pending | Not audited |
| 7.3-E | Recovery test | 5 | Pending | Not audited |
| 7.4-A | Scheduled cleanup | 5 | Pending | Not audited |
| 7.4-B | Idle-runtime cleanup | 5 | Pending | Not audited |
| 7.4-C | Observability/alerts | 5 | Pending | Not audited |
| 7.5-A | Monitoring/runbooks | 5 | Pending | Not audited |
| 7.5-B | Redacted logs | 5 | Pending | Not audited |
| 7.5-C | Alerts/incident response | 5 | Pending | Not audited |
| 7.5-D | Backup retention/restore | 5 | Pending | Not audited |
| 7.6-A | Network/IP controls | 5 | Pending | Not audited |
| 7.6-B | CORS/HTTPS | 5 | Pending | Not audited |
| 7.6-C | Secrets | 5 | Pending | Not audited |
| 7.6-D | Owner/SMS gates and least privilege | 5 | Pending | Not audited |
| 7.7-A | Two-device acceptance | 5 | Pending | Not audited |
| 7.7-B | Network recovery | 5 | Pending | Not audited |
| 7.7-C | Android/accessibility/localization | 5 | Pending | Not audited |
| 7.7-D | Performance/regression | 5 | Pending | Not audited |
| 7.8-A | Separate release/APK approval | 5 | Pending | Not audited |
| 7.8-B | Release candidate/version/notes | 5 | Pending | Not audited |
| 7.8-C | APK and rollback only after approval | 5 | Pending | Not audited |

## Audit summary

- Packages decomposed: **53/53**
- Acceptance criteria: **200**
- Points represented: **1000/1,000**
- Earned points at creation: **not scored**
- Official project percentage: **pending evidence audit**

## Required evidence record

For each criterion record: `criterion ID | pass/fail/blocked/not tested | exact evidence URL or commit | audit date | reviewer | blocker/owner decision`. A passing criterion is worth exactly 5 points. Re-audit after new commits or manual acceptance and retain prior evidence history.
