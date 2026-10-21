package com.icao.appinstaller

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class UpdateFileProvider : FileProvider()

class IcaoAppInstallerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IcaoAppInstaller")
    AsyncFunction("installApk") { uri: String, version: String, build: Long, sha256: String ->
      val context = requireNotNull(appContext.reactContext) { "app_installer_unavailable" }
      val parsed = Uri.parse(uri)
      require(parsed.scheme == "file") { "invalid_update_file" }
      val file = File(requireNotNull(parsed.path)).canonicalFile
      val directory = File(context.cacheDir, "app-updates").canonicalFile
      require(file.parentFile == directory && file.extension == "apk" && file.isFile) { "invalid_update_file" }
      require(Regex("[a-f0-9]{64}").matches(sha256)) { "invalid_update_checksum" }
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input ->
        val buffer = ByteArray(65536)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          digest.update(buffer, 0, count)
        }
      }
      require(digest.digest().joinToString("") { "%02x".format(it) } == sha256) { "update_checksum_mismatch" }
      val pm = context.packageManager
      val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
      val archive = requireNotNull(pm.getPackageArchiveInfo(file.path, flags)) { "invalid_update_apk" }
      val installed = pm.getPackageInfo(context.packageName, flags)
      require(archive.packageName == context.packageName) { "update_package_mismatch" }
      require(archive.versionName == version && versionCode(archive) == build && build > versionCode(installed)) { "update_version_mismatch" }
      val expectedSigners = signers(installed)
      require(expectedSigners.isNotEmpty() && signers(archive) == expectedSigners) { "update_signature_mismatch" }
      if (Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        "permission-required"
      } else {
        val contentUri = FileProvider.getUriForFile(context, "${context.packageName}.app-updates", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(contentUri, "application/vnd.android.package-archive")
          clipData = ClipData.newRawUri("App update", contentUri)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        "installer-opened"
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

  @Suppress("DEPRECATION")
  private fun signers(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
    }?.toSet() ?: emptySet()
  }
}
