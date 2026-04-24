# Raven Scout — User Manual

*A smarter way to plan your hunt.*

---

## Table of Contents

1. [What is Raven Scout?](#1-what-is-raven-scout)
2. [Getting Started](#2-getting-started)
3. [Subscription Tiers](#3-subscription-tiers)
4. [Main Navigation](#4-main-navigation)
5. [Setting Up a Hunt](#5-setting-up-a-hunt)
6. [Capturing Map Images](#6-capturing-map-images)
7. [Running the Analysis](#7-running-the-analysis)
8. [Understanding Your Results](#8-understanding-your-results)
9. [Editing Overlays](#9-editing-overlays)
10. [Viewing Past Hunts (History)](#10-viewing-past-hunts-history)
11. [Weather Integration](#11-weather-integration)
12. [Hunt Styles Explained](#12-hunt-styles-explained)
13. [Tips for Best Results](#13-tips-for-best-results)
14. [Troubleshooting](#14-troubleshooting)
15. [Privacy and Data](#15-privacy-and-data)
16. [FAQ](#16-faq)

---

## 1. What is Raven Scout?

Raven Scout is a field-first **hunting companion app** for iOS and Android. It uses AI to analyze satellite / topo map images of your hunting property and generates tactical advice tailored to the species, weather, wind, and your preferred hunting style.

### What it does for you
- **Finds likely stand / blind locations** on your map
- **Identifies travel corridors, bedding zones, food sources, and water** based on terrain features
- **Recommends wind directions to avoid** so you don't blow yourself out
- **Suggests best times of day** given your scheduled hunt window
- **Highlights avoid zones** (deer bedding too close to the road, crop edges that get pressured, etc.)
- **Adapts to your hunt style** — archery, rifle, blind, saddle, public land, spot-and-stalk
- **Saves your hunt history** so you can revisit old plans before heading back to a spot

### What it is NOT
- Not a live GPS tracker (use OnX, HuntStand, or BaseMap for that)
- Not a replacement for scouting in person
- Not a legal/regulation lookup
- Not a weather forecaster for days in advance (we pull current conditions for your hunt window)

---

## 2. Getting Started

### Requirements
- iOS 15+ or Android 11+
- Mobile data or Wi-Fi (offline analysis not currently supported)
- A Google account for sign-in

### First launch
1. **Download Raven Scout** from the App Store or Google Play
2. Open the app — you'll land on the sign-in screen
3. Tap **"Sign in with Google"**
4. Pick the Google account you want to use — a one-tap native system dialog appears
5. Accept the requested permissions (email + profile — we never read your email content)
6. You're in — the home screen (NEW HUNT) opens automatically

### What sign-in creates
- A Raven Scout account linked to your Google email
- A **Trial tier** (3 free hunt analyses) for brand-new accounts
- All your hunts persist to our server so you can switch devices without losing history

---

## 3. Subscription Tiers

| Tier  | Monthly analyses | Multi-image uploads | Pricing |
|-------|------------------|---------------------|---------|
| Trial | 3 free          | Single image only   | Free, one-time |
| Core  | 10/month        | Single image        | Paid monthly |
| Pro   | 100/month       | Up to 5 images + supporting views | Paid monthly |

### How the limit works
- Every successful analysis counts against your monthly quota
- A **failed analysis** (network error, image rejected, bad coordinates) does NOT count
- Your counter **resets on the 1st of each month**
- Upgrading mid-cycle gives you the higher tier's limit *for the current month* — no proration, no lost analyses

### How to upgrade
1. From the home screen, tap the tier badge in the top-right (e.g. "TRIAL 2/3")
2. The **Subscription** screen opens — compare tiers
3. Tap your chosen tier → app's native payment sheet (Apple Pay / Google Pay) appears
4. Confirm the purchase → your tier updates within ~5 seconds
5. Your next hunt immediately uses the new tier's features

### How to cancel
- **iOS**: Settings → Apple ID → Subscriptions → Raven Scout → Cancel
- **Android**: Google Play → Profile → Subscriptions → Raven Scout → Cancel

You keep your upgraded tier features until the end of the current billing period.

---

## 4. Main Navigation

The app has 3 primary screens:

### Home (NEW HUNT)
- Start a new hunt analysis
- See your current tier + usage counter
- Jump to history

### Hunt Setup (the main workflow)
- Pick species, date, time, wind, temp, property type, region, hunt style
- Upload / capture map images
- Trigger the analysis

### Results
- See the analyzed map with tactical overlays
- Read the tactical summary + top 3 setups
- Switch between **Image View** (annotated map) and **Map View** (overlay on MapLibre satellite)
- Edit overlays (move, add, delete)

Supporting screens:
- **History** — scrollable list of past hunts with thumbnails and date
- **Subscription** — tier comparison + upgrade
- **Login** — only shown when signed out

---

## 5. Setting Up a Hunt

From the **NEW HUNT** screen, tap **START** to enter hunt setup. The form is scrollable and has 9 fields:

### 5.1 Species
Tap the species row to see the picker:
- **Whitetail Deer** — fully supported (primary species)
- **Turkey** — supported
- **Hog (feral pig)** — supported

Each species has its own tactical prompt — e.g. turkey logic emphasizes roost trees, strut zones, and dusting areas, while whitetail focuses on funnels, scrapes, and bedding cover.

### 5.2 Hunt Date
Tap to open the date picker. Dates in the past are allowed (historical analysis). Dates in the future pull forecast weather when available.

### 5.3 Time of Day
Four options:
- **Dawn** — 30 min before sunrise to 2 hr after
- **Morning** — full morning movement window
- **Midday** — 10 AM – 3 PM (harder hunting, thermals mentioned explicitly)
- **Evening** — 2 hr before sunset through dark

### 5.4 Wind Direction
Pick from 8 compass points (N, NE, E, SE, S, SW, W, NW). This is the **forecast wind for your hunt window** — the AI uses it to flag which setups get blown out and suggest wind-safe alternatives.

### 5.5 Temperature
Enter °F. Influences pressure, rut timing for whitetail, and thermal patterns.

### 5.6 Property Type
- **Private land** — no hunting pressure assumptions
- **Public land** — the AI assumes elevated pressure, avoids road/trail-adjacent setups, emphasizes harder-access spots

### 5.7 Region
Auto-derived from GPS if you granted location permission. Manual options include:
- SE-US (hot, humid, longer seasons)
- MW-US (rut heavy, corn/bean rotation)
- NE-US (mast-driven, pressured)
- W-US (public-heavy, steep terrain)
- ...and others

Regional context changes food-source assumptions and pressure baselines.

### 5.8 Hunt Style
New in recent versions. Picks one of:
- **Archery** — 25-yard effective range, wind focus, closer setups
- **Rifle** — 200+ yard setups, sight lines emphasized
- **Blind** — ground setups, cover needs
- **Saddle** — tree-based, fluid spots, multiple trees considered
- **Public Land** — emphasizes pressure avoidance, deep back-country
- **Spot-and-Stalk** — glassing / still-hunting routes, no fixed setups

The AI rewrites recommendations to match — e.g. if you pick **saddle**, it emphasizes tree-to-tree flexibility; if you pick **spot-and-stalk**, fixed stand locations become "observation points" with glassing lanes.

### 5.9 Images (see next section)

---

## 6. Capturing Map Images

The AI analysis is 95% driven by the image(s) you upload. Quality here determines quality of results.

### Where to get good map screenshots
- **OnX Hunt** (recommended) — screenshot the hybrid satellite layer at 14-17 zoom
- **HuntStand** — satellite view with property lines
- **CalTopo / Google Earth** — topo with shaded relief
- **BaseMap** — cropland / forest type layers are gold

### Screenshot guidelines
| Do | Don't |
|---|---|
| Zoom to see terrain features clearly (trees, fields, water) | Zoom so far in you only see 2 acres |
| Include property boundaries if visible | Include other apps' UI chrome (tap the Fullscreen/hide UI button first) |
| Capture your WHOLE hunt area | Crop out the parking / bedding you suspect |
| Use satellite or satellite-hybrid layers | Use "paper map" or road-only layers — the AI needs to see terrain |

### Uploading in the app

**Tap the "+ Add Map Image" card** in hunt setup. You get three options:

1. **Choose from Photos** — pick an existing screenshot
2. **Take a Photo** — aim at a printed topo, for instance
3. **Open Map View** — opens the in-app MapLibre satellite map; pan + zoom to your spot, then tap **CAPTURE AREA** to save a screenshot. Current GPS is embedded if you granted location permission.

### Trial / Core — 1 image
Only the primary map. Good for 80% of use cases.

### Pro — up to 5 images
- **Image 1**: your primary map (coordinate reference) — REQUIRED
- **Images 2-5**: supporting views — e.g. same spot at different zoom, adjacent parcel, close-up of a bedding pocket

The AI treats image 1 as the coordinate reference. All overlays use image 1's pixel space.

### Image sizing behind the scenes
- Images auto-compress on upload: max 1600px longest edge, JPEG quality 0.85
- This stops mobile browsers from OOM-crashing on tall panoramic screenshots
- Original quality is preserved for the AI — compression happens AFTER the server accepts it

---

## 7. Running the Analysis

With all fields filled and at least one image added, tap **ANALYZE HUNT** at the bottom.

### What happens
1. The **raven spinner** appears with "ANALYZING TERRAIN" — typical wait: **20-60 seconds**
2. Behind the scenes:
   - Your images are uploaded to our backend
   - GPT-5.2 Vision AI receives a species-specific + hunt-style-specific prompt
   - The AI returns a structured JSON payload with overlays and tactical text
   - Our server validates the response, normalizes coordinates, and increments your usage counter
3. The app navigates to the **Results** screen automatically

### If it fails
- **"Daily limit reached"** — you've used all monthly analyses. Upgrade or wait for reset.
- **"Network error"** — your phone can't reach our servers. Try again on a better connection.
- **"Analysis unavailable"** — the AI service is down or slow. Wait 5 minutes and retry.
- **"Bad image"** — your image couldn't be read (corrupted PNG, too small, wrong format). Try a fresh screenshot.

---

## 8. Understanding Your Results

The Results screen is divided into sections — scroll through from top to bottom.

### 8.1 Header bar
- Species + date + time window
- Wind direction + temperature
- Back button (returns to home)

### 8.2 View mode tabs
- **MAP** — shows your uploaded image with overlays drawn on top. Pan and zoom with pinch gestures.
- **MAP VIEW** (Pro feature) — shows the same overlays drawn on a live MapLibre satellite map. Requires your GPS embedded in the image.

### 8.3 The annotated image
Overlays are color-coded:

| Color | Type | Meaning |
|---|---|---|
| **Gold diamond** | Primary setup | Best stand / blind / saddle tree |
| **Silver diamond** | Alternate setup | Backup if wind shifts |
| **Amber circle** | Travel corridor | Deer movement path |
| **Green zone** | Bedding area | Where the animals rest |
| **Blue zone** | Water | Creek, pond, wetland |
| **Yellow zone** | Food source | Crops, mast, browse |
| **Red zone** | Avoid | Bad wind, high pressure, thermal trap |

Tap any overlay → popover shows the AI's reasoning ("oak ridge with south-facing bench; deer traverse here before hitting the beans at dusk").

### 8.4 Tactical summary
3-5 sentence paragraph covering the **big picture**:
- Wind rating for the day
- Best time window to be on stand
- Whether today's conditions favor movement
- Key terrain feature that dictates deer behavior today

### 8.5 Top 3 setups
Three ranked recommendations, each with:
- Numbered pin (matches the map marker)
- Setup type (ladder stand / ground blind / saddle / still-hunt corner)
- Wind requirements ("shootable N, NE")
- Best time ("evening only — morning wind wrong")
- Why it's ranked here

### 8.6 Wind notes
Specific commentary on today's wind direction:
- Which setups it kills
- Which setups it enables
- Thermal considerations (cold mornings, midday warming)

### 8.7 Key assumptions
Transparency section: the AI lists what it had to guess because the image didn't show it clearly:
- "Assumed beans are harvested (satellite date older than hunt date)"
- "Couldn't confirm the creek crossing — verify on the ground"
- "Property line uncertain — confirm your boundaries"

Always read this. It tells you where to ground-truth before trusting a setup.

### 8.8 Species-specific tips
Unique tips per species:
- **Whitetail**: rut phase assumptions, scrape line mentions
- **Turkey**: roost locations, strut zones by time of day
- **Hog**: rooting signs, wallow distance

---

## 9. Editing Overlays

The AI nails it 70-80% of the time. The remaining 20% you'll want to adjust. Tap the **EDIT** button (pencil icon) in the Results toolbar:

### 9.1 Move an overlay
Long-press any marker/zone → drag to new location → release. Coordinates update automatically.

### 9.2 Add a new overlay
Tap **+ Add** in edit mode → choose type (setup / avoid zone / food / water / etc.) → tap on the map where you want it.

### 9.3 Edit the note
Tap any overlay → tap the note text → keyboard opens → edit → tap **Save**.

### 9.4 Delete
Tap an overlay → tap the trash icon.

### 9.5 Save edits
Tap **DONE** → changes persist to local storage and sync to the cloud.

### 9.6 Undo
Tap **UNDO** in edit mode to revert the last change. Multiple undos supported.

---

## 10. Viewing Past Hunts (History)

Tap the history icon (clock) on the home screen to see all your past analyses, newest first.

### 10.1 Each history row shows
- Thumbnail of the primary map image
- Species + date of the hunt
- Summary first line
- Tap anywhere → opens the full Results screen for that hunt

### 10.2 Delete a hunt
Swipe left on a history row → tap **Delete** → confirm. Removes from both device and cloud.

### 10.3 Cross-device sync
Your hunts sync to our server the moment analysis completes. Sign into Raven Scout on a new phone → your history appears automatically.

---

## 11. Weather Integration

Raven Scout pulls live weather from WeatherAPI.com when your hunt image has GPS embedded (from the in-app map capture).

### What the AI uses
- **Current wind speed + direction** — supplements your manual selection
- **Barometric pressure + trend** — influences movement prediction
- **Precipitation** — rain adjusts food/bedding dynamics
- **Temperature swing** — cold fronts trigger major movement

### What the UI shows
- Weather summary line in the tactical paragraph
- Wind quality rating ("Marginal — thermals will dominate midday")
- Front arrival warning if one is approaching

Without GPS in the image, weather is skipped and the AI uses your manually entered wind + temp only.

---

## 12. Hunt Styles Explained

Each style reshapes the AI's recommendations:

### Archery
- **Primary setup type**: tree stand or saddle, 15-25 yards from travel
- **Emphasis**: wind, scent control, drop-zone visibility, shot angle
- **Avoid zones**: prioritized for wind failures
- **Approach paths**: matters more than rifle (longer sneak-in)

### Rifle
- **Primary setup type**: elevated platform with 100-300 yd sight lines
- **Emphasis**: glassing lanes, shooting lanes, beanfield corners
- **Avoid zones**: less critical (wind forgiving at range)

### Blind
- **Primary setup type**: fixed ground blind
- **Emphasis**: cover from all directions, brushed-in timing, concealed entry
- **Avoid zones**: spots with no natural cover

### Saddle
- **Primary setup type**: multi-tree options
- **Emphasis**: climbing-friendly trunks, setup fluidity, wind-driven re-locates
- **Note**: recommendations often include 2-3 trees per setup

### Public land
- **Primary setup type**: back-country spots, 1+ mile from access
- **Emphasis**: pressure avoidance, less-trafficked access routes
- **Red zones**: expanded around trails, parking, easy terrain

### Spot-and-stalk
- **Primary setup type**: glassing knobs + stalking routes
- **Emphasis**: vantage points, wind-aware approach lines, bedding areas to avoid spooking
- **No fixed stands** — everything is mobile

---

## 13. Tips for Best Results

### Get good images
- Use **satellite-hybrid** layers, zoom 14-17
- Include **1000+ yards** of context around your hunt area
- Screenshot at the **time of day's light** if you have afternoon vs morning images
- Capture **multiple seasons** for the same property and compare (Pro tier)

### Set honest conditions
- Don't guess on wind — use the hourly forecast for your hunt window
- Temperature matters more than you think for early season vs late season
- Get the region right — "MW-US" vs "SE-US" changes assumptions about corn harvest, rut timing

### Read the assumptions section
- The AI is confident, but it's guessing when it can't see something
- **Every assumption is a scouting task** — confirm it before you trust the setup

### Use edit mode
- If you know a spot is wrong, move it immediately — the AI learns nothing from you not editing
- Your edited overlays are what shows up in history next time

### Reanalyze on new conditions
- Same property, different wind → new analysis gives new setups
- Don't reuse last week's setups when wind flipped — rerun it

---

## 14. Troubleshooting

### "Google sign-in failed (10)"
- Your email isn't on the Google test users list OR Google Cloud Console config is incomplete. Contact support.

### "Network request failed"
- Your phone can't reach our backend. Common causes:
   - Flight mode on / airplane mode on
   - Cellular data disabled for Raven Scout (iOS: Settings → Cellular → Raven Scout → ON)
   - VPN interfering
- Retry on Wi-Fi

### "Could not save hunt"
- Cloud sync failed but your hunt is stored locally
- Check connection, retry the analysis if needed
- Your hunt is NOT lost — it's in your device's local history

### Results bounce back to home after analysis
- Your phone ran out of memory on a very large image
- Close all other apps, then retry
- If persistent, crop your image smaller before uploading

### Overlays in wrong spots
- Use EDIT mode to move them
- Next time, provide a clearer image at the same zoom level

### Weather section is missing
- Your image didn't have GPS. Use the in-app **Open Map View → CAPTURE AREA** workflow to include GPS.

### Analysis stuck on "ANALYZING TERRAIN" forever
- Our AI provider may be slow — wait up to 90 seconds
- If still stuck after 2 minutes, force-close the app and try again. You won't be double-charged — only completed analyses count.

---

## 15. Privacy and Data

### What we store
- Your Google email + display name + profile picture (for account)
- Your hunt metadata: species, date, time, wind, region, GPS (if provided)
- Your map images (stored on AWS S3, Pro tier on native builds only)
- The AI's analysis output
- Your usage counter (for tier enforcement)

### What we DON'T store
- Your Google password (we never see it — OAuth flow)
- Your contacts, call log, messages, or anything outside the app
- Your precise location when the app is closed
- Your real-time GPS stream

### Who sees your data
- Only you. Hunts are scoped to your user_id and nobody else can read them.
- Our admin tools can see aggregate usage stats (analyses/month) but not the image contents.

### Deleting your data
- Delete individual hunts via the history screen swipe
- To delete your entire account: email **support@ravenscout.app** (or in-app Settings → Delete Account when available)

---

## 16. FAQ

**Q: Does this work offline?**
A: No. AI analysis requires our cloud. History is viewable offline for hunts you've already analyzed.

**Q: Can I share a hunt with a buddy?**
A: Not yet — planned feature.

**Q: Does the AI learn from my edits?**
A: Not currently. Each analysis is independent. We're exploring personalized models for Pro users.

**Q: Can I use this for elk / bear / waterfowl?**
A: Whitetail, turkey, and hog are officially supported today. Others in roadmap.

**Q: What happens at monthly reset?**
A: Your counter zeros out on the 1st of the month in UTC. Unused analyses don't carry over.

**Q: Can I use the same hunt for multiple days?**
A: Each day's wind / weather changes the recommendation. Rerun the analysis if conditions change materially.

**Q: How accurate is the GPS?**
A: When you use **Open Map View → CAPTURE AREA**, GPS is embedded from your phone's current location at that moment. Accurate to ~5 meters on modern phones.

**Q: What's the difference between wind "NW" and "from the NW"?**
A: We use meteorological convention: "NW wind" = wind BLOWING FROM the NW (toward the SE). So a NW wind at your face means you're facing NW.

**Q: My Pro tier ran out mid-season. Will you throttle me?**
A: After 100 analyses in a month, you'll need to wait for the 1st or contact support for a one-time bump. We'd rather have you happy than rate-limited.

---

## Questions or Feedback?

Email: **support@ravenscout.app**

Built by Asgard Solutions. Happy hunting.
