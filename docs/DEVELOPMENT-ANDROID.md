# Phone-first development workflow (Android)

## Recommended starting route
Use a browser-based development environment that provides a terminal and Git integration. From an Android phone, open the service in Chrome and enable **Desktop site** if the editor layout requires it. Create a private Git repository and upload/import this scaffold. A cloud IDE can run the Node API and PostgreSQL service (if its plan supports containers), while Flutter compilation may require a workspace with Flutter/Android SDK preinstalled.

## Practical options to evaluate
- **GitHub Codespaces**: browser-based VS Code and terminal; usage is quota/plan-dependent. Check current availability and billing before starting a machine.
- **Replit**: browser-based editing and Node execution; container/database and mobile build support depend on current plan/features.
- **GitHub repository + Flutter build service**: edit source in the browser, then use a Flutter-capable CI/build service for Android APK builds. Android signing keys must remain private.

Service plans change, so verify current pricing and Flutter/Android SDK support before committing to a paid plan. No external repository was created from this environment.

## API checks
In a terminal with Node.js 22+ and npm:

```sh
cd apps/api
cp .env.example .env
npm install
npm run build
npm run dev
```

In another terminal, request `GET /api/v1/health`. For database health, start PostgreSQL using Docker Compose from the repository root and request `GET /api/v1/health/db`.

## Flutter checks
Install/use a workspace that has Flutter 3.24+ and Dart 3.4+:

```sh
cd apps/mobile
flutter create . --platforms=android,web
flutter pub get
flutter analyze
flutter test
flutter run
```

`flutter create` generates platform wrapper files that are intentionally not fabricated here. The source in `lib/` is a starter UI, not a complete playable game. An APK has not been built in this workspace.

## Next engineering milestone
Make the repository buildable in the selected cloud IDE, run API compile and health checks, then implement documented backgammon rules and server-authoritative game state. Do not store full move histories/replays in the MVP.
