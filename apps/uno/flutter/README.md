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

The user must grant microphone permission at runtime. On iOS, add `NSMicrophoneUsageDescription` to Info.plist. The app must use HTTPS/WSS in production.

## WebRTC
The voice mesh requests microphone access only after the user taps the microphone control. STUN is configured by default; supply TURN URLs and credentials for reliable calls on mobile networks and restrictive NATs. Never commit TURN credentials. With six players each device may maintain up to five peer connections; for a production launch, an SFU is preferable.
