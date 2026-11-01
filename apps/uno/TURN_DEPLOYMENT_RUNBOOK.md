# UNO TURN deployment runbook

This runbook prepares the standalone UNO service for real WebRTC calls. It does not create infrastructure, publish credentials, or change the Royal Club app.

## 1. Required deployment inputs

Obtain these from the owner/operator before deployment:

- A Linux VM with a public IPv4 address and a stable DNS name such as `turn.example.com`.
- The VM's private IPv4 address if it is behind a cloud NAT.
- A TLS certificate and private key for the TURN DNS name (recommended for TURN/TLS).
- A newly generated high-entropy TURN shared secret. Keep it in the TURN host's secret store and the UNO service's secret store only.
- The UNO service URL and its production origin allowlist.

Do not reuse the Royal Club JWT secret as the TURN shared secret. Do not commit either secret or certificate private key.

## 2. Network and firewall

Allow inbound traffic to the TURN host:

| Protocol | Port | Purpose |
| --- | ---: | --- |
| UDP | 3478 | TURN/STUN |
| TCP | 3478 | TURN fallback |
| TCP | 5349 | TURN over TLS |
| UDP | 49160–49200 | Relayed media |
| TCP | 49160–49200 | Relayed media fallback, if enabled |

The relay range must match the Coturn `min-port` and `max-port` settings. Restrict administrative access (SSH) to operator IPs. Do not expose Coturn's CLI or management interface publicly.

If the VM is behind NAT, configure Coturn's public/private address mapping (Coturn `external-ip=PUBLIC_IP/PRIVATE_IP`) and ensure the cloud firewall forwards the relay range as well as the listener ports. A listener-only firewall rule is insufficient.

## 3. Coturn configuration

Use a maintained Coturn release from the operating system or a trusted container registry. Configure the equivalent of:

```ini
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
realm=turn.example.com
min-port=49160
max-port=49200
no-cli
no-multicast-peers
no-loopback-peers
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
```

Supply `static-auth-secret` through the host's secret manager or a root-readable, untracked environment file. Never put its value in this repository, a Docker image, build log, or client app. If Coturn is behind NAT, add the correct `external-ip` mapping. Confirm the certificate renews automatically and that Coturn reloads it after renewal.

For production, prefer TURN/TLS on 5349 for restrictive networks while retaining UDP 3478 for lower-latency paths. Use a dedicated TURN hostname and certificate.

## 4. UNO service configuration

Set these variables in the UNO service's hosting secret store:

- `TURN_URL=turn:turn.example.com:3478?transport=udp` (add the TCP URL if your client configuration supports multiple TURN URLs).
- `TURN_SHARED_SECRET` to exactly the Coturn shared secret.
- `TURN_TTL_SECONDS=3600` (the UNO credential helper clamps TTL to 60–3600 seconds).

The authenticated `GET /ice-config` endpoint issues short-lived REST credentials. It returns STUN only when TURN is not configured; when a TURN URL exists without a shared secret it returns `503 TURN_NOT_CONFIGURED`. Never expose the shared secret through this endpoint.

Restart the UNO service after updating secrets. Keep UNO on a single service instance until room mutations use distributed per-room transactions and Socket.IO has a shared adapter.

## 5. Verification sequence

1. Confirm DNS resolves the TURN hostname to the intended public address.
2. Confirm the TLS certificate hostname and validity period.
3. Confirm the firewall permits listener and relay ranges from external networks.
4. Request `/ice-config` with a valid Royal Club access token; verify the response contains short-lived TURN username and credential values.
5. Verify an expired credential is rejected by Coturn after its TTL.
6. Run two real clients on different networks (for example, home Wi-Fi and cellular). Confirm ICE selects a relay candidate when direct connectivity is unavailable and that bidirectional audio is intelligible.
7. Repeat with UDP blocked on one client network to verify TURN/TLS fallback.
8. Test host mute, self-mute, voice disabled, reconnect, and a participant leaving while a call is active.
9. Review Coturn logs and firewall counters. Do not log credential values or SDP payloads.

A successful `/ice-config` response is not proof that media can traverse TURN. Release readiness requires a real cross-network call and relay-candidate evidence.

## 6. Operational safeguards

- Rotate the shared secret by updating Coturn and UNO together; allow a short coordinated restart window.
- Monitor allocation count, bandwidth, CPU, memory, and relay-port exhaustion.
- Apply OS security updates and keep Coturn patched.
- Alert on repeated authentication failures and unexpected allocation spikes.
- Keep TURN and UNO secrets separate from client-side Flutter configuration.
- Do not claim voice production-ready until the physical-device acceptance tests above pass.

## 7. Current acceptance status

Infrastructure provisioning, DNS, certificate installation, firewall configuration, Coturn deployment, and cross-network device testing are external deployment tasks. They remain pending until an operator provisions the host and records real test evidence. This document alone does not mark voice as verified.
