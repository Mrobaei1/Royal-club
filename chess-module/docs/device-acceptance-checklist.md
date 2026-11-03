# Physical-device and two-player acceptance checklist

This checklist closes the acceptance work that cannot be established by widget tests or CI alone. It is a test procedure, not a claim that physical-device testing has already passed.

## Test setup

- [ ] Install the same candidate build on two physical Android devices.
- [ ] Record device model, Android version, screen size, app build/commit, API environment and network type for both devices.
- [ ] Use two separate test accounts and record their chess levels and ratings.
- [ ] Confirm the test environment uses an isolated database; do not point this checklist at production.
- [ ] Capture timestamps and server logs for every failure. Redact bearer tokens and personal data.

## Board, layout and accessibility

- [ ] Verify Persian RTL and English LTR layouts on a narrow phone and a larger display.
- [ ] Verify the board remains square, all 64 squares are tappable, and coordinates/orientation are correct for both colors.
- [ ] Verify piece selection, legal destinations, illegal-move rejection and stale-selection clearing.
- [ ] Complete all four promotion choices (queen, rook, bishop, knight) on each device.
- [ ] Verify castling and en-passant presentation and execution.
- [ ] Verify clocks, player identity, rating/level and result panels do not overlap at the smallest supported size.
- [ ] Use TalkBack to navigate the board, announce selected squares/legal destinations, and operate promotion and draw controls without relying on color alone.
- [ ] Verify text scaling and landscape rotation do not hide controls or make the board unusable.

## Real two-device game flow

- [ ] Create a private room on device A and join from device B.
- [ ] Verify a third, non-member account cannot read game state, chat or WebSocket events.
- [ ] Play at least 20 alternating legal moves and confirm both devices show identical FEN, turn, clocks and move history.
- [ ] Attempt an illegal move and an out-of-turn move; confirm neither device's authoritative position changes.
- [ ] Verify draw offer, decline, accept, claimable draw, resignation and timeout outcomes.
- [ ] Verify XP, rating and profile summaries refresh exactly once after the terminal result.
- [ ] Repeat using each configured time control.

## Network interruption and reconnect

- [ ] Disable network on the active player for 5, 15 and 45 seconds; restore it and verify reconnect without duplicate moves or chat.
- [ ] Repeat while the opponent is moving and while the disconnected player's clock is running.
- [ ] Switch Wi-Fi to mobile data (and back) during an active game.
- [ ] Force-stop and relaunch the app during an active game; verify authoritative state and clock are restored.
- [ ] Verify stale socket events cannot overwrite a newer HTTP snapshot.
- [ ] Verify a terminal result received during disconnection is displayed after reconnect and no further move can be submitted.
- [ ] Verify reconnect backoff does not create parallel sockets or excessive heartbeat traffic.

## Abuse and operational checks

- [ ] Send rapid chat messages from one device and confirm the documented server rate limit is enforced without blocking the opponent.
- [ ] Send malformed/oversized WebSocket payloads and unsupported commands from a test client; verify policy closure and server stability.
- [ ] Open and close multiple sessions for one account; presence remains online until its last session disconnects.
- [ ] Verify room expiry, queue cancellation and duplicate room creation/join races from separate devices.
- [ ] Run a controlled connection-flood and multi-instance test in staging with an agreed load profile; record throughput, p95/p99 latency, error rate, DB pool saturation and recovery.
- [ ] Verify no microphone permission, voice recording, voice playback, calls, WebRTC or paid audio infrastructure is activated.

## Result record

For each checklist run, record:

- Date/time and tester:
- Commit SHA and build identifier:
- Device A / Device B:
- API and database environment:
- Network conditions:
- Passed / failed / blocked items:
- Reproduction steps and sanitized logs:
- Defect links and retest commit:
- Final reviewer and acceptance decision:

A test is **blocked**, not passed, when the required device, account, staging environment or approval is unavailable. Production migrations, host-app integration, APK distribution and PR merge remain separate owner-controlled gates.
