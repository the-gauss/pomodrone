## Pomodrone

React + Electron Pomodoro timer with a three-color minimalist UI and standard macOS chrome.

### Features
- Adjustable focus, short break, and long break durations plus rounds per cycle.
- Start/pause, skip to next stage, reset current stage, and reset everything to defaults.
- Tick sound + end chime toggle, persistent settings, and automatic cycling through sessions.
- Placeholder logo at `app/public/logo-placeholder.jpg`—replace with your own image to brand the app.

### Run it locally on macOS
1) `cd app`  
2) Install once: `npm install`  
3) Dev with Electron + Vite: `npm run dev` (opens an Electron window with default macOS traffic lights).  
4) Build renderer only: `npm run build` (outputs `dist/`).  
5) Load the built renderer in Electron: `npm start` (uses the latest `dist/`).  
6) Optional lint: `npm run lint`.

### Package a macOS release
1) `cd app`  
2) `npm run release:mac`  
3) The notarization-free DMG(s) land in `app/release/` (Apple will prompt on first launch since the binary isn't signed).

### Package a Windows release
1) `cd app`  
2) `npm run release:win`  
3) Setup EXEs for both x64 and ARM64 will be written to `app/release/`. The script can run on macOS (electron-builder downloads Wine/NSIS automatically) but will be faster on Windows.

Notes:
- The window uses the default macOS frame—no custom title bar.  
- Tick sounds may require one interaction (press Start) before the browser audio context is allowed to play.  
- Color palette is limited to background, accent, and text hues for a clean look.
