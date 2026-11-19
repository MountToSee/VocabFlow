// Long-running helper that answers dictionary lookups using macOS Dictionary Services.
//
// Protocol (line-delimited JSON over stdio):
//   in:  {"id": 1, "word": "serendipity"}
//   out: {"id": 1, "definition": "serendipity | ˌserənˈdipədē | noun ..."}
// An empty definition means no entry was found.
//
// One-shot mode for manual testing: `DictionaryHelper serendipity`

import CoreServices
import Foundation

struct Request: Decodable {
    let id: Int
    let word: String
}

struct Response: Encodable {
    let id: Int
    let definition: String
}

func define(_ word: String) -> String {
    let term = word as CFString
    let range = CFRangeMake(0, CFStringGetLength(term))
    guard let result = DCSCopyTextDefinition(nil, term, range) else { return "" }
    return result.takeRetainedValue() as String
}

let args = CommandLine.arguments.dropFirst()
if let word = args.first {
    print(define(word))
    exit(0)
}

setvbuf(stdout, nil, _IOLBF, 0)
let decoder = JSONDecoder()
let encoder = JSONEncoder()

while let line = readLine(strippingNewline: true) {
    guard let data = line.data(using: .utf8),
          let request = try? decoder.decode(Request.self, from: data)
    else { continue }
    let response = Response(id: request.id, definition: define(request.word))
    if let out = try? encoder.encode(response), let json = String(data: out, encoding: .utf8) {
        print(json)
    }
}
