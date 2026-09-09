import ExpoModulesCore
import AVFoundation
import CallKit

private final class CallObservation: NSObject, CXCallObserverDelegate {
  var changed: ((Bool) -> Void)?
  func callObserver(_ observer: CXCallObserver, callChanged call: CXCall) {
    changed?(observer.calls.contains { !$0.hasEnded })
  }
}

public final class IcaoAudioInterruptionModule: Module {
  private var notification: NSObjectProtocol?
  private let calls = CXCallObserver()
  private let callObservation = CallObservation()
  private var interruptedByCall = false
  private var callActive = false
  private var audioInterrupted = false

  public func definition() -> ModuleDefinition {
    Name("IcaoAudioInterruption")
    Events("interruption")
    OnStartObserving { [weak self] in self?.observe() }
    OnStopObserving { [weak self] in self?.stopObserving() }
    OnDestroy { [weak self] in self?.stopObserving() }
  }

  private func observe() {
    stopObserving()
    callObservation.changed = { [weak self] active in
      guard let self else { return }
      self.callActive = active
      // A phone call alone is not a replay entitlement: playback must also
      // have received a real AVAudioSession interruption notification.
      if active && self.audioInterrupted {
        self.interruptedByCall = true
        self.sendEvent("interruption", ["phase": "began", "isCall": true])
      }
    }
    calls.setDelegate(callObservation, queue: .main)
    notification = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      if type == .began {
        self.audioInterrupted = true
        self.interruptedByCall = self.callActive || self.calls.calls.contains { !$0.hasEnded }
        self.sendEvent("interruption", ["phase": "began", "isCall": self.interruptedByCall])
      } else {
        self.sendEvent("interruption", ["phase": "ended", "isCall": self.interruptedByCall])
        self.interruptedByCall = false
        self.audioInterrupted = false
      }
    }
  }

  private func stopObserving() {
    if let notification { NotificationCenter.default.removeObserver(notification) }
    notification = nil
    calls.setDelegate(nil, queue: nil)
    callObservation.changed = nil
  }
}
