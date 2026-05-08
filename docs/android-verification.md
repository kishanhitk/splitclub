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

## Current Local Result

The Expo project health check passes with `18/18 checks passed`.

Native Android execution is currently blocked on this workstation because the required Android and Java tooling is not installed:

- `adb` is missing.
- `emulator` is missing.
- `sdkmanager` is missing.
- `java` and `javac` cannot find a Java Runtime.
- `ANDROID_HOME` points at `/Users/kishan/Library/Android/sdk`, but that SDK path does not exist.

`bun run android:run` currently exits with `Error: spawn adb ENOENT` after failing to resolve the Android SDK path.

Once those tools are installed, rerun the verification commands above and capture the device or emulator smoke result for `KIS-58`.
