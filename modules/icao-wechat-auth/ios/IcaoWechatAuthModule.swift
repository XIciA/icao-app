import ExpoModulesCore
import UIKit
import WechatOpenSDK

private let wechatAppIdKey = "ICAOWechatAppId"
private let wechatUniversalLinkKey = "ICAOWechatUniversalLink"
private let authorizationTimeoutSeconds: TimeInterval = 240

final class IcaoWechatAuthCoordinator: NSObject, WXApiDelegate {
  static let shared = IcaoWechatAuthCoordinator()

  private struct PendingAuthorization {
    let state: String
    let promise: Promise
    let timeout: DispatchWorkItem
  }

  private var pending: PendingAuthorization?

  var configuration: (appId: String, universalLink: String)? {
    guard
      let appId = Bundle.main.object(forInfoDictionaryKey: wechatAppIdKey) as? String,
      let universalLink = Bundle.main.object(forInfoDictionaryKey: wechatUniversalLinkKey) as? String,
      !appId.isEmpty,
      !universalLink.isEmpty
    else { return nil }
    return (appId, universalLink)
  }

  func register() -> Bool {
    guard let configuration else { return false }
    return WXApi.registerApp(configuration.appId, universalLink: configuration.universalLink)
  }

  func authorize(state: String, promise: Promise) {
    DispatchQueue.main.async { [weak self] in
      self?.authorizeOnMain(state: state, promise: promise)
    }
  }

  private func authorizeOnMain(state: String, promise: Promise) {
    guard configuration != nil, register() else {
      promise.reject("wechat_auth_configuration_pending", "WeChat login is waiting for platform configuration")
      return
    }
    guard WXApi.isWXAppInstalled() else {
      promise.reject("wechat_not_installed", "WeChat is not installed")
      return
    }
    guard WXApi.isWXAppSupport() else {
      promise.reject("wechat_auth_unavailable", "The installed WeChat version does not support authorization")
      return
    }
    guard pending == nil else {
      promise.reject("wechat_auth_in_progress", "A WeChat authorization request is already active")
      return
    }
    let timeout = DispatchWorkItem { [weak self] in
      guard let pending = self?.takePending(expectedState: state) else { return }
      pending.promise.reject("wechat_auth_timeout", "WeChat authorization timed out")
    }
    pending = PendingAuthorization(state: state, promise: promise, timeout: timeout)
    DispatchQueue.main.asyncAfter(deadline: .now() + authorizationTimeoutSeconds, execute: timeout)
    let request = SendAuthReq()
    request.scope = "snsapi_userinfo"
    request.state = state
    WXApi.send(request) { [weak self] sent in
      DispatchQueue.main.async {
        guard !sent, let pending = self?.takePending(expectedState: state) else { return }
        let code = WXApi.isWXAppInstalled() ? "wechat_auth_unavailable" : "wechat_not_installed"
        pending.promise.reject(code, "WeChat authorization could not be started")
      }
    }
  }

  func onReq(_ req: BaseReq) {}

  func onResp(_ response: BaseResp) {
    DispatchQueue.main.async { [weak self] in
      self?.handleResponse(response)
    }
  }

  private func handleResponse(_ response: BaseResp) {
    guard let authorization = response as? SendAuthResp else { return }
    // Every client callback must match the active request, including failure
    // and cancellation. Unsolicited, cold-start and late callbacks are ignored.
    guard let state = authorization.state, !state.isEmpty,
          let pending = takePending(expectedState: state) else { return }
    if authorization.errCode == 0, let code = authorization.code, !code.isEmpty {
      pending.promise.resolve(["code": code, "state": pending.state])
    } else if authorization.errCode == -2 {
      pending.promise.reject("social_auth_cancelled", "WeChat authorization was cancelled")
    } else {
      pending.promise.reject("wechat_auth_failed", "WeChat authorization failed")
    }
  }

  func cancel(state: String) {
    DispatchQueue.main.async { [weak self] in
      guard let pending = self?.takePending(expectedState: state) else { return }
      pending.promise.reject("social_auth_cancelled", "WeChat authorization was cancelled")
    }
  }

  private func takePending(expectedState: String) -> PendingAuthorization? {
    guard let pending else { return nil }
    guard pending.state == expectedState else { return nil }
    self.pending = nil
    pending.timeout.cancel()
    return pending
  }
}

public final class IcaoWechatAuthModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IcaoWechatAuth")

    Function("getStatus") {
      let configuration = IcaoWechatAuthCoordinator.shared.configuration
      return [
        "appId": configuration?.appId ?? "",
        "configured": configuration != nil,
        "installed": WXApi.isWXAppInstalled(),
        "supported": WXApi.isWXAppSupport()
      ] as [String : Any]
    }

    AsyncFunction("authorize") { (state: String, promise: Promise) in
      IcaoWechatAuthCoordinator.shared.authorize(state: state, promise: promise)
    }.runOnQueue(.main)

    Function("cancelAuthorization") { (state: String) in
      IcaoWechatAuthCoordinator.shared.cancel(state: state)
    }
  }
}

public final class IcaoWechatAuthAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = IcaoWechatAuthCoordinator.shared.register()
    return true
  }

  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    WXApi.handleOpen(url, delegate: IcaoWechatAuthCoordinator.shared)
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    WXApi.handleOpenUniversalLink(userActivity, delegate: IcaoWechatAuthCoordinator.shared)
  }
}
