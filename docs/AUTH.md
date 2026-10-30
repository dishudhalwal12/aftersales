# Google sign-in — the three URLs

Google sign-in is a two-hop redirect, and every "it bounces back to the wrong place" bug is one of
these three URLs being pasted into the wrong box. There are exactly three, and they are not
interchangeable.

| # | URL | Who redirects to it | Where it is configured |
|---|---|---|---|
| 1 | `https://<project-ref>.supabase.co/auth/v1/callback` | **Google → Supabase** (hop 1) | Google Cloud Console → APIs & Services → Credentials → OAuth client → **Authorized redirect URIs** |
| 2 | `http://localhost:3000/auth/callback` | **Supabase → our app** (hop 2) | Supabase → Authentication → URL Configuration → **Redirect URLs**; `src/lib/supabase/config.ts` builds it from `NEXTAUTH_URL` |
| 3 | `http://localhost:3000` | where the browser lands when hop 2 has no `redirect_to` | Supabase → Authentication → URL Configuration → **Site URL** |

For this project:

- hop 1 is `https://grcmcajhioleuczdexxv.supabase.co/auth/v1/callback`
- hop 2 is `http://localhost:3000/auth/callback`
- hop 3 is `http://localhost:3000`

## The flow in order

1. `/auth` → `googleSignInAction` calls `supabase.auth.signInWithOAuth({ provider: "google" })`.
   `@supabase/ssr` stores a PKCE `code_verifier` in a cookie and returns the authorization URL.
2. Browser → `accounts.google.com`, with `redirect_uri=…supabase.co/auth/v1/callback` (URL 1).
3. Google → Supabase (URL 1). Supabase validates the Google identity, then redirects to the
   `redirect_to` we passed — `http://localhost:3000/auth/callback` (URL 2) — appending `?code=…`.
4. `src/app/auth/callback/route.ts` exchanges the code, reads the verified email, upserts the
   `User` row, sets the app's own `as_session` cookie, and redirects through `postAuthPath()`.

Supabase never issues a session we keep. From step 4 onward the request is indistinguishable from a
password login, and `auth-crypto.ts` is the only thing that signs anything.

## Deliberate constraints

- `redirect_to` is built from `NEXTAUTH_URL`, **not** from the request's `Origin`/`Host` header —
  otherwise the OAuth round trip could be pointed at an attacker's host.
- An existing password account keeps its password when Google is linked: the upsert only fills
  `googleId`, so Google is a second door into the same user.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design and safe in the browser bundle.
  A `service_role` key must never appear in this repo or in `.env.example`.

## When it breaks

| Symptom | Cause |
|---|---|
| Google: `redirect_uri_mismatch` | URL 1 missing or different in Google Cloud Console |
| Lands on `localhost:3000` with no session | URL 2 missing from Supabase Redirect URLs, so Supabase fell back to Site URL |
| `/auth?error=…` after coming back | code exchange failed — usually the PKCE cookie was lost (different port or host than the one that started the flow) |
| Button says "not configured" | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are empty |

## Verifying the handshake without a browser

```bash
curl -sS -D - -o /dev/null \
  "https://grcmcajhioleuczdexxv.supabase.co/auth/v1/authorize?provider=google\
&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback\
&code_challenge=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG&code_challenge_method=s256" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

A correct setup answers `302` to `accounts.google.com` with `redirect_uri` = URL 1 and
`redirect_to` = URL 2. Anything else means one of the three boxes is wrong.
