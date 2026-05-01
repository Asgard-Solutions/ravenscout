# Raven Scout — v1.0.1 Release Notes

**Release date:** TBD
**Platform:** iOS (App Store) · Android (Google Play)
**Theme:** App Store submission compliance + iPad reliability

This is a compliance and reliability release focused on Apple App Store resubmission. No new end-user features beyond **Sign in with Apple** — the rest of the changes harden existing flows against App Review guidelines and iPad crash paths.

---

## ✨ What's New

### Sign in with Apple *(iOS)*
Raven Scout now supports **Sign in with Apple** on every iPhone and iPad.

- A dedicated "Sign in with Apple" button appears above the Google button on the login screen (black button, white Apple logo — per Apple HIG).
- Supports Apple's **Hide My Email** relay, so you can keep your real email address private.
- Account linking: if you previously signed up with Google or email + password using the same Apple-associated email, the first Sign in with Apple attempt links the existing account instead of creating a duplicate.
- Identity tokens are verified server-side against Apple's public JWKS; issuer + audience are checked against the `io.asgardsolution.ravenscout` bundle id.
- Works alongside Google and email + password — you can still use any method you've used before.

---

## 🐞 Fixes

### iPad Google Sign-In crash
Tapping **Continue with Google** on iPad Air / iPad (iPadOS 26+) could crash the app. The root cause was an invalid iOS URL scheme registration that prevented Safari / SFSafariViewController from returning to the app after OAuth. The reversed iOS client ID is now registered correctly and the crash is resolved.

### Subscription pricing clarity
The paywall layout has been revised so the **billed amount** (e.g. "$79.99 /year") is always the most prominent pricing element, with the per-month equivalent ("≈ $6.67 / month equivalent") shown as smaller secondary text beneath.

### Terms of Use + Privacy Policy in the purchase flow
Functional links to the **Terms of Use (EULA)** (Apple's standard EULA) and **Privacy Policy** are now displayed directly in the Subscription screen inside the app, alongside a plain-language auto-renewal disclosure.

### iOS copy cleanup
Removed references to "Google Play" from iOS-facing strings (subscription confirmation, restore-purchases alerts, out-of-date-build errors). Each surface now displays the correct marketplace name for the platform you're running on.

---

## 🔧 Developer / Integrator Notes

- New backend endpoint: `POST /api/auth/apple`. Accepts `{ identity_token, user, email?, full_name? }`. Verifies the Apple JWT against Apple's JWKS (https://appleid.apple.com/auth/keys — cached 24h with kid-miss refetch). Rejects malformed / untrusted tokens with HTTP 401.
- New frontend dependency: `expo-apple-authentication`.
- `app.json` adds `usesAppleSignIn: true` (iOS) and the `expo-apple-authentication` plugin. The Google Sign-In plugin's `iosUrlScheme` is now the correct reversed iOS client ID.
- New env var (optional, defaults to the production bundle id): `APPLE_AUDIENCE_IDS` — comma-separated list of accepted `aud` claims.

---

## 🙏 Thanks
To the App Review team for the detailed resubmission feedback — it's made the paywall and auth stack noticeably cleaner for every user.

---

*Forged in Asgard, Scouted in the Field.*
*© 2026 Asgard Solutions LLC*
