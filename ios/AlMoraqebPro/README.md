# AlMoraqebPro for iPhone (native SwiftUI starter)

Native iOS 16+ employee login and attendance/departure interface, reusing existing production API and GPS + Face ID / Touch ID checks. No Android changes.

## Build
Requires macOS with Xcode and XcodeGen. From this directory run `xcodegen generate`, open `AlMoraqebPro.xcodeproj`, select a development team and a real iPhone, then build and run.

## Before release
This is **source code, not an IPA or App Store build**. Device binding, challenge/token security contract, production clock-in behavior, notifications, background tracking, offline support, and on-device QA must be verified. iOS biometric success cannot be independently verified by the server from a random token; a cryptographic device attestation / challenge signing design is needed before treating this as production-grade biometric proof.
