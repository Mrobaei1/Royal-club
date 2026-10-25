# Royal Club — starter scaffold

Status: actively developed in `feature/password-min-6`. This branch is not a production deployment; validate the current CI run before merging.

## Contents
- `apps/mobile`: Flutter/Dart starter source (Android-first UI entry point)
- `apps/api`: TypeScript + Fastify API with health endpoint and PostgreSQL connectivity check
- `infra/docker-compose.yml`: local PostgreSQL service
- `docs/DEVELOPMENT-ANDROID.md`: phone-first cloud development workflow

## Current implemented modules
- Authentication and profile endpoints
- Friends, notifications, online-match APIs, and backgammon rules
- Non-transferable wallet-credit ledger and subscription activation
- Owner-only mobile admin screen for crediting a user and editing/enabling subscription plans

## Owner admin configuration
Set `OWNER_USER_ID` in the API environment to the numeric `users.id` of the owner. Leave it unset to keep owner-only operations disabled. The admin screen checks `/api/v1/admin/status`, and the server independently enforces owner authorization on every administrative write. Do not use an email address or expose this setting in the client app.

## Deployment configuration checklist

- Set `DATABASE_URL` to the managed PostgreSQL connection string and `JWT_SECRET` to a random secret of at least 32 characters.
- Set `CORS_ORIGINS` to the exact comma-separated HTTPS origins serving the web app. Do not use `*` for a production deployment.
- Set `OWNER_USER_ID` only after confirming the owner's numeric database user ID; leave it blank to disable owner-only routes.
- Build the Flutter app with `--dart-define=API_BASE_URL=https://YOUR-API-HOST` so it does not depend on the temporary Codespaces API URL.
- Verify database backups, restore procedures, TLS, monitoring, and a real deployed health check before inviting users. GitHub Actions passing is a build/test signal, not proof of a production deployment.

## Quick start (cloud IDE or computer)
1. Import this folder/repository into a cloud IDE with a terminal (see `docs/DEVELOPMENT-ANDROID.md`).
2. Start PostgreSQL with `docker compose -f infra/docker-compose.yml up -d db` where Docker is supported.
3. API: `cd apps/api && cp .env.example .env && npm install && npm run dev`
4. Check `GET /api/v1/health` and `GET /api/v1/health/db`.
5. Flutter: in an environment with Flutter installed, from `apps/mobile`, run `flutter create . --platforms=android,web` if platform wrapper files are missing, then `flutter pub get` and `flutter run`.

Never put production secrets in source control. The included credentials are for local development only.

## Hands-on test preview

The latest validated web build is published at: https://mrobaei1.github.io/Royal-club/

### Quick test checklist
1. Open the preview in Chrome. On first launch, the app should show the authentication gate rather than the games home.
2. Try the registration and login screens. A successful authentication should lead to the games home.
3. Confirm the home screen still shows backgammon, chess, and card games.
4. Open backgammon and test legal moves, dice rolls, and the available AI difficulty options.
5. Check the account, friends, notifications, private chat, wallet/subscription, and admin entry points; report any screen that fails to open or shows an error.

**Important:** the API default in the mobile app currently points to a temporary GitHub Codespaces host. If registration/login reports a network, CORS, or server error, the backend may be asleep or unavailable; that is separate from the published web UI. A stable API deployment and persistent database are still required before production use. Do not enter real passwords or payment details in this test build.

## Current validation

The main-branch web-preview workflow completed successfully on 2026-10-25, including API build, Flutter analysis, Flutter tests, web release build, and GitHub Pages deployment. This confirms the build pipeline, not a full end-to-end test against a permanently hosted API.

## First hands-on test

- Web preview: https://mrobaei1.github.io/Royal-club/
- The web preview is a test build, not a production service. Registration, login, and online play require the configured API host and database to be reachable.
- An Android release APK is built by the `Royal Club Android APK` workflow. Open the repository's **Actions** tab, select the latest successful **Royal Club Android APK** run, and download the `royal-club-android-apk` artifact. Extract the ZIP and install `app-release.apk` on an Android phone. GitHub keeps this artifact for 7 days.
- During testing, try registration/login, local backgammon against AI, and the home screen. Chess and card-game tiles should remain visible. Send any error text or a screenshot with the action you were performing.
