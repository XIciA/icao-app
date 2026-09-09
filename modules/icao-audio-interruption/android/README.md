# Android interruption observation

This module passively observes `AudioManager` modes while the existing study
player has an event subscription. API 31+ uses `OnModeChangedListener`; API 24–30
queries `getMode()` every 250 ms during that subscription. Unsubscription removes
the listener/timer and rejects late callbacks from the previous subscription.

Only ringtone, telephony-call and telephony-redirection modes begin a call
interval. Communication mode is deliberately not a call detector: the App's own
recorder/earpiece can use it. Returning to normal ends the interval. Failed reads,
ordinary backgrounding and unknown modes do not manufacture a call. The existing
JS audio owner still checks interrupted playback and enforces one replay per
question; the observer never plays audio, requests focus or sets the audio mode.

No phone, call-log or background-service permission is added. Consequently,
third-party VoIP/OEM calls that never expose telephony mode cannot be reliably
identified. On API 24–30 an interval entirely between polling samples may also be
missed. These cases do not receive a fabricated replay entitlement.

API definitions: [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager).

The small state-machine checks run on the JVM without an Android SDK:

```sh
kotlinc src/main/java/com/icao/audiointerruption/TelephonyModeObservation.kt tests/TelephonyModeObservationTest.kt -include-runtime -d /tmp/icao-call-mode-tests.jar
java -jar /tmp/icao-call-mode-tests.jar
```

The App's `exam-audio-native-test.tsx` separately covers automatic playback,
ordinary background resume, one call replay, and recording exclusion. Neither
test substitutes for an Android device call check.
