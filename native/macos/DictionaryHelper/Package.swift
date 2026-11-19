// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DictionaryHelper",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(name: "DictionaryHelper", path: "Sources/DictionaryHelper")
    ]
)
