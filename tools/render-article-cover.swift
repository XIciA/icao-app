// Deterministic brand cover; no factual illustration or external image source.
// swift tools/render-article-cover.swift TITLE OUTPUT.png [FONT.ttf]
import AppKit
import CoreText
let args = CommandLine.arguments
if args.count < 3 { fatalError("usage: title output.png [font.ttf]") }
if args.count > 3 { CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: args[3]) as CFURL, .process, nil) }
let width = 800, height = 500
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 0.984, green: 0.98, blue: 0.969, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()
let blue = NSColor(calibratedRed: 0.122, green: 0.369, blue: 0.851, alpha: 1)
blue.setFill(); NSRect(x: 60, y: 360, width: 50, height: 4).fill()
let titleStyle = NSMutableParagraphStyle(); titleStyle.lineSpacing = 10; titleStyle.lineBreakMode = .byCharWrapping
let title = args[1] as NSString
var size: CGFloat = 38
while size > 18 {
 let font = NSFont(name: "NotoSerifSC-SemiBold", size: size) ?? NSFont.systemFont(ofSize: size, weight: .semibold)
 let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(calibratedRed: 0.067, green: 0.086, blue: 0.122, alpha: 1), .paragraphStyle: titleStyle]
 if title.boundingRect(with: NSSize(width: 680, height: 1000), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes).height <= 225 {
  title.draw(with: NSRect(x: 60, y: 110, width: 680, height: 225), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes); break
 }
 size -= 2
}
("听你五个 · 资源分享" as NSString).draw(at: NSPoint(x: 60, y: 405), withAttributes: [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: blue])
("航空英语学习资料" as NSString).draw(at: NSPoint(x: 60, y: 50), withAttributes: [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.gray])
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
