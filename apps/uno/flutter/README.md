# Standalone UNO Flutter module

This package is intentionally not referenced by `apps/mobile`. It can be analyzed and tested independently, then integrated only after explicit owner approval.

## Setup
```sh
cd apps/uno/flutter
flutter pub get
flutter analyze
flutter test
```

## Android permissions to add during the later integration step
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

The user must grant microphone permission at runtime. On Android, use a minimum SDK of 23 and Java 8-compatible compile options; add the manifest permissions above. On iOS, add `NSMicrophoneUsageDescription` to Info.plist. The app must use HTTPS/WSS in production.

## WebRTC
The voice mesh requests microphone access only after the user taps the microphone control. STUN is configured by default. When the player enables the microphone, the client requests `/ice-config` from the UNO service using the signed-in bearer token. If `TURN_URL` and `TURN_SHARED_SECRET` are configured on the server, it returns short-lived Coturn REST credentials (bounded to 60–3600 seconds). Configure Coturn with `use-auth-secret` and the same shared secret. Never commit the shared secret or permanent TURN credentials. With six players each device may maintain up to five peer connections; for a production launch, an SFU is preferable.
