import ExpoModulesCore
import UIKit
import WechatOpenSDK

private let wechatAppIdKey = "ICAOWechatAppId"
private let wechatUniversalLinkKey = "ICAOWechatUniversalLink"

final class IcaoWechatAuthCoordinator: NSObject, WXApiDelegate {
  static let shared = IcaoWechatAuthCoordinator()

  private var pending: (state: String, promise: Promise)?

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
    guard WXApi.isWXAppInstalled(), WXApi.isWXAppSupport() else {
      promise.reject("wechat_app_not_installed", "WeChat is not installed or does not support authorization")
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
    pending = (state, promise)
    let request = SendAuthReq()
    request.scope = "snsapi_userinfo"
    request.state = state
    WXApi.sendAuthReq(request, viewController: controller, delegate: self) { [weak self] sent in
      DispatchQueue.main.async {
        guard !sent, let pending = self?.pending else { return }
        self?.pending = nil
        pending.promise.reject("wechat_auth_unavailable", "WeChat authorization could not be started")
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
    guard let authorization = response as? SendAuthResp, let pending else { return }
    self.pending = nil
    guard authorization.state == pending.state else {
      pending.promise.reject("invalid_wechat_auth_response", "WeChat returned a mismatched authorization state")
      return
    }
    if authorization.errCode == 0, let code = authorization.code, !code.isEmpty {
      pending.promise.resolve(["code": code, "state": pending.state])
    } else if authorization.errCode == -2 {
      pending.promise.reject("social_auth_cancelled", "WeChat authorization was cancelled")
    } else {
      pending.promise.reject("wechat_auth_failed", "WeChat authorization failed")
    }
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
      let configured = IcaoWechatAuthCoordinator.shared.configuration != nil
      return [
        "configured": configured,
        "installed": WXApi.isWXAppInstalled(),
        "supported": WXApi.isWXAppSupport()
      ]
    }

    AsyncFunction("authorize") { (state: String, promise: Promise) in
      IcaoWechatAuthCoordinator.shared.authorize(state: state, promise: promise)
    }.runOnQueue(.main)
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
