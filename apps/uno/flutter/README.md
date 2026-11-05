# Standalone UNO Flutter module

This package is intentionally not referenced by `apps/mobile`. It can be analyzed and tested independently, then integrated only after explicit owner approval.

```sh
cd apps/uno/flutter
flutter pub get
flutter analyze
flutter test
```

Production connections must use HTTPS/WSS. UNO has text chat only: do not add microphone permissions, audio recording, voice/video calls, WebRTC, TURN or paid media services.
