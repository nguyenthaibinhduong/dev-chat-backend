# Google OAuth setup

Backend routes:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3088/v1/api/auth/google-oauth/callback
```

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
http://localhost:3088/v1/api/auth/google-oauth/callback
```

Production redirect URI:

```text
https://your-domain.com/v1/api/auth/google-oauth/callback
```

The backend requests these scopes:

```text
openid email profile
```

Official Google references:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/cloud/answer/15549257
