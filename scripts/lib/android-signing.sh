#!/bin/sh

load_android_release_signing() {
  ANDROID_KEY_ALIAS=${ICAO_ANDROID_KEY_ALIAS:-feizhuicao-release}
  ANDROID_SIGNING_DIR=${ICAO_ANDROID_SIGNING_DIR:-${HOME:?}/Library/Application Support/Feizhu ICAO/Signing}
  ANDROID_KEYSTORE_PATH=${ICAO_ANDROID_KEYSTORE_PATH:-$ANDROID_SIGNING_DIR/android-release.p12}
  ANDROID_KEYCHAIN_SERVICE=${ICAO_ANDROID_KEYCHAIN_SERVICE:-com.feizhuicao.android-signing}
  ANDROID_KEYCHAIN_ACCOUNT=${ICAO_ANDROID_KEYCHAIN_ACCOUNT:-$USER}
  ANDROID_ICLOUD_BACKUP_DIR=${ICAO_ANDROID_ICLOUD_BACKUP_DIR:-${HOME:?}/Library/Mobile Documents/com~apple~CloudDocs/Feizhu ICAO/Signing Backup}
  JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}
  KEYTOOL=$JAVA_HOME/bin/keytool

  if [ ! -x "$KEYTOOL" ]; then
    echo "Java 17 keytool is missing: $KEYTOOL" >&2
    exit 1
  fi

  umask 077
  mkdir -p "$ANDROID_SIGNING_DIR"
  chmod 700 "$ANDROID_SIGNING_DIR"

  ANDROID_KEYSTORE_PASSWORD=$(/usr/bin/security find-generic-password \
    -a "$ANDROID_KEYCHAIN_ACCOUNT" -s "$ANDROID_KEYCHAIN_SERVICE" -w 2>/dev/null || true)

  if [ ! -f "$ANDROID_KEYSTORE_PATH" ]; then
    if [ -z "$ANDROID_KEYSTORE_PASSWORD" ]; then
      ANDROID_KEYSTORE_PASSWORD=$(LC_ALL=C openssl rand -base64 48 | tr -d '\n')
      /usr/bin/security add-generic-password -U \
        -a "$ANDROID_KEYCHAIN_ACCOUNT" \
        -s "$ANDROID_KEYCHAIN_SERVICE" \
        -l '飞猪 ICAO Android Release Signing' \
        -w "$ANDROID_KEYSTORE_PASSWORD" >/dev/null
    fi

    "$KEYTOOL" -genkeypair \
      -storetype PKCS12 \
      -keystore "$ANDROID_KEYSTORE_PATH" \
      -storepass "$ANDROID_KEYSTORE_PASSWORD" \
      -keypass "$ANDROID_KEYSTORE_PASSWORD" \
      -alias "$ANDROID_KEY_ALIAS" \
      -keyalg RSA \
      -keysize 4096 \
      -validity 10000 \
      -dname 'CN=Feizhu ICAO Android Release,O=Feizhu ICAO,C=CN' >/dev/null
  elif [ -z "$ANDROID_KEYSTORE_PASSWORD" ]; then
    echo "The Android keystore exists, but its password is missing from macOS Keychain ($ANDROID_KEYCHAIN_SERVICE)." >&2
    exit 1
  fi

  "$KEYTOOL" -list \
    -storetype PKCS12 \
    -keystore "$ANDROID_KEYSTORE_PATH" \
    -storepass "$ANDROID_KEYSTORE_PASSWORD" \
    -alias "$ANDROID_KEY_ALIAS" >/dev/null

  chmod 600 "$ANDROID_KEYSTORE_PATH"
  mkdir -p "$ANDROID_ICLOUD_BACKUP_DIR"
  chmod 700 "$ANDROID_ICLOUD_BACKUP_DIR" 2>/dev/null || true
  cp -p "$ANDROID_KEYSTORE_PATH" "$ANDROID_ICLOUD_BACKUP_DIR/android-release.p12"

  "$KEYTOOL" -list -v \
    -storetype PKCS12 \
    -keystore "$ANDROID_KEYSTORE_PATH" \
    -storepass "$ANDROID_KEYSTORE_PASSWORD" \
    -alias "$ANDROID_KEY_ALIAS" \
    | sed -n '/Owner:/p;/Valid from:/p;/SHA256:/p' \
    > "$ANDROID_SIGNING_DIR/android-release-metadata.txt"
  cp -p "$ANDROID_SIGNING_DIR/android-release-metadata.txt" "$ANDROID_ICLOUD_BACKUP_DIR/android-release-metadata.txt"

  export JAVA_HOME
  export ICAO_ANDROID_KEYSTORE_PATH=$ANDROID_KEYSTORE_PATH
  export ICAO_ANDROID_KEYSTORE_PASSWORD=$ANDROID_KEYSTORE_PASSWORD
  export ICAO_ANDROID_KEY_ALIAS=$ANDROID_KEY_ALIAS
  export ICAO_ANDROID_KEY_PASSWORD=$ANDROID_KEYSTORE_PASSWORD
}
