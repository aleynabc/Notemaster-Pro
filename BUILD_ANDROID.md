# Android APK Oluşturma Rehberi

Bu uygulama, web teknolojilerini (React + Vite) Android uygulamasına dönüştürmek için **Capacitor** kullanmaktadır.

## Gereksinimler

1.  **Node.js & NPM:** Bilgisayarınızda yüklü olmalıdır.
2.  **Android Studio:** Android SDK ve Gradle için gereklidir.
3.  **Java Development Kit (JDK):** Sürüm 17 veya üzeri önerilir.

## APK Oluşturma Adımları

### 1. Projeyi Derleyin
Önce web projesini derleyin:
```bash
npm run build
```

### 2. Capacitor ile Senkronize Edin
Web çıktılarını Android projesine aktarın:
```bash
npx cap sync
```

### 3. Android Studio ile Açın
Projeyi Android Studio'da açarak görsel olarak düzenleyebilir veya derleyebilirsiniz:
```bash
npx cap open android
```

### 4. Komut Satırından APK Oluşturun (Hızlı Yöntem)
Android Studio'yu açmadan direkt APK almak için:
```bash
cd android
./gradlew assembleDebug
```
Derleme bittiğinde APK dosyanız şu konumda olacaktır:
`android/app/build/outputs/apk/debug/app-debug.apk`

## İkon ve Logo Değiştirme

Uygulama ikonlarını değiştirmek için `android/app/src/main/res/` klasöründeki `mipmap` klasörlerini kullanabilirsiniz. 
Sizin sağladığınız ikonlar şu an `android/app/src/main/res/` ana dizininde bulunmaktadır. Bunları uygun boyutlarda `mipmap` klasörlerine dağıtmanız veya aşağıdaki aracı kullanmanız önerilir:

```bash
npm install -g @capacitor/assets
npx capacitor-assets generate --android
```

## İpucu
Eğer uygulamayı gerçek bir cihazda test etmek isterseniz, cihazınızı USB ile bağlayıp Android Studio üzerinden "Run" butonuna basmanız yeterlidir.
