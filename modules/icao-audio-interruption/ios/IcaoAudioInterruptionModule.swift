import ExpoModulesCore
import AVFoundation

/** Notification bridge only: playback owners decide whether/when to resume. */
public final class IcaoAudioInterruptionModule: Module {
  private var notification: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("IcaoAudioInterruption")
    Events("interruption")
    OnStartObserving { [weak self] in self?.observe() }
    OnStopObserving { [weak self] in self?.stopObserving() }
    OnDestroy { [weak self] in self?.stopObserving() }
  }

  private func observe() {
    stopObserving()
    notification = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      self.sendEvent("interruption", ["phase": type == .began ? "began" : "ended"])
    }
  }

  private func stopObserving() {
    if let notification { NotificationCenter.default.removeObserver(notification) }
    notification = nil
  }
}
