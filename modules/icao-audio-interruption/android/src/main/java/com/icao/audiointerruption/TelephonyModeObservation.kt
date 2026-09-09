package com.icao.audiointerruption

/**
 * Read-only interpretation of Android's public AudioManager mode values.
 * IN_COMMUNICATION (3) is deliberately excluded: our own recorder/earpiece can
 * use it, and without phone permissions it cannot identify a third-party call.
 */
internal class TelephonyModeObservation {
  private var callActive = false

  fun observe(mode: Int): String? {
    // MODE_RINGTONE = 1, MODE_IN_CALL = 2, MODE_CALL_REDIRECT = 5 (API 33).
    // Literal public values keep this small state machine testable without an
    // Android runtime and do not reference API 33 fields on older devices.
    if (mode == 1 || mode == 2 || mode == 5) {
      if (callActive) return null
      callActive = true
      return "began"
    }
    // Only MODE_NORMAL proves that the observed telephony interval has ended.
    // Intermediate screening/communication/unknown modes cannot grant replay.
    if (mode == 0 && callActive) {
      callActive = false
      return "ended"
    }
    return null
  }
}
