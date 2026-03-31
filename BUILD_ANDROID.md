Android APK Build Guide
This application uses Capacitor to transform web technologies (React + Vite) into a native Android application.

Prerequisites
Node.js & NPM: Must be installed on your system.

Android Studio: Required for Android SDK and Gradle.

Java Development Kit (JDK): Version 17 or higher is recommended.

Steps to Generate APK
1. Build the Project
First, compile the web project:

Bash
npm run build
2. Sync with Capacitor
Copy the web assets to the Android project:

Bash
npx cap sync
3. Open with Android Studio
You can open the project in Android Studio to edit or build visually:

Bash
npx cap open android
4. Build APK via Command Line (Fast Method)
To generate the APK directly without opening Android Studio:

Bash
cd android
./gradlew assembleDebug
Once the build is complete, your APK file will be located at:
android/app/build/outputs/apk/debug/app-debug.apk

Changing Icons and Logos
To change application icons, use the mipmap folders located in android/app/src/main/res/. Your current icons are in the android/app/src/main/res/ root directory. It is recommended to distribute them into the appropriate mipmap folders or use the following asset tool:

Bash
npm install -g @capacitor/assets
npx capacitor-assets generate --android
Pro Tip 💡
If you want to test the application on a physical device, simply connect your device via USB and click the "Run" button in Android Studio.
