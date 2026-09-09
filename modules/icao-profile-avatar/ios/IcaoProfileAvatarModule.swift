import ExpoModulesCore
import ImageIO
import UIKit

public final class IcaoProfileAvatarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IcaoProfileAvatar")
    AsyncFunction("prepareAvatar") { (uri: String) -> String in
      guard let url = URL(string: uri), url.isFileURL,
            let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: 256,
              kCGImageSourceShouldCacheImmediately: true
            ] as CFDictionary) else {
        throw NSError(domain: "IcaoProfileAvatar", code: 1, userInfo: [NSLocalizedDescriptionKey: "Image could not be read"])
      }
      // ImageIO downsamples before decoding and applies EXIF orientation. Flatten
      // alpha explicitly so PNG/HEIC sources become an actual, opaque JPEG.
      let size = CGSize(width: CGFloat(thumbnail.width), height: CGFloat(thumbnail.height))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
        UIColor.white.setFill()
        context.fill(CGRect(origin: .zero, size: size))
        UIImage(cgImage: thumbnail).draw(in: CGRect(origin: .zero, size: size))
      }
      for quality: CGFloat in [0.85, 0.7, 0.55] {
        if let data = image.jpegData(compressionQuality: quality) {
          let result = "data:image/jpeg;base64," + data.base64EncodedString()
          if result.utf8.count <= 180_000 { return result }
        }
      }
      throw NSError(domain: "IcaoProfileAvatar", code: 2, userInfo: [NSLocalizedDescriptionKey: "Image could not be prepared"])
    }
  }
}
