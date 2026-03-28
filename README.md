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

Add Tarmac to your MCP client configuration:

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

| Category | Tools |
|---|---|
| Simulators | `list_simulators`, `boot_simulator`, `shutdown_simulator`, `erase_simulator` |
| Build | `build` |
| Apps | `install_app`, `launch_app`, `terminate_app`, `list_apps` |
| I/O | `screenshot`, `open_url`, `push_notification`, `set_location` |
| UI | `set_appearance`, `get_logs` |
| Interaction | `tap`, `swipe`, `type_text`, `press_key` |
| Accessibility | `get_ui_elements`, `find_and_tap`, `find_and_type` |
| Video | `start_recording`, `stop_recording` |
| App Data | `get_app_container`, `read_app_file`, `read_user_defaults` |
| Device | `multi_screenshot`, `biometric`, `network_condition`, `get_crash_logs`, `performance_trace` |
| Visual Diff | `visual_diff`, `snapshot_compare` |

## Development

```sh
pnpm install
pnpm build
```

## License

[MIT](LICENSE)
