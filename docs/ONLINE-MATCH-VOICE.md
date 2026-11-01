# Online match voice calling

Royal Club uses peer-to-peer WebRTC audio for one-to-one voice inside an active backgammon match. The API handles authenticated signaling and issues short-lived ICE/TURN credentials. The long-lived Cloudflare key and API token stay on the server.

## Server configuration

Set these as private environment secrets on the API deployment:

- `CLOUDFLARE_TURN_KEY_ID`: the Cloudflare Realtime TURN key ID.
- `CLOUDFLARE_TURN_API_TOKEN`: a restricted API token permitted to generate TURN credentials for that key.

The API requests 12-hour temporary ICE credentials from Cloudflare for each call setup. Do not place the long-lived TURN key or API token in Flutter `--dart-define`, mobile source, or a committed environment file.

## Cloudflare setup

1. In the Cloudflare account, create a Realtime TURN key.
2. Create an API token with only the permission needed to generate credentials for that TURN key.
3. Store the returned key ID and token in the API deployment's secret environment settings.
4. Restart/redeploy the API, then verify that an authenticated participant in an active match can call `GET /api/v1/matches/:id/voice/ice-servers` and receive temporary `iceServers`.
5. Test a call between two physical Android devices on different networks, including at least one restrictive mobile or Wi-Fi network.

Cloudflare documentation:
- [TURN service](https://developers.cloudflare.com/realtime/turn/)
- [Generate temporary TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/)

## Billing and operational notes

Cloudflare documents TURN usage as free when used together with its Realtime SFU; standalone TURN relay usage is billed by outbound real-time data. Royal Club currently uses direct peer-to-peer WebRTC, so review the current Cloudflare pricing and usage before enabling the credentials in production.

Voice remains unavailable until both server secrets are configured. The mobile control reports the API's configuration error rather than pretending a microphone icon is a working call. TURN credentials are temporary; the long-lived secret is never returned to clients.
