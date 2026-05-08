# Android Verification

SplitClub is configured as an Expo SDK 55 React Native app for Android and web. The Android package id is `com.splitclub.app`.

## Version Policy

Use the latest stable Expo SDK package set and keep native dependencies aligned with `expo install --check`.

As of May 8, 2026:

- Expo SDK 55 is the current stable SDK in this repo.
- Expo SDK 55 targets React Native 0.83 and React 19.2.
- Tamagui v2 is used through the current `2.0.0-rc` release line.
- Some npm packages publish newer standalone versions before Expo validates them for the SDK; those should not be forced into the app until Expo marks them compatible or the app moves to the next stable SDK.

## Required Local Tools

Install these before running a native Android build:

- JDK 17 or newer.
- Android Studio or Android command-line tools.
- Android SDK platform for API 36.
- Android emulator image or a physical Android device with USB debugging.

Expected commands on the path:

```sh
java -version
javac -version
adb version
emulator -version
sdkmanager --version
```

## Verification Commands

Run the checks in this order:

```sh
bun install
bun run android:doctor
bunx expo install --check
bun run typecheck
bun test
bunx expo export --platform web
bun run android:prebuild
bun run android:run
```

Use `bun run android:dev` only when intentionally starting an Expo development server for an attached Android target. Use `bun run android:run` for the native development build workflow.

## CI Verification

`.github/workflows/ci.yml` verifies pull requests and `main` pushes with:

- Web/domain checks: Bun install, Expo dependency alignment, TypeScript, Bun tests, and Expo web export.
- Android debug build: Node 24, Bun latest, Temurin Java 21, Android SDK setup, Expo dependency alignment, Expo Android prebuild with `--no-install`, and `./gradlew assembleDebug`.

Action releases verified on May 8, 2026:

- `actions/checkout@v6.0.2`
- `actions/setup-node@v6.4.0`
- `oven-sh/setup-bun@v2.2.0`
- `actions/setup-java@v5.2.0`
- `android-actions/setup-android@v4.0.1`

## Current Local Result

The Expo project health check passes with `18/18 checks passed`.

Native Android execution is currently blocked on this workstation because Java is not installed:

- `emulator` is missing.
- `java` and `javac` cannot find a Java Runtime.
- `sdkmanager` is present but cannot run without Java.
- `adb` is installed at `/opt/homebrew/bin/adb`.
- `ANDROID_HOME` points at `/Users/kishan/Library/Android/sdk`, and the SDK path exists.

`bun run android:run` and local Gradle builds should be retried after installing a Java runtime and exposing the Android emulator binary on `PATH`.

Once those tools are installed, rerun the verification commands above and capture the device or emulator smoke result.
