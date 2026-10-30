# Royal Club — owner identity bootstrap and reserved handle

**Status:** implemented in source; production provisioning is not performed by this document.

## Security model

- The platform owner is identified only by the numeric user ID in the server-side `OWNER_USER_ID` environment setting.
- A username, email address, display name, or successful registration is never sufficient to grant owner authority.
- `ElizArya` is reserved case-insensitively. Ordinary accounts cannot claim it through the profile username endpoint.
- The configured owner account may claim `ElizArya` only after its numeric ID is explicitly configured as `OWNER_USER_ID`.
- If `OWNER_USER_ID` is missing or malformed, owner-only operations remain fail-closed and the reserved handle cannot be claimed.
- The owner password is chosen and entered by the owner; it must never be sent in chat, source code, issue comments, or logs.

## Controlled provisioning sequence

1. The owner creates a normal account through the supported registration flow using an email and password they control. No privileged role is granted at registration.
2. The owner verifies that account identity through the platform's separately approved owner-verification process.
3. The numeric account ID is read from the authenticated account profile. It must not be guessed from a username.
4. An authorized operator configures that exact numeric ID as `OWNER_USER_ID` using the hosting provider's secure environment-variable controls. Never place the value in source control or a public log.
5. After a controlled restart/deployment that is separately approved, verify owner-only access with positive and negative tests.
6. While authenticated as that configured owner, set the profile username to `ElizArya`. The server checks the numeric owner ID before allowing the reserved handle.
7. Verify that an ordinary account cannot claim the handle and that the handle itself does not confer owner permissions.

## Current boundary

The repository code implements the reserved-handle guard and the configured-owner check. At the 2026-10-30 production audit, `OWNER_USER_ID` was absent from the deployed function's environment metadata. No production environment change, deployment, account creation, password handling, or owner activation is performed by this change.

## Required acceptance tests

- Non-owner cannot set `ElizArya`, with or without `OWNER_USER_ID` configured.
- A configured owner can set `ElizArya`.
- A missing or malformed owner ID does not grant access.
- Changing the handle to `ElizArya` does not alter permissions; owner authorization continues to compare numeric IDs.
- Case variations of the reserved handle are treated identically.
