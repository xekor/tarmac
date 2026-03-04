#!/usr/bin/env swift
// ax-dump: Fast accessibility tree dumper for Simulator
// Outputs JSON array of UI elements with role, label, value, and position

import Cocoa

struct AXElement: Codable {
    let role: String
    let label: String
    let value: String
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

func getAttribute(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return value
}

func getPosition(_ element: AXUIElement) -> (Int, Int)? {
    guard let value = getAttribute(element, kAXPositionAttribute) else { return nil }
    var point = CGPoint.zero
    AXValueGetValue(value as! AXValue, .cgPoint, &point)
    return (Int(point.x), Int(point.y))
}

func getSize(_ element: AXUIElement) -> (Int, Int)? {
    guard let value = getAttribute(element, kAXSizeAttribute) else { return nil }
    var size = CGSize.zero
    AXValueGetValue(value as! AXValue, .cgSize, &size)
    return (Int(size.width), Int(size.height))
}

func collectElements(_ element: AXUIElement, depth: Int, maxDepth: Int, results: inout [AXElement], maxResults: Int) {
    guard depth <= maxDepth, results.count < maxResults else { return }

    let role = getAttribute(element, kAXRoleAttribute) as? String ?? ""
    let desc = getAttribute(element, kAXDescriptionAttribute) as? String ?? ""
    let title = getAttribute(element, kAXTitleAttribute) as? String ?? ""
    let roleDesc = getAttribute(element, kAXRoleDescriptionAttribute) as? String ?? ""
    let val = getAttribute(element, kAXValueAttribute)
    let valueStr = val != nil ? "\(val!)" : ""
    let label = !desc.isEmpty ? desc : (!title.isEmpty ? title : "")

    let interestingRoles: Set<String> = [
        "AXButton", "AXStaticText", "AXTextField", "AXTextArea", "AXSecureTextField",
        "AXImage", "AXLink", "AXCheckBox", "AXRadioButton", "AXPopUpButton",
        "AXComboBox", "AXSlider", "AXProgressIndicator", "AXSwitch",
        "AXTabGroup", "AXTab", "AXCell", "AXMenuItem"
    ]

    if !label.isEmpty || interestingRoles.contains(role) || !valueStr.isEmpty {
        if let pos = getPosition(element), let sz = getSize(element) {
            // Only include elements with non-zero size
            if sz.0 > 0 && sz.1 > 0 {
                results.append(AXElement(
                    role: roleDesc.isEmpty ? role : roleDesc,
                    label: label,
                    value: String(valueStr.prefix(100)),
                    x: pos.0,
                    y: pos.1,
                    width: sz.0,
                    height: sz.1
                ))
            }
        }
    }

    // Recurse into children
    guard let children = getAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return }
    for child in children {
        collectElements(child, depth: depth + 1, maxDepth: maxDepth, results: &results, maxResults: maxResults)
    }
}

// Find Simulator process
let apps = NSWorkspace.shared.runningApplications.filter { $0.localizedName == "Simulator" }
guard let simApp = apps.first else {
    print("{\"error\": \"Simulator is not running\"}")
    exit(1)
}

let appElement = AXUIElementCreateApplication(simApp.processIdentifier)

// Get the first window
guard let windows = getAttribute(appElement, kAXWindowsAttribute) as? [AXUIElement],
      let window = windows.first else {
    print("{\"error\": \"No Simulator window found\"}")
    exit(1)
}

// Parse args for max depth and max results
let maxDepth = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 15 : 15
let maxResults = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 200 : 200

// Optionally filter by label substring
let filterLabel = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : nil

var elements: [AXElement] = []
collectElements(window, depth: 0, maxDepth: maxDepth, results: &elements, maxResults: maxResults)

// Apply filter if provided
if let filter = filterLabel {
    let lowered = filter.lowercased()
    elements = elements.filter {
        $0.label.lowercased().contains(lowered) ||
        $0.value.lowercased().contains(lowered) ||
        $0.role.lowercased().contains(lowered)
    }
}

let encoder = JSONEncoder()
encoder.outputFormatting = .prettyPrinted
let data = try! encoder.encode(elements)
print(String(data: data, encoding: .utf8)!)
