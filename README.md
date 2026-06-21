# 🏠 Home Inventory Tracker

A web app for tracking food supplies (pantry, fridge, freezer) and personal care products (detergents, skincare, hygiene), with expiration tracking and post-opening usage duration monitoring.

Born out of a practical need: avoiding duplicate grocery purchases or expired products forgotten at the back of the fridge.

## Features

**Food**
- Drill-down navigation: Location (Pantry/Fridge/Freezer) → Category → Products, instead of dumping everything on screen at once
- Expiration tracking with visual alerts (expired / expiring within 7 days / ok)
- Clickable stat cards that jump straight to expired or soon-to-expire products
- Doughnut chart showing quantity by location + category, with grouped legend
- Free text search that bypasses the drill-down navigation
- Quick quantity adjustment (±unit) directly from the product card

**Personal care**
- Purchase date and opening date tracking
- Automatic remaining shelf-life calculation based on declared PAO (Period After Opening)
- Organization by category (detergents, shampoo/shower gel, facial skincare, body, hygiene)

**General**
- Export/import data as JSON for backup
- Color-coded categories, consistent between cards and chart

## Stack

- Vanilla HTML, CSS, JavaScript — no framework, no build step
- [Chart.js](https://www.chartjs.org/) for the doughnut chart (bundled locally in `lib/`, no CDN dependency)
- Browser `localStorage` for data persistence — no backend, no database

## Usage

No installation required.

```bash
git clone https://github.com/<your-username>/home-inventory-tracker.git
cd home-inventory-tracker
```

Open `index.html` in your browser (recommended: VS Code's **Live Server** extension to avoid browser restrictions on local files).

## A note on data

Data is stored in the browser's `localStorage`, **not** in the code itself. This means:
- Data is tied to the specific device/browser you open the app from
- Opening the app from two different devices (or two different browsers) results in two independent, unsynced inventories
- Use the **Export backup** button to save a `.json` safety file, importable at any time via **Import backup**

## Project structure

```
home-inventory-tracker/
├── index.html
├── app.js
└── lib/
    └── chart.umd.js
```

## Possible future improvements

- [ ] Cross-device data sync (e.g. lightweight backend + database)
- [ ] Notifications for soon-to-expire products
- [ ] Automatic shopping list generation based on minimum stock thresholds

---

Personal project, built iteratively for household use.