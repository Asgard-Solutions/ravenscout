# Raven Scout — Common Error Messages

### "Couldn't reach our servers — try again when you have signal."
The app can't reach `api.ravenscout.app`. Fix: switch to Wi-Fi or move to better cell coverage. Offline viewing of already-saved hunts still works.

### "Analysis failed — the map may be too zoomed out. Try a tighter crop."
The AI returned low-confidence output or couldn't find terrain features. Re-crop the map to 0.5–2 square miles, make sure terrain is visible (trees / water / roads), and re-run.

### "You've hit your monthly analysis limit."
Your tier's monthly AI-analysis quota is used up. Trial = 3 lifetime. Core = 10 / month. Pro = unlimited. Upgrade under **Profile → Subscription**, or wait for next month's reset (the 1st of the month, account-local).

### "This hunt wasn't backed up — you're offline."
You finished an analysis while offline (or Wi-Fi dropped mid-save). The hunt is stored on your device and will **auto-sync to the cloud on next launch**. No action required.

### "Some images couldn't upload — they're still on this device."
Pro cloud backup partially failed. The primary is safe locally; the cloud-sync retry runs the next time the app launches on signal. If it persists, go to **Profile → Cloud Storage → Re-sync now**.

### "Location permission is disabled."
Raven Scout can't auto-fill GPS or fetch weather. Enable **Location** in your device settings (While Using the App is fine) or enter coordinates manually on the hunt's Where step.

### "Invalid coordinates."
You typed a lat / lon that's out of range. Lat must be −90 to 90, Lon must be −180 to 180. Decimal degrees only (e.g. `31.523`, `-94.871`). The app also accepts a single string like `31.523, -94.871`.

### "This map is too large (>10 MB)."
Map imagery is capped at 10 MB per image (post-compression). Fix: reduce the source image size, screenshot a smaller area, or use the interactive map instead.

### "Could not verify your purchase."
RevenueCat couldn't read your App Store / Play Store receipt. Force-close the app, relaunch, then **Profile → Subscription → Restore Purchases**. If still stuck, email support with your receipt number.

### "Password reset code expired."
Codes are valid for 10 minutes. Tap **Resend code** and try again.

### "Too many failed attempts — try again in 15 minutes."
Anti-abuse lockout on password reset. Wait it out. If you truly can't access the account, email **support@asgardsolution.io**.

### "Storage full — hunt saved but some images could not be kept."
Your device is near full. The written analysis + overlays are saved; image bytes dropped. Free up space and re-sync from cloud (Pro) or re-run the analysis (Core / Trial).

### "Analysis took longer than expected. Tap to retry."
The AI request exceeded our 90-second budget. Usually transient. Tap retry; if it happens twice in a row, try a tighter map crop or a single image instead of four.

### "Session expired. Please sign in again."
Your auth token expired (90 days of inactivity). Sign back in — your saved hunts are preserved.

### Contact Support
Still stuck? Email **support@asgardsolution.io** with:
- Device model + OS version
- App version (Profile → About)
- What you tapped right before the error
- Error message text or screenshot
