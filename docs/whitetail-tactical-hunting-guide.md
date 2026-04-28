# Whitetail Deer — Tactical Hunting Guide (Raven Scout Reference)

This guide compiles the tactical concepts Raven Scout's AI leans on when producing a whitetail analysis. Reading it helps you interpret the overlays and top-setup recommendations on your map. It is meant as a companion to the app's output, not a standalone scouting course.

---

## 1. The Three-Object Model
Every whitetail hunt breaks down into three spatial objects. Every overlay Raven Scout draws ultimately services one of them.

| Object | What it is | Overlay colors you'll see |
|---|---|---|
| **Bedding** | Thick interior cover where deer spend daytime | `#8D6E63` brown polygon |
| **Food** | Active mast, browse, ag crops, food plots | `#66BB6A` green polygon |
| **Corridor** | The path between bedding and food — funnels, draws, saddles, fence crossings | `#F57C00` orange polygon |

A stand only works if it intercepts a corridor between a known bedding area and a known food source, with the wind in your favor.

---

## 2. Seasonal Phase → Prompt Pack
Raven Scout's whitetail prompt pack adapts its recommendations to the seasonal phase. The four phases it models:

### A. Early Season (Sep 1 – Oct 15, approx.)
- Deer are on a **bed-to-food** pattern, predictable.
- Food drives everything: acorns dropping, soft mast (persimmon, apple), early ag (soybeans, alfalfa).
- Hunt **evenings** on the food side of the corridor.
- Key overlay: stand on the downwind edge of a food source, with the corridor exit in the shot window.

### B. Pre-Rut (Oct 15 – Nov 5)
- Bucks start making rubs and scrapes.
- Movement shifts from bed-to-food to **bed-to-does**.
- Hunt staging areas — secondary food sources on the downwind edge of doe bedding.
- Key overlay: stand on a pinch where doe-bedding corridors converge.

### C. Rut (Nov 5 – Nov 25)
- Bucks are on their feet all day, scent-trailing does.
- Wind still matters but less than corridor position.
- Hunt **all-day** from a stand on a doe-travel corridor — funnels, fence openings, creek crossings.
- Key overlay: stand on a hard terrain funnel — deer have no choice but to pass.

### D. Post-Rut / Late Season (Nov 25 – season close)
- Bucks are recovering, food-focused again, but pressure-sensitive.
- Hunt **afternoons** close to thick bedding, off the most-hunted food.
- Key overlay: stand close to bedding with an access route that never crosses a known trail.

---

## 3. Wind Reading — The Make-or-Break Variable
Deer work wind three ways: to smell food, to smell predators, and to smell other deer. Bed orientation is almost always with wind advantage.

### Rules Raven Scout applies
1. **Bedding polygons** get flagged as **avoid zones** on their windward edge — you cannot approach from that side without busting deer.
2. **Stand positions** must sit downwind (or crosswind, quartering away) from the expected travel corridor.
3. **Access routes** are drawn to keep your scent downwind of both bedding and expected travel — even if the access route looks longer, Raven Scout will pick the one that keeps wind integrity.
4. **Thermals** on slopes: warming thermals rise in the morning, cooling thermals fall in the evening. Stand selection factors morning vs evening thermals on any slope > ~5°.

---

## 4. Terrain Features the Model Recognizes
| Feature | What it looks like on imagery | How Raven Scout uses it |
|---|---|---|
| Ridge | Long linear high ground | Travel corridor along the lee side; bedding on points |
| Saddle | Low spot between two high points | Hard pinch — corridor overlay almost always passes here |
| Bench | Flat shelf mid-slope | Bedding candidate — especially on north-aspect benches |
| Draw | Small drainage dropping off a ridge | Food-to-bedding corridor, especially in mast years |
| Inside corner | Field edge that juts into timber | Stand location — covers two travel directions |
| Fence gap / gate | Visible gap in a fenceline | Hard pinch — nearly always corridor |
| Creek crossing | Shallow bend, gravel bar | Secondary pinch — good for rut |
| Clear-cut edge | Young regen against mature timber | Food + bedding combined — huge deer concentration |

---

## 5. Pressure and Access
Pressure kills more public-land hunts than bad stand sites. Raven Scout weights access quality on three axes:

1. **Road proximity** — stands within 200 yards of a road are flagged for morning thermal risk (scent drifting toward road-pressure).
2. **Parking obviousness** — if multiple roads / trailheads converge near your access, the model drops confidence on that setup and prefers a further-in backup.
3. **Entry sound** — dry leaves, gravel, water crossings — the model doesn't see these directly but assumes worst-case and flags access routes that require crossing visible creeks as *noisy access*.

---

## 6. Reading the Top Setups
A Raven Scout *top setup* is ranked 1–3 and includes six risk fields:

- **Wind risk** — whether the expected wind protects the stand.
- **Thermals risk** — slope-based morning/evening scent drift.
- **Pressure risk** — access obviousness and hunter density.
- **Entry strategy** — the specific approach path.
- **Exit strategy** — the specific departure path (often different from entry).
- **Best window** — the expected movement window for this stand.

If all three top setups share the same `wind_risk = high` value, the AI is telling you this map + wind combination doesn't have a great setup — consider a different wind day.

---

## 7. Trophy Classification (Reference — Boone & Crockett Style)
Raven Scout does not score your deer, but understanding score helps frame what "mature buck" means on the land you hunt.

### Typical (symmetrical rack)
- Gross score = sum of: main beam lengths + tine lengths + mass measurements + inside spread.
- Entry minimums: **170" B&C** for all-time book, **160" B&C** for awards.

### Non-Typical (irregular points count)
- Same base as typical, plus abnormal point length.
- Entry minimums: **195" B&C** all-time, **185" B&C** awards.

### Field-Age Rule of Thumb
- 1.5 yr old: short face, slender body, 4–6 pts.
- 2.5 yr: deeper chest, still racer-slim legs, 6–8 pts.
- 3.5 yr: muscled neck during rut, belly rounding.
- 4.5+ yr: heavy neck, sagging belly, blocky jaw — THIS is the mature-buck silhouette most hunters are targeting.

Setting a self-imposed age minimum (e.g. 3.5+) is how serious managers build age class on a property over 3–5 seasons.

---

## 8. Safety and Ethics Checklist
- Wear a harness. Every climb, every time.
- Let one person know your stand GPS and expected return time.
- Verify the shot window is at a legal angle and clear of other hunters / residences.
- Recover every animal you shoot — use a blood-tracking dog if available.
- Respect property lines — the avoid-zone overlay Raven Scout draws at posted boundaries is not a suggestion, it's legal separation.

---

For more app-specific guidance see **[Features Overview](raven-scout-features-overview.md)** and **[Getting Started](raven-scout-getting-started.md)**.
