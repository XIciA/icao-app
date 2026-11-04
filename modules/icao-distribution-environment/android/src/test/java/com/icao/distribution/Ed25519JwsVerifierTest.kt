package com.icao.distribution

import java.util.Base64
import org.junit.Assert.*
import org.junit.Test

class Ed25519JwsVerifierTest {
  // Signed independently by Node/OpenSSL; contains only a disposable public key.
  private val key = "68nxHdHj7n2mGcBEBfbMkpX8L7i+MK8ohTa9vjQ9kIs="
  private val token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmaXh0dXJlLXVzZXIiLCJ0ZXh0Ijoi56a757q_6aKY5bqTIn0.U7jb7DANut7TaxkbTgItTzgv_VRAUf6L5p2Dec4rFFvXHMWbOF4fafMf62YGq01SXiZusiZ2n-rfvcEPlWzrAg"
  private fun verify(value: String, publicKey: String = key) =
    Ed25519JwsVerifier.verify(value, publicKey) { Base64.getDecoder().decode(it) }

  @Test fun verifiesExactSignedUtf8Payload() {
    assertEquals("{\"sub\":\"fixture-user\",\"text\":\"离线题库\"}", verify(token))
  }
  @Test fun rejectsAlteredPayloadSignatureAndKey() {
    val parts = token.split('.')
    assertNull(verify(parts[0] + ".e30." + parts[2]))
    val signature = Base64.getUrlDecoder().decode(parts[2])
    signature[0] = (signature[0].toInt() xor 1).toByte()
    assertNull(verify(parts[0] + "." + parts[1] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature)))
    assertNull(verify(token, Base64.getEncoder().encodeToString(ByteArray(32))))
    assertNull(verify(token, "AA=="))
  }
  @Test fun rejectsMalformedOrWrongAlgorithmTokens() {
    listOf("", "a.b", "a.b.c.d", "..", token + ".", "!" + token,
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.LgycP69Hp4-U3KNvug865ECXIzFxvsz1npl3NgVx39_R7f9WAWMEYAxnQPohePn7PEkUfW_t9Cl9nkV3A0VPCg", "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9._w.q3t4CfgGzHaD7Ez0bPghqc06d3BmoYjVJ67AeE3i7p_P0POz4KZ2JCsswQrczvNpZ8iIKIdBtAb7iSDnBbvdCA").forEach { assertNull(verify(it)) }
  }
}
