# Dependency Audit - 2026-05-08

SplitClub is pinned to the latest Expo-compatible stack for the current Android/web target.

## Current Checks

- `bun outdated` reports newer registry versions for React, React DOM, React Native, AsyncStorage, react-native-svg, and TypeScript.
- `bunx expo install --check` reports the installed dependency set is correct for the installed Expo SDK.
- A trial patch update to `react@19.2.6`, `react-dom@19.2.6`, and `react-native-svg@15.15.4` was rejected by Expo compatibility checks, which expect `react@19.2.0`, `react-dom@19.2.0`, and `react-native-svg@15.15.3` for this SDK.

## Deferred Registry Latest Versions

| Package | Installed | Registry latest | Reason deferred |
| --- | ---: | ---: | --- |
| `@react-native-async-storage/async-storage` | `2.2.0` | `3.0.2` | Expo SDK compatibility expects the installed version. |
| `react` | `19.2.0` | `19.2.6` | Expo SDK compatibility expects `19.2.0`. |
| `react-dom` | `19.2.0` | `19.2.6` | Expo SDK compatibility expects `19.2.0`. |
| `react-native` | `0.83.6` | `0.85.3` | React Native version is controlled by Expo SDK compatibility. |
| `react-native-svg` | `15.15.3` | `15.15.4` | Expo SDK compatibility expects `15.15.3`. |
| `typescript` | `5.9.3` | `6.0.3` | Current Expo/React Native toolchain is validated on TypeScript 5.9.x. |

## Current Decision

Keep the package pins as-is until the Expo SDK advances its compatibility table. For SplitClub, "latest" means latest compatible for Android and web, not registry-latest versions that Expo warns may break the app.
