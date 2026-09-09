package com.icao.wechatauth

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.tencent.mm.opensdk.modelbase.BaseResp
import com.tencent.mm.opensdk.modelpay.PayReq
import com.tencent.mm.opensdk.modelpay.PayResp
import expo.modules.kotlin.Promise

/** Native callback only reports returning from WeChat; the server alone verifies payment. */
object IcaoWechatPayCoordinator {
  private data class Pending(val id: String, val prepayId: String, val promise: Promise, var timeout: Runnable? = null)
  private val handler = Handler(Looper.getMainLooper())
  private var pending: Pending? = null

  @Synchronized
  fun pay(context: Context, id: String, fields: Map<String, String>, promise: Promise) {
    val api = IcaoWechatAuthCoordinator.api(context)
    if (api == null || !api.isWXAppInstalled) {
      promise.reject("wechat_pay_unavailable", "WeChat payment is unavailable", null)
      return
    }
    if (pending != null) {
      promise.reject("wechat_pay_in_progress", "A payment is already active", null)
      return
    }
    val required = listOf("appId", "partnerId", "prepayId", "packageValue", "nonceStr", "timeStamp", "sign")
    if (!Regex("^[0-9a-fA-F-]{36}$").matches(id) || required.any { fields[it].isNullOrBlank() }
      || fields["appId"] != IcaoWechatAuthCoordinator.status(context)["appId"] || fields["packageValue"] != "Sign=WXPay") {
      promise.reject("invalid_wechat_payment", "Invalid payment parameters", null)
      return
    }
    val request = PayReq().apply {
      transaction = id
      appId = fields["appId"]
      partnerId = fields["partnerId"]
      prepayId = fields["prepayId"]
      packageValue = fields["packageValue"]
      nonceStr = fields["nonceStr"]
      timeStamp = fields["timeStamp"]
      sign = fields["sign"]
    }
    val active = Pending(id, fields["prepayId"]!!, promise)
    active.timeout = Runnable { take(id)?.promise?.resolve(mapOf("state" to "unknown")) }
    pending = active
    handler.postDelayed(active.timeout!!, 120_000L)
    try {
      if (!api.sendReq(request)) take(id)?.promise?.reject("wechat_pay_unavailable", "Unable to open WeChat", null)
    } catch (_: Exception) {
      take(id)?.promise?.reject("wechat_pay_unavailable", "Unable to open WeChat", null)
    }
  }

  @Synchronized
  fun handleResponse(response: BaseResp) {
    val payment = response as? PayResp ?: return
    val active = pending ?: return
    // Late callbacks from a different checkout must not resolve the current checkout.
    if (payment.transaction != active.id && payment.prepayId != active.prepayId) return
    take(active.id)?.promise?.resolve(mapOf("state" to when (payment.errCode) {
      BaseResp.ErrCode.ERR_OK -> "returned"
      BaseResp.ErrCode.ERR_USER_CANCEL -> "cancelled"
      else -> "unknown"
    }))
  }

  @Synchronized
  fun cancel(id: String) { take(id)?.promise?.resolve(mapOf("state" to "unknown")) }

  @Synchronized
  private fun take(id: String): Pending? {
    val active = pending ?: return null
    if (active.id != id) return null
    pending = null
    active.timeout?.let(handler::removeCallbacks)
    return active
  }
}
