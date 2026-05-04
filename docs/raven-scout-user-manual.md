# Raven Scout — User Manual

A complete walkthrough of the app, screen by screen. Everything in this manual matches what's actually in the build — if a feature isn't here, it isn't shipped.

---

## Table of Contents
1. [Account: Sign Up, Sign In, Sign Out](#1-account-sign-up-sign-in-sign-out)
2. [Forgot / Reset Password](#2-forgot--reset-password)
3. [The Home Screen](#3-the-home-screen)
4. [Creating a Hunt — The 4-Step Wizard](#4-creating-a-hunt--the-4-step-wizard)
   - 4.1 Species
   - 4.2 Maps
   - 4.3 Conditions (incl. Known Hunt Locations)
   - 4.4 Review & Analyze
5. [The Results Screen](#5-the-results-screen)
   - 5.1 Map + Overlays
   - 5.2 Top Setups
   - 5.3 Saved Markers Panel (View / Add / Edit / Delete / Drag-to-Reposition)
   - 5.4 Tactical Brief
6. [Saved Hunts](#6-saved-hunts)
7. [Profile & Account Settings](#7-profile--account-settings)
8. [Subscription Management](#8-subscription-management)
9. [Buy Extra Hunt Analytics](#9-buy-extra-hunt-analytics)
10. [Local & Cloud Storage](#10-local--cloud-storage)
11. [Security: Biometric Lock, Sessions, Account Deletion](#11-security-biometric-lock-sessions-account-deletion)
12. [Offline Mode](#12-offline-mode)
13. [Tier-by-Tier Capability Matrix](#13-tier-by-tier-capability-matrix)
14. [Tips & Common Workflows](#14-tips--common-workflows)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Account: Sign Up, Sign In, Sign Out

The first screen offers three paths, with one social login per platform (whichever is native):

- **Sign in with Apple** *(iOS / iPad only)* — one tap; uses your Apple ID. Supports Apple's **Hide My Email** relay, so your real email never leaves Apple. Apple is the only social-sign-in shown on iOS — it's the platform's native, privacy-respecting choice and replaces the Google option entirely on iOS to comply with Apple App Store Guideline 4.8.
- **Continue with Google** *(Android only)* — one tap; uses your Google account email. No password needed.
- **Email + password** — pick **Create Account** to register, or **Sign in** if you already have one. Available on every platform.
- **Use Biometrics** — Face ID / Touch ID / Fingerprint unlock appears below the social option once you've enrolled it on a previous sign-in.

When you create an account by email:
- We send a 6-digit verification code to your inbox.
- Enter the code in the app to finish registration.
- Codes are valid for **15 minutes**. If the email doesn't arrive within ~2 minutes, check spam, then tap **Resend code**.

Brand-new accounts start on the **Trial** tier with **3 lifetime AI hunt analyses** — no credit card, no time limit. You can run them on any supported Trial-tier species.

**Sign out**: Profile → Sign Out (bottom of page). This clears your local session but does not delete your hunts.

---

## 2. Forgot / Reset Password

From the Sign-in screen tap **Forgot password?**, or from inside the app tap **Profile → Forgot / Reset Password**.

1. Enter the email on your account.
2. We email a 6-digit code from `support@asgardsolution.io`.
3. Enter the code in the app, then set a new password.
4. Sign in with the new password.

**Limits**:
- Codes are valid for **15 minutes**.
- Five wrong code entries on a single code burn that code — request a fresh one and start over.
- Password-reset emails to unknown addresses silently no-op (no bounce).

If you originally signed up with **Google** or **Sign in with Apple**, you don't have a password by default. Add one under **Profile → Set Password** so both methods work.

---

## 3. The Home Screen

The home screen shows:

- **RAVEN SCOUT** brand + your tier badge (Trial / Core / Pro).
- **Analyses Remaining** card — current credits left this period or lifetime (Trial). Includes a **Manage Plan** link to the Subscription screen.
- **Welcome, [first name]**.
- **TACTICAL HUNT PLANNING** hero — one-line description.
- Primary button: **NEW HUNT** (becomes **UPGRADE TO HUNT** when you're out of credits).
- **SAVED HUNTS** — opens your hunt history.
- **CAPABILITIES** highlights: Vision AI, Wind Logic, Overlays, multi-species support.
- Disclaimer footer: "Decision-support tool only. Verify land ownership, regulations, and safety independently."

When you're out of credits, the home screen replaces NEW HUNT with **UPGRADE TO CONTINUE** linking to Subscription.

---

## 4. Creating a Hunt — The 4-Step Wizard

Tap **NEW HUNT** to open the 4-step wizard:

### 4.1 Step 1 — Species
Pick your target species. Eight species ship today:
- **Whitetail Deer** *(Trial-allowed)* — bedding-to-feeding transitions, funnels, saddles & edges.
- **Wild Hog** *(Trial-allowed)* — water, thick cover & trails; dusk/dawn ambush.
- **Wild Turkey** *(Trial-allowed)* — roost-to-strut zones; morning open-ground setups.
- **Elk** *(Core / Pro)* — thermals, timber benches & drainage-scale travel.
- **Black Bear** *(Core / Pro)* — food-phase driven; mast, berry & ag targets.
- **Moose** *(Core / Pro)* — pond & willow-bottom dependent; slow, tight, water-centric.
- **Pronghorn Antelope** *(Core / Pro)* — open-country eyesight; water holes & fence-crossing funnels.
- **Coyote** *(Core / Pro)* — pair-bonded predator; calling, downwind intercepts & wind discipline.

Trial users see all 8 in the list but Core/Pro-only species are locked with an upgrade prompt.

### 4.2 Step 2 — Maps
Two map sources, mix freely:

- **Upload an image** — pick from your device's photo library or take a photo with the camera. Anything that visually shows terrain works: satellite, topo, onX/HuntWise screenshots, hand-drawn property maps. The app **resizes large images** before upload to keep AI traffic reasonable — there is no hard MB ceiling.
- **Use the interactive map** — tap **Use Map** to open a MapLibre + MapTiler viewer. Pan, pinch, and switch styles (Satellite / Hybrid / Topo). Tap **Save Map Image** to capture the current view. The capture stores the **GPS bounds** (north / south / east / west) so any markers placed on it later get real GPS coordinates.

You can save up to **5 map images per hunt**. The first one selected is the **primary** image used by the AI on every tier; **Pro** also cross-references additional images.

### 4.3 Step 3 — Conditions
Fill out the hunt context. Most fields auto-fill if Location permission is granted:

- **Hunt date** — picker.
- **Time window** — All Day / Morning / Midday / Evening / Afternoon (per species).
- **GPS coordinates** — auto-filled from device location; tap to edit or paste a `lat, lng` pair.
- **Wind direction** — N/NE/E/.../NW; weather auto-fill on Core / Pro pre-fills this from forecast data.
- **Weather conditions** — temperature, precipitation, cloud cover. Auto-filled on Core / Pro; manual on Trial.
- **Weapon** — Archery / Rifle / Muzzleloader / Shotgun.
- **Method** — Still Hunt / Spot & Stalk / Ambush / Tree Stand / Ground Blind.
- **Species-specific fields** — depending on species: Sign Observed, Calling Activity, Vocalization Activity, Group Size, Travel Pattern, Aggression Indicators, Season Phase Hint.

#### 4.3.1 Known Hunt Locations (optional)
Below the conditions form is a **Known Hunt Locations** section. Tap **Add** to drop a known asset by GPS:

- **Type** — Stand, Blind, Camera, Feeder, Parking, Access Point, Custom.
- **Name** — required (e.g. "North Ridge Ladder").
- **Latitude / Longitude** — required, decimal degrees.
- **Notes** — optional.

Why this matters: when you submit the analysis, every Known Hunt Location is sent to the AI as **fixed reference points** so it can route corridors and access lines around them. **The AI is forbidden from re-positioning your assets** — your stored GPS is preserved verbatim. The asset names also appear on the Saved Markers panel after analysis with the "User provided" coordinate-source tag.

You can add as many assets as you like before analyzing.

### 4.4 Step 4 — Review & Analyze
Review every selection. Tap **ANALYZE HUNT** to send the request. A progress overlay shows while the model runs (~15–45 seconds). The analyze call:
- Sends your primary map image (and additional images on Pro).
- Sends species, weapon, method, GPS, hunt date, time window, wind, weather, and any Known Hunt Locations.
- Returns the AI analysis output.
- Auto-creates the hunt server-side.
- Auto-uploads any saved map images (Pro) to your private cloud storage.
- Auto-persists the AI-returned overlays as Saved Markers (next reload of the hunt re-renders them in place).

If the analysis fails (timeout, network drop, AI rejected the image), the app shows a retry banner. Retries don't double-charge a credit.

---

## 5. The Results Screen

After a successful analysis you land on Results.

### 5.1 Map + Overlays
The primary map image renders with **AI-placed overlays** drawn on top:

- **Stand** (green pin) — ranked stand placements.
- **Travel Corridor** (orange) — predicted travel routes.
- **Access Route** (blue) — your recommended walk-in.
- **Avoid Zone** (red) — sanctuary / pressure / wind-busting terrain.
- **Bedding** (brown), **Feeder** (light green), **Water**, **Funnel**, **Recommended Setup**, **Custom**, etc.

A locked legend below the map matches the overlay colors.

### 5.2 Top Setups
1–3 ranked tactical setups, each with:
- Entry strategy (how to walk in).
- Exit strategy.
- Wind risk assessment.
- Thermals risk.
- Pressure / pressure-pattern risk.
- Best time window (e.g. "first 90 minutes of light").

### 5.3 Saved Markers Panel (View / Add / Edit / Delete / Drag-to-Reposition)
Below the analysis is a **SAVED MARKERS** panel — your personal layer of waypoints on the saved image. Both AI overlays AND your own markers live here, side by side.

What you can do:

- **View details** — tap any marker. A bottom sheet shows: Type, GPS (when the source image is georeferenced), Coordinate Source ("User provided" / "AI estimated from image" / "Derived from saved map bounds" / "Pixel-only image placement"), the linked Known Hunt Location asset name (if any), and confidence (when AI provided one).
- **Add a marker** — tap **+ Add Marker** in the panel header → the image enters drop-pin mode → tap any point on the image. A form opens (Type / Name / Notes) plus a placement preview. Save to commit.
- **Edit** — tap a marker → tap **Edit** → adjust Type / Name / Notes → Save.
- **Delete** — tap a marker → tap **Delete** → confirm. (Or use the **Delete** button inside the edit form footer.)
- **Drag to reposition** — long-press any marker (~220ms) until it visually highlights, then drag it to a new spot and release. The new x/y (and GPS, when the image is georeferenced) is recomputed and persisted automatically.

**Coordinate-source rules** the app enforces, in plain English:
- For **georeferenced** map images (saved from the in-app interactive map), tapping or dragging produces a real lat/lng. Source = "Derived from saved map bounds".
- For **uploaded** images (no GPS metadata), tapping or dragging produces only an on-image x/y position. The app **never fabricates GPS** for these. Source = "Pixel-only image placement".
- For markers tied to your **Known Hunt Locations**, the AI is locked out from changing the GPS — those rows are tagged "User provided" and preserve the stored coordinates exactly. If you drag one of these to a new spot, the source automatically switches to the appropriate derived/pixel-only label so the tag never lies about its origin.

### 5.4 Tactical Brief
Scroll past the Saved Markers panel for the written brief:
- **Summary** — the model's overall read of the spot.
- **Wind Notes** — how the prevailing wind interacts with the placements.
- **Best Time** — the highest-confidence window.
- **Key Assumptions** — what the AI inferred but couldn't see (e.g. "I'm assuming the green polygon north of the road is timber, not a bean field").
- **Species Tips** — species-specific reminders.

---

## 6. Saved Hunts

From the home screen tap **SAVED HUNTS**.

- Lists every hunt you've created on this device, newest first.
- Each card shows species, hunt date, and a green **SAVED** indicator.
- Tap a card to reopen the full Results screen — overlays, markers, brief, all of it.
- A banner at the top says **OFFLINE — Viewing saved hunts** when your device has no signal (you can still browse and view).
- Tap the count strip to see a hint about local-vs-cloud storage.

Re-opening a saved hunt does **not** consume an analysis credit. Edits to markers, drag-to-reposition, and overlay deletes are also free.

---

## 7. Profile & Account Settings

Tap **Profile** (avatar icon) on any screen. The Profile page is divided into sections:

### Identity
- **Avatar + display name + email + tier pill**.
- Tap the **edit pencil** in the header to change your display name. Email cannot be changed.

### Subscription
- Title + subtitle of your current tier (e.g. "Pro Hunter — 40 analyses/mo").
- **HUNT ANALYTICS** — current usage line ("X of Y this month") and balance line ("Z analyses remaining"). When you have purchased Extra Analytics packs, the breakdown shows how many of those are still on file.
- **BUY EXTRA ANALYTICS** button — opens the credit-pack modal (see [Section 9](#9-buy-extra-hunt-analytics)).

### Account
- **Manage Subscription** — opens the dedicated Subscription screen (Section 8).
- **About Raven Scout** — app metadata.
- **Change Password** *(email-account users)* — old + new + confirm.
- **Set Password** *(Google-only users)* — adds a password fallback so both sign-in methods work.
- **Forgot / Reset Password** — sends an email OTP and walks through the reset flow.

### Security
- **Face ID / Touch ID / Fingerprint** toggle. When enabled, the app re-authenticates on cold launch. Disable any time.

### Local Storage
- **Local Storage** card with image count, total bytes used, and oldest item date.
- **Cleanup Interval** picker (e.g. 30/60/90 days) — auto-purge schedule.
- **Run Cleanup Now** — manually purge the local image cache older than the interval.
- **Clear All Local Images** *(destructive)* — removes every locally cached map image. Hunts on the cloud (Pro) re-download on next view; otherwise the image is gone.

### Cloud Storage *(Pro only — section appears when applicable)*
- **Cloud Storage** card with total cloud bytes used.
- **Cleanup orphan images** — removes any images that were uploaded but never linked to a saved hunt (defensive cleanup of abandoned uploads).
- Help text explaining what "orphan" means.

### Privacy & Legal
- **Privacy Policy** — opens our policy URL.
- **Terms of Service** — opens our terms URL.
- **Request Data Deletion** — opens an email composer to support@asgardsolution.io for GDPR / CCPA-style requests.

### Footer Buttons
- **Sign Out** — clears local session, returns to the welcome screen.
- **Restore Purchases** — re-checks the App Store / Play Store for an active subscription via RevenueCat. Use this if you upgraded but the app didn't unlock the new tier.
- **Delete Account** *(destructive)* — permanently deletes your account, hunts, and Pro cloud imagery. App Store / Play Store subscriptions must be cancelled separately.

### App Version
- App version + build number.
- **Check for Updates** button (over-the-air via Expo Updates).

---

## 8. Subscription Management

The Subscription screen (Profile → Manage Subscription, or the "Manage Plan" link on the home usage card) shows:

- Three tier cards: **Trial / Core / Pro** with feature bullets and current price.
- A **CURRENT** badge on whichever tier you're on.
- Action buttons:
  - **Subscribe / Upgrade to Pro / Switch to Core** — initiates the platform purchase via RevenueCat.
  - **Cancel anytime. Unused analyses carry over per your plan.** — disclosure copy.
- **Restore Purchases** link — same effect as the Profile screen button.

Pricing on the cards is the live price from the platform (it can vary by region). Reference prices in our docs:
- Core: $7.99 / month or $79.99 / year
- Pro: $14.99 / month or $149.99 / year

All purchases route through Apple App Store or Google Play. The paywall shows the **billed amount** (e.g. "$79.99 /year") as the most prominent pricing element, with the per-month equivalent shown as small secondary text. The paywall also includes functional links to the **Terms of Use (EULA)** and **Privacy Policy** — tap either to open them in your browser. Cancellation must be done in your store account; access continues through the paid-through date.

---

## 9. Buy Extra Hunt Analytics

When you're running low on monthly analyses you can buy a one-time top-off pack instead of upgrading the whole subscription. From **Profile → BUY EXTRA ANALYTICS** the modal offers:

| Pack | Price | Credits |
|---|---|---|
| 5 Extra Hunt Analytics | $5.99 | +5 |
| 10 Extra Hunt Analytics | $10.99 | +10 |
| 15 Extra Hunt Analytics | $14.99 | +15 |

Rules:
- Packs are **one-time, non-expiring**. Buy once, the credits sit on your account until used.
- **Subscription credits drain first**, then pack credits.
- Packs stack on top of any subscription tier — you can buy them on Trial, Core, or Pro.
- Purchases route through App Store / Play Store via RevenueCat.

---

## 10. Local & Cloud Storage

Raven Scout always keeps your hunts on the device that created them. Cloud backup is a Pro-only add-on.

### Local
- Every hunt's metadata + analysis output + overlays + map images are written to local storage on save.
- The Local Storage card on Profile shows how much disk this is using.
- Auto-cleanup runs in the background based on your **Cleanup Interval** setting; manual triggers are available too.

### Cloud (Pro)
- After a Pro analysis, the app uploads each saved map image to a private AWS S3 bucket (region/bucket are server-configured).
- Object keys are user-scoped: `hunts/{userId}/{huntId}/{imageId}`.
- Download URLs are short-lived signed URLs (default ~60 minutes) — there is no public URL.
- Upload presigns expire ~15 minutes after issue.
- Cross-device sync happens automatically the first time you sign in on the second device.
- Cleanup jobs prune any S3 object that was uploaded but never linked to a saved hunt.

---

## 11. Security: Biometric Lock, Sessions, Account Deletion

### Biometric Lock
Enable Face ID / Touch ID / Fingerprint under **Profile → Security**. When enabled, the app prompts on cold launch (not on every screen change). Disable any time.

### Sessions
- A successful sign-in mints a session token good for **7 days** from the last refresh.
- Active use of the app refreshes the token automatically.
- An expired session shows "Session expired. Please sign in again."

### Password OTP
- Reset codes (sent to email) are valid for **15 minutes**.
- 5 failed code attempts on a single code burn that code. Request a new one — there is no separate cooldown timer.

### Account Deletion
**Profile → Delete Account** at the bottom of the page.
- Removes your account, hunts, and Pro cloud imagery.
- Active App Store / Play Store subscriptions are NOT auto-cancelled — go cancel them in the store yourself, otherwise you'll keep being billed.

For GDPR / CCPA / written requests use **Profile → Request Data Deletion** which opens an email to support@asgardsolution.io.

---

## 12. Offline Mode

What works offline:
- Opening any saved hunt (map image, overlays, written brief, all marker details).
- Viewing the Saved Hunts list.
- Browsing the home screen, Profile, and About.

What requires connectivity:
- Running a NEW analysis (it round-trips to the AI backend).
- The interactive in-app map (tile fetch).
- Weather auto-fill (Core / Pro).
- Cloud backup / restore.
- Buying extra analytics or changing subscription.
- Sign-in / sign-out / password reset.

The Saved Hunts screen surfaces a clear **OFFLINE** banner when it detects no network.

---

## 13. Tier-by-Tier Capability Matrix

| Capability | Trial | Core | Pro |
|---|---|---|---|
| Cost | Free | $7.99/mo · $79.99/yr | $14.99/mo · $149.99/yr |
| AI hunt analyses | 3 lifetime | 10 / month | 40 / month |
| Rollover of unused analyses | — | 1 cycle | 12 cycles |
| Species available | Deer · Hog · Turkey | All 8 | All 8 |
| Multi-image correlation per hunt | Primary only | Primary only | Up to 5 images |
| Cloud backup of map imagery | — | — | ✓ |
| Weather / wind auto-fill | — | ✓ | ✓ |
| Saved-marker editor (view / add / edit / delete / drag) | ✓ | ✓ | ✓ |
| Known Hunt Locations (assets) | ✓ | ✓ | ✓ |
| Buy Extra Analytics packs | ✓ | ✓ | ✓ |
| Offline access to saved hunts | ✓ | ✓ | ✓ |
| Interactive map | ✓ | ✓ | ✓ |
| Biometric app lock | ✓ | ✓ | ✓ |

---

## 14. Tips & Common Workflows

### Getting better AI output
- Crop your map to roughly 0.5–2 square miles before uploading. Too zoomed-out = generic output.
- Make sure terrain features are visible (trees, water, roads). Solid-green satellite tiles produce vague answers.
- Pro: upload a satellite + a topo of the same area for the strongest read.
- Set wind realistically. Garbage wind in = garbage stand placement out.

### Saving stands you already know
Use **Known Hunt Locations** on Step 3 of the wizard. The AI treats them as ground truth and routes corridors / access around them — they show up tagged "User provided" on the Saved Markers panel afterward, with their GPS preserved exactly as you typed it.

### Re-using a hunt for a different day
Open a saved hunt → no re-analyze button is required if conditions haven't changed. To re-run with different wind / time, open the saved hunt, tap the back arrow, start a NEW HUNT, and reuse the same images.

### Sharing a hunt
Currently Raven Scout doesn't ship a public sharing mechanism — your hunts are scoped to your account. Screenshots are the fastest way today.

### Switching devices (Pro)
Sign in on the new device with the same account. Pro hunts auto-sync from the cloud the first time the app boots online. Trial / Core hunts stay on the original device.

---

## 15. Troubleshooting

- **"Couldn't reach our servers"** → switch to Wi-Fi or wait for better signal. Saved hunts still work.
- **"Analysis failed — try a tighter crop"** → re-crop to a smaller, terrain-rich area and retry.
- **"You've hit your analysis limit"** → upgrade, buy an Extra pack, or wait for next billing cycle.
- **"Could not verify your purchase"** → tap **Restore Purchases** under Profile or Subscription.
- **Trial says weather is missing** → Trial doesn't include weather auto-fill. Type wind / temp manually on the Conditions step.
- **A marker isn't where I dropped it after reload** → confirm the image had GPS bounds when you saved it (in-app interactive map = yes, uploaded screenshot = no). Pixel-only markers move with the image scaling but never get GPS.
- **Pro features didn't unlock after upgrading** → wait ~30 seconds, force-close, reopen, **Restore Purchases**.
- **Code email never arrived** → check spam, then **Resend code**. Codes are 15-minute live; old codes invalidate when a new one is requested.

For anything else: **support@asgardsolution.io**. Include your device model, OS version, app version (Profile → About), and what you were doing when the error appeared.

---

*Forged in Asgard, Scouted in the Field.*
*© 2026 Asgard Solutions LLC*
