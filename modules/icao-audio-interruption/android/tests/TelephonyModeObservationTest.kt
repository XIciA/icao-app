package com.icao.audiointerruption

/** Standalone JVM regression checks; no Android SDK or device is required. */
fun main() {
  fun events(vararg modes: Int): List<String> {
    val observer = TelephonyModeObservation()
    return modes.map(observer::observe).filterNotNull()
  }
  check(events(0, 0).isEmpty()) // Normal playback, including app foreground changes.
  check(events(0, 3, 3, 0).isEmpty()) // Own recording/earpiece is not a phone call.
  check(events(0, 4, 6, 7, -1, 0).isEmpty()) // No invented call from an unknown mode.
  check(events(0, 1, 1, 2, 2, 0, 0) == listOf("began", "ended")) // Answered call.
  check(events(0, 1, 0) == listOf("began", "ended")) // Declined incoming call.
  check(events(0, 2, 0) == listOf("began", "ended")) // Silent incoming/outgoing call.
  check(events(0, 5, 0) == listOf("began", "ended")) // Telephony audio redirection.
  check(events(1, 4, 3, -1, 2, 0) == listOf("began", "ended")) // No early replay.
  check(events(1, 0, 1, 0) == listOf("began", "ended", "began", "ended"))
  // A new question/observer cannot inherit a previous question's interrupted state.
  val old = TelephonyModeObservation()
  check(old.observe(2) == "began")
  check(TelephonyModeObservation().observe(0) == null)
  println("10 Android telephony mode regression checks passed")
}
