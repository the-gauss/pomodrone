# Pomodrone renderer

React + TypeScript renderer for the Pomodrone Electron shell.

## Scripts
- `npm run dev` – start Vite plus the Electron window.
- `npm run build` – compile the renderer to `dist/`.
- `npm start` – open Electron pointed at the built `dist/`.
- `npm run start:detached` – launch a local build in detached mode so the terminal can be closed.
- `npm run release:mac` – create macOS release artifacts (`.zip` + unpacked `.app`) in `release/`.
- `npm run launch:mac` – launch the packaged app bundle from `release/` without keeping terminal open.
- `npm run release:mac:launch` – build the macOS release and immediately launch it.
- `npm run lint` – run ESLint.

Settings (durations, rounds, tick toggle) persist in `localStorage`. The placeholder app icon/logo lives at `public/logo-placeholder.jpg`—swap it with your own JPEG to brand the app.
