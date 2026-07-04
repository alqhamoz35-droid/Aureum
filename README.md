# Daily Command

A premium dark-glassmorphism daily task planner with gold & white accents.

## Files
- `index.html` — Structure (auth, dashboard, settings)
- `style.css` — Design system (dark glassmorphism, gold accents)
- `script.js` — All logic (local auth, task scheduling, settings)

## Features
1. **Local Auth** — Email + phone signup, password login (SHA-256 hashed, stored in localStorage)
2. **Settings Dashboard** — Update profile picture, name, phone, and password
3. **Profile Branding** — Gold-bordered avatar + name in the header
4. **Dynamic Scheduling** — Pick any day; the app first asks *"What time do you plan to start your day?"* before letting you add tasks (no forced defaults)
5. **Custom Tasks** — Add tasks with individual times; check them off to strike through and update the progress bar in real time
6. **Responsive UI** — Grid layout collapses cleanly on mobile

## How to run
Just open `index.html` in any modern browser. All data is stored in the browser's `localStorage`.
