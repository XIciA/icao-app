package com.icao.distribution

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class IcaoDistributionEnvironmentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IcaoDistributionEnvironment")
    Function("getEnvironment") { "production" }
    Function("verifyEd25519Jws") { token: String, publicKeyBase64: String ->
      Ed25519JwsVerifier.verify(token, publicKeyBase64) { value ->
        Base64.decode(value, Base64.DEFAULT)
      }
    }
  }
}
