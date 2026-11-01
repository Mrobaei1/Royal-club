# Deploy the Royal Club API for free with Neon Functions

Royal Club's web preview is hosted on GitHub Pages. Registration, login, friends, chat, wallet, and online backgammon also need a reachable API and PostgreSQL database.

This repository includes a deployment workflow for **Neon Functions**, which can host the API without a separate Render service. Neon Functions currently support Frankfurt, Germany, but not London. Keep the existing London project for now; create a separate free Neon project in Frankfurt for the API.

## One-time setup (account owner)

1. In Neon, create a new project named `Royal-Club-API` and select **AWS Europe (Frankfurt)** as the region. Keep the free plan. Do not delete the existing London project.
2. Open the new project's default branch and note the **project ID** and **branch ID**. These are identifiers, not database passwords.
3. In Neon account settings, create a Neon API key with permission to deploy/manage Functions. Keep the key private.
4. In GitHub, open this repository's **Settings → Secrets and variables → Actions → Secrets** and add:
   - `NEON_API_KEY`: the Neon API key
   - `ROYAL_CLUB_JWT_SECRET`: a newly generated random secret with at least 32 characters
5. Merge the deployment changes into `main`. Then open **Actions → Deploy Royal Club API to Neon Functions → Run workflow**. Enter the Frankfurt project's project ID and branch ID, then run it.
6. For online voice, create a **Realtime TURN key** in Cloudflare (Calls → TURN). Add its UID as the GitHub Actions secret `CLOUDFLARE_TURN_KEY_ID` and its one-time 64-character key as `CLOUDFLARE_TURN_API_TOKEN`. Do not paste the key into chat, source files, or ordinary GitHub variables. The deployment workflow validates and transfers both values into Neon Function environment configuration; if both secrets are absent, the API deploys with voice networking disabled.

The workflow builds and tests the API, bundles the Fastify routes into a Fetch-compatible Neon Function, deploys it, checks `/api/v1/health`, saves the public URL as the GitHub Actions variable `API_BASE_URL`, and starts a new GitHub Pages build.

## Verify

The deployment job must finish successfully and show **API health check: passed**. Then open the GitHub Pages site and test account registration and login with a test-only email/password. Never test with a password reused on another service.

If the workflow fails:
- **Missing secret:** check that both repository secrets were added with the exact names above.
- **401/403 from Neon:** create/check the Neon API key and its permissions.
- **Function build/health failure:** open the Neon project in Frankfurt, inspect the Function's logs, and check that the project/branch IDs are correct.
- **Database connection failure:** verify that the new Frankfurt project has its default PostgreSQL branch and compute available.

## Security and cost notes

- Do not commit `DATABASE_URL`, a Neon API key, or `JWT_SECRET` to GitHub source files or repository variables.
- Neon injects the branch's `DATABASE_URL` into the Function environment. The workflow stores application secrets and optional Cloudflare TURN credentials in Neon Function environment configuration.
- The Function is public HTTPS; the API's authentication and rate limits still apply.
- Neon Functions are available on the free plan subject to current quotas and limits. Check Neon usage if traffic grows.
- The previously shared database password should be rotated when convenient because it was exposed in chat. The deployment does not require posting it again.
