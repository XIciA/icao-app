package com.icao.distribution

import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Matches the Apple module: verify the exact compact JWS bytes before returning its payload. */
internal object Ed25519JwsVerifier {
  fun verify(token: String, publicKeyBase64: String, decodeBase64: (String) -> ByteArray): String? {
    return try {
      val parts = token.split('.')
      if (parts.size != 3) return null
      fun decodeUrl(value: String): ByteArray {
        require(value.matches(Regex("[A-Za-z0-9_-]+")))
        val base64 = value.replace('-', '+').replace('_', '/')
        return decodeBase64(base64 + "=".repeat((4 - base64.length % 4) % 4))
      }
      fun utf8(bytes: ByteArray): String = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes)).toString()
      val header = JSONObject(utf8(decodeUrl(parts[0])))
      if (header.opt("alg") != "EdDSA" || header.opt("typ") != "JWT") return null
      val payload = decodeUrl(parts[1])
      val signature = decodeUrl(parts[2])
      val key = decodeBase64(publicKeyBase64)
      if (key.size != 32 || signature.size != 64) return null
      val verifier = Ed25519Signer()
      verifier.init(false, Ed25519PublicKeyParameters(key, 0))
      val input = "${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8)
      verifier.update(input, 0, input.size)
      if (verifier.verifySignature(signature)) utf8(payload) else null
    } catch (_: Exception) {
      null
    }
  }
}
