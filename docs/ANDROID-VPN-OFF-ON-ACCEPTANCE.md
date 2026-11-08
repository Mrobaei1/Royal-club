# Android VPN OFF/ON Acceptance Plan

**Status:** Prepared; physical-device execution is still Pending.  
**Related WBS:** 1.3-B (VPN/network independence), 2.7-A (same-account VPN OFF/ON).  
**Execution gate:** Use only an owner-approved Android build that corresponds to the exact source commit under test. Do not build or distribute an APK until the owner explicitly authorizes it.

## Purpose

Verify that changing VPN state or network address does not change account identity, invalidate a valid session, make the API unreachable, or lose friend/chat/game state.

## Preconditions

- Android device and a stable Wi-Fi or mobile-data connection.
- VPN client with a selectable exit route.
- Two test accounts that are accepted friends.
- A current, owner-approved Royal Club build; record its version and source commit.
- A backgammon online match that can remain active during the network transition.
- Do not use real payment, SMS purchase, or production financial operations for this acceptance test.

## Test sequence

1. Record device model, Android version, app version, source commit, network type and VPN state.
2. With VPN **OFF**, sign in once. Record the displayed username and verify the account profile, friends list and existing chat conversation.
3. Start an online backgammon room with the second test account, join it, and make one legal move. Record the room identifier and board version; do not record credentials or bearer tokens.
4. Keep the app session active. Enable VPN without logging out or clearing app data.
5. Return to Royal Club. Verify the same account is still authenticated, the same friends and conversation are available, and the active match restores the authoritative board and turn state.
6. Make one legal move after reconnecting and verify it is applied exactly once.
7. Disable VPN while the match is active. Repeat the profile, friend/chat and match-state checks.
8. If available, repeat the transition using mobile data rather than Wi-Fi. Do not change more than one network variable at a time.
9. Force-close and reopen the app once after the transitions, then verify normal session recovery and the same account identity.

## Pass criteria

- No forced logout or account switch during VPN/network transitions.
- No persistent “server is not reachable/readable” state after reconnect.
- Profile identity remains tied to the same authenticated account.
- Friend list and chat history remain available and are not duplicated or lost.
- The online match restores the same authoritative board, turn and match identifier.
- A move submitted after reconnect is applied once; stale/replayed commands are rejected safely.
- The app recovers after one force-close/reopen without requiring account recreation.

## Failure evidence

For each failure, record only:
- timestamp and test step;
- VPN state and network type;
- app version/source commit;
- visible error text and a short screen recording if practical;
- sanitized Logcat/API error excerpt.

**Never include** passwords, OTP codes, access/refresh tokens, Authorization headers, private keys, or full personal phone numbers in evidence shared outside the test device.

## Acceptance record

| Step | VPN/network state | Result | Evidence reference |
|---|---|---|---|
| Login/profile | OFF | Pending | — |
| Friends/chat | OFF | Pending | — |
| Active match | OFF | Pending | — |
| Transition to VPN ON | ON | Pending | — |
| Profile/friends/chat recovery | ON | Pending | — |
| Match state/move recovery | ON | Pending | — |
| Transition back to VPN OFF | OFF | Pending | — |
| Force-close/reopen | OFF or ON | Pending | — |

**Current result:** Not executed. Source-level API integration tests already cover IP-independent identity, friends and active backgammon-state recovery, but they do not replace this Android-device acceptance.
