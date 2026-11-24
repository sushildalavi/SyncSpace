# Google sign-in: setup and verification

SyncSpace uses **Better Auth's Google provider** (OAuth 2.0 authorization-code flow with PKCE and OpenID Connect).
The server verifies the ID token's signature, issuer, audience and expiry, and checks the `state` it issued.
It asks for exactly three scopes: `openid`, `email`, `profile`. No Gmail, Drive or Calendar access is requested,
no refresh token is requested (`access_type` is not `offline`), and Google access/refresh/ID tokens are **discarded
before they reach the database**, since only the identity is needed.

The Google button is shown only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set. The web app asks
the API (`GET /config`) rather than guessing.

## 1. Create the OAuth client

1. Open <https://console.cloud.google.com/> and create (or select) a project, e.g. `syncspace`.
2. **APIs & Services → OAuth consent screen** (called *Google Auth Platform → Branding* in the newer console).
   - User type: **External** (use *Internal* only for a Google Workspace org).
   - App name `SyncSpace`, support email, developer contact email.
   - App logo, home page, privacy policy and terms links are optional while the app is in *Testing*, and
     **required before publishing** to production.
   - **Scopes**: add only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive
     scopes, so they don't trigger Google's sensitive-scope verification.
   - **Test users**: while the publishing status is *Testing*, only listed Google accounts can sign in (max 100).
     Add every account you will try, including your own.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**, name `SyncSpace web`.
   - **Authorized JavaScript origins**: not needed. The browser never talks to Google's token endpoint, because the
     flow is a server-side redirect. You may leave this empty (adding the web origin is harmless).
   - **Authorized redirect URIs** (must match *exactly*, including scheme, host, port and no trailing slash):

     | Environment | URI |
     | --- | --- |
     | Local development | `http://localhost:3001/api/auth/callback/google` |
     | Production | `https://api.example.com/api/auth/callback/google` |

   - Save, then copy the **Client ID** and **Client secret**.

The callback lives on the **API origin** (`API_BASE_URL`), not the web origin.

## 2. Configure

```bash
# .env (never commit this file)
API_BASE_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

With Docker: put the same values in a `.env` next to `docker-compose.yml`; compose forwards them. Restart the API
(`docker compose up -d api`). Check `curl localhost:3001/config` returns `"googleEnabled": true`.

### Production notes

- Serve both apps over HTTPS and set `NODE_ENV=production` (this enables `Secure` cookies).
- Put the web app and API on the **same registrable domain** (for example `app.example.com` and `api.example.com`)
  so the SameSite=Lax session cookie is first-party for both fetches and the collaboration WebSocket.
- Set `TRUST_PROXY` to the number of reverse proxies in front of the API so rate limiting sees real client IPs.
- Publishing: move the consent screen from *Testing* to *In production*. For these non-sensitive scopes Google
  needs only the branding fields above, with no security assessment.

## 3. Account behaviour

| Situation | Result |
| --- | --- |
| New person signs in with Google | Account created, email marked verified (from Google's `email_verified`) |
| Returning Google user | Signed in to the same account |
| Google email matches an existing email/password account | **Refused** with an explanation. Identities are never merged by email. |
| Signed-in user clicks *Connect Google* (Settings → Connections) | Linked to the current account |
| Google identity already linked to another account | Refused |
| Consent cancelled / expired state / tampered state | Friendly error page, no session created |
| Disconnect Google when it's the only sign-in method | Refused |

Linking and unlinking require a *fresh* session (signed in within the last day). Otherwise the user is asked to sign in again.

## 4. What is and isn't verified

| Layer | Evidence |
| --- | --- |
| OAuth handling in this app: state, PKCE (S256), scopes, ID-token verification, cancel and tamper paths, linking rules | `e2e/google.spec.ts`, which runs Better Auth's real callback code against `e2e/support/mock-google.mjs` (a local OIDC stand-in that signs RS256 tokens and enforces PKCE, redirect URI and client credentials) |
| **Live Google**: that your Cloud project, consent screen and redirect URI are configured correctly | **Not verified here.** No Google credentials were available. Run the checklist below with your own client. |

### Live verification checklist

1. `docker compose up -d` with real credentials in `.env`; `/config` shows `googleEnabled: true`.
2. Sign in with a *test user* account on <http://localhost:3000/sign-in>. Expect: Google consent shows "SyncSpace" and
   lists only name, email, profile picture. You land on the dashboard.
3. Settings → Security shows the new session. Sign out, sign in again: same account.
4. In <https://myaccount.google.com/permissions> confirm the app lists only basic profile access.

## 5. Common errors

| Symptom | Cause / fix |
| --- | --- |
| `Error 400: redirect_uri_mismatch` | The URI in Cloud Console isn't *exactly* `${API_BASE_URL}/api/auth/callback/google`. Check port, `http` vs `https`, trailing slash. Changes can take a few minutes to apply. |
| `Error 403: access_denied` / "app not verified" | Consent screen is in *Testing* and your account isn't a test user. Add it. |
| Redirected to `/auth/error?error=state_mismatch` | The sign-in was started in another browser or took too long, or cookies are blocked. Retry in one tab. In production make sure API and web share a registrable domain. |
| Signed in on Google but app shows signed out | Session cookie wasn't stored: `API_BASE_URL` host differs from where the browser sees the API, or `Secure` cookies over plain HTTP (`NODE_ENV=production` without HTTPS). |
| `account_not_linked` | Working as intended. An account with that email already exists. Sign in with the password, then connect Google. |
| Google button missing | `GOOGLE_CLIENT_ID`/`SECRET` not both set (an empty value counts as unset). |
