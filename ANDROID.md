# Legends of the Lost World — Android packaging

This build is a Three.js + React web game. `npm run build` produces a single file, `dist/index.html`, plus `dist/images/`. It runs fully offline once loaded.

## Option A: Play in an Android browser
Host `dist/` on any static server and open it in Chrome on Android, in landscape. On first launch the game asks for fullscreen and tries to lock the screen to landscape.

## Option B: Build an APK with Capacitor (debug and release)
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Legends of the Lost World" com.lostworld.legends --web-dir=dist
npm run build && npx cap add android && npx cap sync android
```
In `android/app/src/main/AndroidManifest.xml`, set `android:screenOrientation="sensorLandscape"` on the main activity. Add no extra permissions; the game needs none.

Then:
- Debug APK: `cd android && ./gradlew assembleDebug` (output: `app/build/outputs/apk/debug/`)
- Release bundle: create a keystore, configure `signingConfigs` in `app/build.gradle`, then run `./gradlew bundleRelease`
- Minimum SDK 23 (Android 6.0) and target the current SDK. WebView needs WebGL, which every 64-bit device ships with.

Saves are stored in WebView localStorage and persist across app restarts. The Android back button is handled through browser history and closes menus or opens the pause menu.
