# Pomodrone renderer

React + TypeScript renderer for the Pomodrone Electron shell.

## Scripts
- `npm run dev` – start Vite plus the Electron window.
- `npm run build` – compile the renderer to `dist/`.
- `npm start` – open Electron pointed at the built `dist/`.
- `npm run lint` – run ESLint.

Settings (durations, rounds, tick toggle) persist in `localStorage`. The placeholder app icon/logo lives at `public/logo-placeholder.jpg`—swap it with your own JPEG to brand the app.
