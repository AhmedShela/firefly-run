# Firefly Run — app project

This folder turns the Firefly Run web game into real iOS and Android apps using
[Capacitor](https://capacitorjs.com). The game itself lives in `www/index.html`;
Capacitor wraps it in a native shell you can submit to the App Store and Google Play.

```
firefly-run/
├── www/index.html          the game
├── assets/                 app icon + splash source images (1024px / 2732px)
├── capacitor.config.json   app name, bundle ID, colors
└── package.json            dependencies and helper scripts
```

---

## 0. Before you start

| You need | For | Cost |
|---|---|---|
| [Node.js](https://nodejs.org) 20 or newer | both | free |
| [Android Studio](https://developer.android.com/studio) | Android | free |
| A **Mac** with [Xcode](https://apps.apple.com/app/xcode/id497799835) | iOS (no way around this, Apple requires it) | free |
| [Google Play Console](https://play.google.com/console/signup) account | publishing on Android | $25 one-time |
| [Apple Developer Program](https://developer.apple.com/programs/) membership | publishing on iOS | about $99 / year |

Check both stores' sign-up pages for current prices before you pay.

**Change the app ID first.** Open `capacitor.config.json` and replace
`com.example.fireflyrun` with something unique to you, e.g. `com.yourname.fireflyrun`.
Stores reject `com.example.*`, and the ID can never change after you publish.

---

## 1. Set up the project (once)

Open a terminal in this folder:

```bash
npm install
npx cap add android
npx cap add ios          # Mac only
npm run icons            # generates every icon + splash size from assets/
npx cap sync
```

## 2. Try it on your phone

**Android:** `npm run android` opens Android Studio. Plug in your phone with USB
debugging on (Settings → About phone → tap *Build number* 7 times → Developer options),
pick it in the device menu, and press ▶ Run.

**iPhone:** `npm run ios` opens Xcode. Select the *App* target → *Signing & Capabilities*,
choose your Apple ID as the Team, plug in your iPhone, and press ▶ Run.

Whenever you change `www/index.html`, run `npx cap sync` and press Run again.

## 3. Publish to Google Play

1. In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle**.
   Create a new keystore when asked. **Back it up and keep the password** — losing it
   means you can never update the app.
2. In [Play Console](https://play.google.com/console): *Create app* → fill in name,
   language, "Game", "Free".
3. Complete the setup checklist: privacy policy URL, content rating questionnaire,
   target audience, data safety form (Firefly Run collects no data; the best score
   stays on the device), store listing (description, icon, at least 2 screenshots,
   a 1024×500 feature graphic).
4. **New personal accounts must run a closed test first**: upload the `.aab` to a
   closed testing track and get at least 12 testers opted in for 14 days in a row
   before you can apply for production. Recruit a few extra in case people drop out.
5. Then promote the build to *Production* and submit for review.

## 4. Publish to the App Store

1. Enroll in the Apple Developer Program and sign in to Xcode with that account.
2. Create the app in [App Store Connect](https://appstoreconnect.apple.com) → *My Apps* → **+**,
   using the same bundle ID as `capacitor.config.json`.
3. In Xcode, set the version (1.0) and build number (1), choose *Any iOS Device*, then
   **Product → Archive → Distribute App → App Store Connect → Upload**.
4. Back in App Store Connect: add screenshots (6.7" and 6.5" iPhone sizes at minimum),
   description, keywords, support URL, privacy policy URL, age rating, and mark
   "Data Not Collected" in App Privacy.
5. Select the uploaded build and **Submit for Review**. Reviews usually take a day or two.
   You can also share it first with friends through **TestFlight**.

---

## Tips for passing review

- **Apple guideline 4.2 (minimum functionality)** rejects apps that feel like a thin
  website wrapper. Firefly Run runs fully offline as a native game, which helps, but
  adding sound, haptics, or Game Center leaderboards makes approval more likely.
- **Fonts:** the game loads two Google Fonts when online and falls back to system
  fonts offline. To make it look identical offline, download the font files into
  `www/` and swap the `<link>` for `@font-face` rules.
- **Privacy policy:** both stores require a URL even for apps that collect nothing.
  A one-paragraph page saying "Firefly Run collects no personal data" is enough.
