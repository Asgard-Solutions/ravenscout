# Raven Scout — Common Error Messages

### "Couldn't reach our servers — try again when you have signal."
The app can't reach the Raven Scout backend. Fix: switch to Wi-Fi or move to better cell coverage. Offline viewing of already-saved hunts still works.

### "Analysis failed — the map may be too zoomed out. Try a tighter crop."
The AI returned low-confidence output or couldn't find terrain features. Re-crop the map to 0.5–2 square miles, make sure terrain is visible (trees / water / roads), and re-run.

### "You've hit your analysis limit."
Your tier's analysis quota is used up:
- Trial: 3 lifetime.
- Core: 10 / month (with 1-cycle rollover).
- Pro: 40 / month (with up to 12-cycle rollover).

Upgrade under **Profile → Subscription**, buy an Extra Analytics pack (+5 / +10 / +15), or wait for the next monthly reset (paid tiers).

### "This hunt wasn't backed up — you're offline."
You finished an analysis while offline (or Wi-Fi dropped mid-save). The hunt is stored on your device and will **auto-sync to the cloud on next launch**. No action required.

### "Some images couldn't upload — they're still on this device."
Pro cloud backup partially failed. The primary is safe locally; the cloud-sync retry runs the next time the app launches on signal.

### "Location permission is disabled."
Raven Scout can't auto-fill GPS or fetch weather (Core / Pro). Enable **Location** in your device settings (While Using the App is fine) or enter coordinates manually on the hunt's Conditions step.

### "Invalid coordinates."
You typed a lat / lon that's out of range. Lat must be −90 to 90, Lon must be −180 to 180. Decimal degrees only (e.g. `31.523`, `-94.871`). The app also accepts a single string like `31.523, -94.871`.

### "Could not verify your purchase."
RevenueCat couldn't read your App Store / Play Store receipt. Force-close the app, relaunch, then **Profile → Subscription → Restore Purchases**. If still stuck, email support with your receipt number.

### "Code expired. Request a new one."
Password-reset and email-verification codes are valid for 15 minutes. Tap **Resend code** and try again. Requesting a new code automatically invalidates the old one.

### "Too many attempts. Request a new code."
Five failed code-entry attempts on a single password-reset code → that code is burned. Request a fresh code and start over.

### "Storage full — hunt saved but some images could not be kept."
Your device is near full. The written analysis + overlays are saved; image bytes dropped. Free up space and re-sync from cloud (Pro) or re-run the analysis (Core / Trial).

### "Analysis took longer than expected. Tap to retry."
The AI request exceeded our timeout budget. Usually transient. Tap retry; if it happens twice in a row, try a tighter map crop or a single image instead of multiple.

### "Session expired. Please sign in again."
Your auth token expired. Sessions are valid for 7 days from the last refresh — sign back in. Your saved hunts are preserved.

### Contact Support
Still stuck? Email **support@asgardsolution.io** with:
- Device model + OS version
- App version (Profile → About)
- What you tapped right before the error
- Error message text or screenshot
