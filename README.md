# Tarmac

MCP server for iOS Simulator automation. Build, run, test, and interact with iOS simulators from any MCP-compatible AI assistant.

## Features

- **Simulator management** -- list, boot, shutdown, and erase simulators
- **Build** -- compile Xcode projects and workspaces with `xcodebuild`
- **App lifecycle** -- install, launch, terminate, and list apps
- **Screenshots** -- capture single or multi-device screenshots
- **Interaction** -- tap, swipe, type text, and press keys in the simulator
- **Accessibility** -- query UI elements, find-and-tap, find-and-type by accessibility label
- **Video recording** -- start/stop screen recordings
- **App data** -- read app container files and UserDefaults
- **Device I/O** -- open URLs, push notifications, set GPS location, simulate biometrics
- **Network conditioning** -- throttle network to simulate slow connections
- **Diagnostics** -- crash logs, performance traces
- **Visual diffing** -- compare screenshots for UI regression testing

## Requirements

- **macOS** with Xcode installed (includes Simulator)
- **Node.js** >= 18

## Installation

```sh
npm install -g tarmac
```

Or run directly:

```sh
npx tarmac
```

## Usage with Claude / MCP

Add Tarmac to your MCP client configuration. The config file location depends on your client:

- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Code:** `~/.claude.json` (or use `claude mcp add`)
- **Cursor:** `.cursor/mcp.json` in your project root

```json
{
  "mcpServers": {
    "tarmac": {
      "command": "npx",
      "args": ["-y", "tarmac"]
    }
  }
}
```

Once connected, your AI assistant can use any of the 30+ tools to automate iOS Simulator workflows -- building projects, taking screenshots, tapping buttons, reading logs, and more.

## Available Tools

| Category | Tool | Description |
|---|---|---|
| Simulators | `list_simulators` | List available simulators with state and runtime versions |
| | `boot_simulator` | Boot a simulator by name or UDID |
| | `shutdown_simulator` | Shut down a running simulator |
| | `erase_simulator` | Reset a simulator to factory state |
| | `set_appearance` | Get or set light/dark mode |
| Build | `build` | Build an Xcode project or workspace for the simulator |
| Apps | `install_app` | Install a .app bundle onto a booted simulator |
| | `launch_app` | Launch an app by bundle identifier |
| | `terminate_app` | Terminate a running app |
| | `list_apps` | List installed apps with bundle IDs and metadata |
| I/O | `screenshot` | Capture a screenshot of the simulator screen |
| | `multi_screenshot` | Screenshot multiple simulators simultaneously |
| | `open_url` | Open a URL or deep link in the simulator |
| | `push_notification` | Send a simulated push notification |
| | `set_location` | Set simulated GPS coordinates |
| | `biometric` | Simulate Face ID / Touch ID enrollment and matching |
| | `network_condition` | Simulate different network conditions |
| Interaction | `tap` | Tap at screen coordinates (percentage or absolute) |
| | `swipe` | Swipe between two points on screen |
| | `type_text` | Type text into the focused field |
| | `press_key` | Press a keyboard key (Return, Escape, arrows, etc.) |
| Accessibility | `get_ui_elements` | Query the accessibility tree for visible UI elements |
| | `find_and_tap` | Find an element by label and tap it |
| | `find_and_type` | Find a text field by label, focus it, and type |
| Video | `start_recording` | Start recording the simulator screen |
| | `stop_recording` | Stop recording and save the video file |
| App Data | `get_app_container` | Get the file system path to an app's container |
| | `read_app_file` | Read a file from an app's container |
| | `read_user_defaults` | Read an app's UserDefaults plist |
| Diagnostics | `get_logs` | Capture device logs with optional predicate filtering |
| | `get_crash_logs` | Retrieve crash logs for a specific app |
| | `performance_trace` | Capture a performance trace with xctrace |
| Visual Diff | `visual_diff` | Compare two screenshots pixel-by-pixel |
| | `snapshot_compare` | Take before/after screenshots and diff them |

## Development

```sh
pnpm install
pnpm build
```

## License

[MIT](LICENSE)
