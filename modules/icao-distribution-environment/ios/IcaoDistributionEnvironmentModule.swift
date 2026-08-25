import ExpoModulesCore
import CryptoKit
import Foundation

public final class IcaoDistributionEnvironmentModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IcaoDistributionEnvironment")

    Function("getEnvironment") {
      Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        ? "sandbox"
        : "production"
    }

    Function("verifyEd25519Jws") { (token: String, publicKeyBase64: String) -> String? in
      let components = token.split(separator: ".", omittingEmptySubsequences: false)
      guard components.count == 3,
            let headerData = Self.decodeBase64Url(String(components[0])),
            let payloadData = Self.decodeBase64Url(String(components[1])),
            let signature = Self.decodeBase64Url(String(components[2])),
            let publicKeyData = Data(base64Encoded: publicKeyBase64),
            publicKeyData.count == 32,
            signature.count == 64,
            let header = try? JSONSerialization.jsonObject(with: headerData) as? [String: Any],
            header["alg"] as? String == "EdDSA",
            header["typ"] as? String == "JWT",
            let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKeyData),
            let signingInput = "\(components[0]).\(components[1])".data(using: .utf8),
            publicKey.isValidSignature(signature, for: signingInput)
      else { return nil }

      return String(data: payloadData, encoding: .utf8)
    }
  }

  private static func decodeBase64Url(_ value: String) -> Data? {
    var base64 = value.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder != 0 {
      base64.append(String(repeating: "=", count: 4 - remainder))
    }
    return Data(base64Encoded: base64)
  }
}
