package com.icao.profileavatar

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.math.max
import kotlin.math.roundToInt

public class IcaoProfileAvatarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IcaoProfileAvatar")
    AsyncFunction("prepareAvatar") { sourceUri: String ->
      val uri = Uri.parse(sourceUri)
      require(uri.scheme == "file" || uri.scheme == "content") { "Image must be local" }
      val resolver = appContext.reactContext?.contentResolver ?: error("Application is unavailable")
      prepare(resolver, uri)
    }
  }

  private fun open(resolver: ContentResolver, uri: Uri): InputStream =
    resolver.openInputStream(uri) ?: error("Image could not be read")

  private fun prepare(resolver: ContentResolver, uri: Uri): String {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(resolver, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid image dimensions" }
    // Decode only a sampled thumbnail, never the original full camera bitmap.
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 512) sample *= 2
    val bitmap = open(resolver, uri).use {
      BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: error("Image could not be decoded")
    try {
      val orientation = runCatching {
        open(resolver, uri).use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
      }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
      val transform = Matrix().apply {
        when (orientation) {
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
          ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
          ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
        }
      }
      val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, transform, true)
      try {
        val scale = minOf(1f, 256f / max(oriented.width, oriented.height))
        val width = max(1, (oriented.width * scale).roundToInt())
        val height = max(1, (oriented.height * scale).roundToInt())
        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
          Canvas(output).apply {
            drawColor(Color.WHITE)
            drawBitmap(oriented, null, RectF(0f, 0f, width.toFloat(), height.toFloat()), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
          }
          for (quality in listOf(85, 70, 55)) {
            val bytes = ByteArrayOutputStream().use { stream ->
              check(output.compress(Bitmap.CompressFormat.JPEG, quality, stream)) { "Image encoding failed" }
              stream.toByteArray()
            }
            val result = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            if (result.length <= 180_000) return result
          }
          error("Image could not be prepared")
        } finally { output.recycle() }
      } finally { if (oriented !== bitmap) oriented.recycle() }
    } finally { bitmap.recycle() }
  }
}
