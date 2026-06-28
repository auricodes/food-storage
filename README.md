# 🏠 Home Inventory Tracker

A web app for tracking food supplies (pantry, fridge, freezer) and personal care products (detergents, skincare, hygiene), with expiration tracking, post-opening usage duration monitoring, and a shared shopping list — synced across devices.

Born out of a practical need: avoiding duplicate grocery purchases or expired products forgotten at the back of the fridge, and letting two people manage the same household inventory from their own devices.

## Features

**Food**
- Drill-down navigation: Location (Pantry/Fridge/Freezer/Freezer below) → Category → Products, instead of dumping everything on screen at once
- Expiration tracking with visual alerts (expired / expiring within 7 days / ok)
- Clickable stat cards that jump straight to expired or soon-to-expire products
- Doughnut chart showing quantity by location + category, with grouped legend
- Free text search that bypasses the drill-down navigation
- Quick quantity adjustment (±unit) directly from the product card

**Personal care**
- Drill-down navigation: Macro-category (Detergents & Cleaning / Personal care) → Category (Skincare, Body, Hygiene, Hair, under Personal care) → Products
- Quantity tracking and optional location tag (Bathroom/Kitchen/Balcony)
- Purchase date and opening date tracking
- Automatic remaining shelf-life calculation based on declared PAO (Period After Opening)
- Dedicated doughnut chart with its own color palette

**Shopping list**
- Always-visible note-style list for jotting down what's run out (e.g. "zucchini")
- Check items off without deleting them; remove manually when done
- Synced with everyone using the app

**General**
- Color-coded categories, consistent between cards and charts
- Export/import data as JSON for backup
- Responsive layout, tuned for both desktop and mobile use

## Stack

- Vanilla HTML, CSS, JavaScript — no framework, no build step
- [Chart.js](https://www.chartjs.org/) for the doughnut charts (bundled locally in `lib/`, no CDN dependency)
- [Supabase](https://supabase.com/) (hosted Postgres) for shared, cross-device data storage

## Usage

No installation required.

```bash
git clone https://github.com/<your-username>/food-storage.git
cd food-storage
```

Open `index.html` in your browser (recommended: VS Code's **Live Server** extension — opening the file directly via double-click breaks script loading and is not supported).

## Data & sync

Unlike a typical static front-end demo, this app's data lives in a shared Supabase database, not in the browser. This means:
- Anyone with access to the app (and its Supabase credentials, embedded in `app.js`) sees and edits the same data, from any device
- There's no login system — access control relies on the Supabase URL/key not being shared outside the intended household
- Use the **Export backup** button anytime to save a `.json` safety copy locally, importable later via **Import backup**

## Project structure

```
food-storage/
├── index.html
├── app.js
└── lib/
    └── chart.umd.js
```

## Possible future improvements

- [ ] Real-time sync (live updates without needing to refresh)
- [ ] User authentication for proper access control
- [ ] Notifications for soon-to-expire products
- [ ] Automatic shopping list generation based on minimum stock thresholds
- [ ] Bubu section (pet supplies: food, hygiene, toys) with opening-date tracking

---

Personal project, built iteratively for household use.