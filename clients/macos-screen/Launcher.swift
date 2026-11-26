import Foundation
import Security
import AppKit

let support = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/DisciplineScreen")
let configURL = support.appendingPathComponent("config.json")
let service = "com.discipline.screen-sync"

func output(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
       let text = String(data: data, encoding: .utf8) { print(text) }
}

func credentialQuery(_ config: [String: Any]) throws -> [String: Any] {
    guard let server = config["server"] as? String, let key = config["collector_id"] as? String,
          !server.isEmpty, key.count == 32 else { throw NSError(domain: "configuration", code: 1) }
    return [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: server + "|" + key]
}

func loadConfig() throws -> [String: Any] {
    guard let result = try JSONSerialization.jsonObject(with: Data(contentsOf: configURL)) as? [String: Any]
    else { throw NSError(domain: "configuration", code: 1) }
    return result
}

func storeConfiguration() throws {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count < 65536,
          var config = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = config.removeValue(forKey: "token") as? String,
          let key = config["collector_id"] as? String, token.hasPrefix("dsc_" + key + "."),
          let origin = config["server"] as? String,
          let url = URLComponents(string: origin), url.scheme == "https", url.host != nil,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
          url.path.isEmpty, let account = config["account"] as? String, !account.isEmpty else {
        throw NSError(domain: "configuration", code: 1)
    }
    let query = try credentialQuery(config)
    let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8)]
    var entry = query
    entry[kSecValueData as String] = Data(token.utf8)
    entry[kSecAttrLabel as String] = "Discipline Screen Sync"
    let result = SecItemAdd(entry as CFDictionary, nil)
    if result == errSecDuplicateItem {
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard update == errSecSuccess else { throw NSError(domain: "keychain", code: Int(update)) }
    } else if result != errSecSuccess { throw NSError(domain: "keychain", code: Int(result)) }
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700])
    let clean = try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys])
    try clean.write(to: configURL, options: [.atomic])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
    output(["status": "configured", "server": origin, "account": account])
}

func readToken(_ config: [String: Any]) throws -> String {
    var query = try credentialQuery(config)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let result = SecItemCopyMatching(query as CFDictionary, &found)
    guard result == errSecSuccess, let data = found as? Data,
          let token = String(data: data, encoding: .utf8) else {
        throw NSError(domain: "keychain", code: Int(result))
    }
    return token
}

func enableDailyTask() throws {
    let agent = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/com.discipline.screen-sync.plist")
    let domain = "gui/\(getuid())"
    let inspect = Process()
    inspect.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    inspect.arguments = ["print", domain + "/com.discipline.screen-sync"]
    inspect.standardOutput = FileHandle.nullDevice
    inspect.standardError = FileHandle.nullDevice
    try inspect.run(); inspect.waitUntilExit()
    if inspect.terminationStatus == 0 { return }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    task.arguments = ["bootstrap", domain, agent.path]
    try task.run(); task.waitUntilExit()
    guard task.terminationStatus == 0 else { throw NSError(domain: "schedule", code: Int(task.terminationStatus)) }
}

func run() throws -> Int32 {
    var arguments = Array(CommandLine.arguments.dropFirst())
    let interactive = arguments.isEmpty
    if arguments.isEmpty { arguments = ["sync", "--force"] }
    if arguments[0] == "set-token" { try storeConfiguration(); return 0 }
    if arguments[0] == "remove-token" {
        let result = SecItemDelete(try credentialQuery(loadConfig()) as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw NSError(domain: "keychain", code: Int(result)) }
        output(["status":"credential-removed"]); return 0
    }
    guard ["sync", "status", "check-access"].contains(arguments[0]) else {
        throw NSError(domain: "command", code: 1)
    }
    var token = ""
    if arguments[0] == "sync" { token = try readToken(loadConfig()) }
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    let resources = executable.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
    process.arguments = [resources.appendingPathComponent("sync.py").path] + arguments
    let pipe = Pipe()
    process.standardInput = pipe
    // LaunchAgent sends stdout/stderr to private local logs. Secrets go only through this pipe.
    try process.run()
    let payload = try JSONSerialization.data(withJSONObject: ["token": token])
    try pipe.fileHandleForWriting.write(contentsOf: payload)
    try pipe.fileHandleForWriting.close()
    process.waitUntilExit()
    if interactive {
        if process.terminationStatus == 0 { try enableDailyTask() }
        let alert = NSAlert()
        alert.messageText = process.terminationStatus == 0 ? "屏幕记录同步已完成" : "屏幕记录暂未同步"
        alert.informativeText = process.terminationStatus == 0
            ? "统计已更新，每日采集任务已启用。可在自律养成的屏幕统计页面查看。"
            : "请检查系统设置 → 隐私与安全性 → 完全磁盘访问中的 DisciplineScreen，并检查采集器状态。"
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
    return process.terminationStatus
}

do { exit(try run()) }
catch let error as NSError {
    output(["status":"error", "error_code":error.domain,
            "message":error.domain == "keychain" ? "无法读取钥匙串凭证，请完成首次配置或允许钥匙串访问" : "采集器配置尚未完成"])
    exit(2)
}
