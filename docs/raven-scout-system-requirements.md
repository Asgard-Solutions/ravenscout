# Raven Scout — System Requirements

## Mobile Device
| | Minimum | Recommended |
|---|---|---|
| iOS | iOS 15.0 | iOS 16.0+ |
| Android | Android 8.0 (API 26) | Android 12+ (API 31+) |
| RAM | 2 GB | 4 GB+ |
| Free storage | 150 MB | 500 MB |
| Screen | 4.7" | 5.5"+ |

The app is an Expo / React Native build shipped as a standalone iOS IPA and Android APK / AAB. It is NOT an Expo Go-only app.

## Connectivity
- Creating a hunt or running an AI analysis **requires** an internet connection (cellular 4G/LTE or Wi-Fi). Analysis uploads compressed map imagery and round-trips to our AI backend.
- Viewing an already-saved hunt is fully **offline** — the map + overlays + written brief are cached locally.
- Cloud backup (Pro tier) requires Wi-Fi or LTE good enough to PUT your full-resolution maps to AWS S3 (typically a few MB per image).

## Permissions
- **Location** (optional, recommended) — pre-fills GPS and auto-fetches weather / wind.
- **Photo library** (optional) — pick saved map screenshots.
- **Camera** (optional) — snap a map inside the app.
- **Notifications** (optional) — subscription / billing alerts only.

Every permission can be declined and re-enabled later in your device settings.

## Account
You need an email address OR a Google account. Password reset uses a 6-digit code sent to your registered email.

## Payment (Pro / Core)
Purchases are processed by the App Store (iOS) or Google Play (Android) through RevenueCat. A valid store account with a payment method on file is required for paid tiers. No card is required for the 14-day Trial.
