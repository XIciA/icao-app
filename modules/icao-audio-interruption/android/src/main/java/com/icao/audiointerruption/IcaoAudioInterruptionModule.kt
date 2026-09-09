package com.icao.audiointerruption

import android.annotation.TargetApi
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor

public class IcaoAudioInterruptionModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var generation = 0L
  private var observing = false
  private var detachListener: (() -> Unit)? = null
  private var poll: Runnable? = null
  private var modes = TelephonyModeObservation()

  override fun definition() = ModuleDefinition {
    Name("IcaoAudioInterruption")
    Events("interruption")
    OnStartObserving { handler.post { startObserving() } }
    OnStopObserving { handler.post { stopObserving() } }
    OnDestroy { handler.post { stopObserving() } }
  }

  private fun startObserving() {
    stopObserving()
    val manager = appContext.reactContext?.applicationContext
      ?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    observing = true
    val owner = generation
    val onMode: (Int) -> Unit = { mode ->
      if (observing && generation == owner) {
        modes.observe(mode)?.let { phase ->
          // The existing JS study audio owner checks that playback was active
          // and controls pause/replay. This module never owns audio focus.
          sendEvent("interruption", mapOf("phase" to phase, "isCall" to true))
        }
      }
    }
    val readMode = {
      // A failed read is not evidence that a call ended.
      runCatching { manager.mode }.getOrNull()?.let(onMode)
      Unit
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      detachListener = runCatching {
        Api31.observe(manager, Executor { command -> handler.post(command) }, onMode)
      }.getOrNull()
    }
    readMode()
    if (detachListener == null) {
      // API 24–30 has no public mode-change listener. Observe only while the
      // existing study player subscribes; no background service or phone API.
      poll = object : Runnable {
        override fun run() {
          if (!observing || generation != owner) return
          readMode()
          handler.postDelayed(this, 250L)
        }
      }.also { handler.postDelayed(it, 250L) }
    }
  }

  private fun stopObserving() {
    observing = false
    generation += 1
    poll?.let(handler::removeCallbacks)
    poll = null
    detachListener?.let { runCatching(it) }
    detachListener = null
    modes = TelephonyModeObservation()
  }

  // Keep API 31 listener types out of the module's fields/signatures so API 24
  // devices can load the module before the SDK guard selects the legacy path.
  @TargetApi(Build.VERSION_CODES.S)
  private object Api31 {
    fun observe(manager: AudioManager, executor: Executor, onMode: (Int) -> Unit): () -> Unit {
      val listener = AudioManager.OnModeChangedListener { mode -> onMode(mode) }
      manager.addOnModeChangedListener(executor, listener)
      return { manager.removeOnModeChangedListener(listener) }
    }
  }
}
