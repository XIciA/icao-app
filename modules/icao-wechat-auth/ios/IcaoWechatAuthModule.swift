import ExpoModulesCore
import UIKit
import WechatOpenSDK

private let wechatAppIdKey = "ICAOWechatAppId"
private let wechatUniversalLinkKey = "ICAOWechatUniversalLink"
private let authorizationTimeoutSeconds: TimeInterval = 240

// A cancelled SDK web dialog may omit state. This delegate is scoped to one
// request, so such a callback cannot cancel a newer authorization generation.
private final class WechatAuthorizationDelegate: NSObject, WXApiDelegate {
  let receive: (BaseResp) -> Void
  init(receive: @escaping (BaseResp) -> Void) { self.receive = receive }
  func onReq(_ req: BaseReq) {}
  func onResp(_ response: BaseResp) { receive(response) }
}

final class IcaoWechatAuthCoordinator: NSObject, WXApiDelegate {
  static let shared = IcaoWechatAuthCoordinator()

  private struct PendingAuthorization {
    let state: String
    let promise: Promise
    let timeout: DispatchWorkItem
    let presentation: UIViewController?
    let delegate: WechatAuthorizationDelegate
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
    let installed = WXApi.isWXAppInstalled()
    guard !installed || WXApi.isWXAppSupport() else {
      promise.reject("wechat_auth_unavailable", "The installed WeChat version does not support authorization")
      return
    }
    guard pending == nil else {
      promise.reject("wechat_auth_in_progress", "A WeChat authorization request is already active")
      return
    }
    guard let controller = Self.presentingViewController() else {
      promise.reject("wechat_auth_unavailable", "No view controller is available for WeChat authorization")
      return
    }
    let timeout = DispatchWorkItem { [weak self] in
      guard let pending = self?.takePending(expectedState: state) else { return }
      pending.promise.reject("wechat_auth_timeout", "WeChat authorization timed out")
    }
    // Give the SDK its own presentation owner for its official no-install
    // authorization. Cancellation/timeout may only dismiss this request's UI.
    let authorizationHost: UINavigationController? = installed ? nil : {
      let content = UIViewController()
      content.view.backgroundColor = .systemBackground
      content.title = "微信登录"
      content.navigationItem.leftBarButtonItem = UIBarButtonItem(
        title: "取消", primaryAction: UIAction { [weak self] _ in self?.cancel(state: state) }
      )
      let host = UINavigationController(rootViewController: content)
      host.modalPresentationStyle = .formSheet
      host.isModalInPresentation = true
      return host
    }()
    let delegate = WechatAuthorizationDelegate { [weak self] response in
      DispatchQueue.main.async { self?.handleResponse(response, requestState: state) }
    }
    pending = PendingAuthorization(state: state, promise: promise, timeout: timeout, presentation: authorizationHost, delegate: delegate)
    DispatchQueue.main.asyncAfter(deadline: .now() + authorizationTimeoutSeconds, execute: timeout)
    let request = SendAuthReq()
    request.scope = "snsapi_userinfo"
    request.state = state
    let send = { [weak self] in
      guard let self, self.pending?.state == state else { return }
      WXApi.sendAuthReq(request, viewController: authorizationHost ?? controller, delegate: delegate) { [weak self] sent in
        DispatchQueue.main.async {
          guard !sent, let pending = self?.takePending(expectedState: state) else { return }
          pending.promise.reject("wechat_auth_unavailable", "WeChat authorization could not be started")
        }
      }
    }
    if let authorizationHost { controller.present(authorizationHost, animated: true, completion: send) }
    else { send() }
  }

  func onReq(_ req: BaseReq) {}

  func onResp(_ response: BaseResp) {
    DispatchQueue.main.async { [weak self] in
      self?.handleResponse(response)
    }
  }

  private func handleResponse(_ response: BaseResp, requestState: String? = nil) {
    guard let authorization = response as? SendAuthResp else { return }
    // Successful authorization must always carry the original state. Only a
    // request-scoped failure/cancel delegate can supply an omitted state.
    let responseState = authorization.state.flatMap { $0.isEmpty ? nil : $0 }
    guard let state = responseState ?? (authorization.errCode != 0 ? requestState : nil),
          requestState == nil || requestState == state,
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
    pending.presentation?.dismiss(animated: true)
    return pending
  }

  private static func presentingViewController() -> UIViewController? {
    var controller = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: { $0.isKeyWindow })?.rootViewController
    while let presented = controller?.presentedViewController { controller = presented }
    return controller
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
        "supported": !WXApi.isWXAppInstalled() || WXApi.isWXAppSupport()
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
