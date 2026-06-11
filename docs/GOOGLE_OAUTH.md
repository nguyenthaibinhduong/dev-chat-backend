# Google OAuth setup

Backend routes:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3088/v1/api/auth/google-oauth/callback
```

Login flow:

1. Frontend calls `GET /v1/api/auth/google-oauth/redirect?frontendUrl=<frontend-origin>`.
2. Backend returns the Google authorization URL with `redirect_uri=GOOGLE_CALLBACK_URL`.
3. Google redirects to backend `GOOGLE_CALLBACK_URL`.
4. Backend exchanges the code, creates/updates the user, creates app tokens, then redirects to `<frontend-origin>/auth/google/callback?access_token=...&refresh_token=...`.
5. Frontend stores the returned app tokens.

For production, set `GOOGLE_CALLBACK_URL` to your deployed backend URL, for example:

```env
GOOGLE_CALLBACK_URL=https://your-domain.com/v1/api/auth/google-oauth/callback
```

How to get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`:

1. Open Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Select or create a project.
3. Go to `APIs & Services` -> `OAuth consent screen`, then configure app name, support email, audience, and contact email.
4. Go to `APIs & Services` -> `Credentials`.
5. Click `Create credentials` -> `OAuth client ID`.
6. Select application type `Web application`.
7. Add the authorized redirect URI exactly as `GOOGLE_CALLBACK_URL`.
8. Click `Create`, then copy the generated Client ID and Client Secret into env.

Local redirect URI:

```text
http://localhost:3088/auth/api/v1/google-oauth/callback
```

Production redirect URI:

```text
https://realtime-dev-chatapp-dnq2.vercel.app/api/v1/auth/google-oauth/callback
```

The production URI is handled by the frontend proxy and forwarded to the gateway route:

```text
/api/v1/auth/google-oauth/callback -> /v1/api/auth/google-oauth/callback
```

The backend requests these scopes:

```text
openid email profile
```

Troubleshooting:

- `Error 400: invalid_request` with `Missing required parameter: client_id` means `GOOGLE_CLIENT_ID` is empty in the running gateway process. Check the gateway environment, then restart the gateway.
- Local gateway reads `.env` when `NODE_ENV` is not set. If `NODE_ENV=production`, it reads `.env.production` first and `.env` as fallback.
- `GOOGLE_CALLBACK_URL` must point to the backend callback route, for example `http://localhost:3088/v1/api/auth/google-oauth/callback`, unless your frontend domain explicitly proxies that path to the backend.
- The exact `GOOGLE_CALLBACK_URL` value must also be added to Google Cloud Console as an authorized redirect URI.
- If the frontend receives `code` on `/auth/google/callback`, the Google redirect URI is still pointing at the frontend. Update `GOOGLE_CALLBACK_URL` and the Google Cloud authorized redirect URI to the backend callback route.

Official Google references:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/cloud/answer/15549257
