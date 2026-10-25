# Deploy the Royal Club test API

The Android APK and GitHub Pages preview are separate from the backend. Registration, login, friends, chat, wallet, and online matches need a reachable API and database. The old temporary Codespaces address is intentionally no longer used as a default.

## 1. Create the test API

1. Open the [Royal Club Render Blueprint](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMrobaei1%2FRoyal-club) and sign in to Render.
2. Review the resources from `render.yaml` and create the web service and PostgreSQL database.
3. Wait for the API service to finish deploying. Render generates the public service URL; copy the exact URL shown in its dashboard. Do not copy or share the database connection string or JWT secret.

The blueprint sets a generated `JWT_SECRET`, a database connection, and the GitHub Pages origin for CORS. Keep the owner-only `OWNER_USER_ID` unset until the owner's numeric database user ID is confirmed.

## 2. Verify the service

Open this address in a browser, replacing the example host with the exact Render service URL:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health
```

Continue only when the response reports a healthy status. If the service is still deploying or reports an error, check the Render service logs first.

## 3. Connect future builds to the API

In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, then create a repository variable:

- **Name:** `API_BASE_URL`
- **Value:** the exact public API base URL from Render, including `https://` and with no trailing slash.

This is a public endpoint, not a secret. Never put `DATABASE_URL`, `JWT_SECRET`, or other credentials in a repository variable, source file, or mobile build.

## 4. Rebuild and test

1. Open **Actions → Royal Club Web Preview → Run workflow**, select `main`, and run it to rebuild the web preview with the new API URL.
2. Open **Actions → Royal Club Android APK → Run workflow**, select `main`, and run it to create a new APK with the same URL.
3. Download the `royal-club-android-apk` artifact from the successful run, extract it, and install `app-release.apk`.
4. Test registration with a test-only email and password, then sign in and try local backgammon. Next, test friends, notifications, wallet, and online lobby. Keep the chess and card-game home tiles visible.

On a free hosting tier the API may sleep after inactivity, so its first response can be delayed. This setup is for testing only; before a public launch, configure durable backups, monitoring, rate limits, a recovery plan, and review the hosting provider's current limits. Never use real payment details in the test build.
