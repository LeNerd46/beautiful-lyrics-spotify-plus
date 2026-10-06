# beautiful-lyrics-plus
Changes Spotify's default lyrics on mobile to something much more beautiful

Build with `npm run build` using JDK 21 and Android SDK Platform 35. Configure your SDK path in `src/native/local.properties` first. The build compiles the native Android extension in release mode and packages the APK beside `dist/index.js`. Commit the generated `dist/lyrics.apk` along with the JavaScript bundle when updating the marketplace repository; an empty placeholder APK cannot load on Android.
