require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'IcaoWechatAuth'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Yunqihangke'
  s.homepage       = 'https://readyoufife.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Keep the vendored SDK headers owned exclusively by the XCFramework module.
  # A recursive glob also treats Vendor/**/*.h as this pod's source headers,
  # causing Clang to import WXApiObject twice and redefine every SDK enum.
  s.source_files = 'IcaoWechatAuthModule.swift'
  s.vendored_frameworks = 'Vendor/WechatOpenSDK.xcframework'
end
