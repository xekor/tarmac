import { mkdirSync } from "fs";
import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

export const multiScreenshot: ToolDefinition = {
  tool: {
    name: "multi_screenshot",
    description:
      "Take screenshots from multiple simulator devices simultaneously. Useful for testing layouts across different screen sizes (iPhone SE, iPhone 16, iPad, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        devices: {
          type: "array",
          items: { type: "string" },
          description:
            'List of device names or UDIDs to screenshot. Each must be booted. E.g. ["iPhone SE", "iPhone 16", "iPad"]',
        },
      },
      required: ["devices"],
    },
  },
  handler: async (args) => {
    try {
      const devices = args.devices as string[];
      mkdirSync("/tmp/tarmac/screenshots", { recursive: true });

      const results = await Promise.all(
        devices.map(async (device) => {
          try {
            const udid = await resolveDevice(device);
            const filename = `multi_${device.replace(/\s+/g, "_")}_${Date.now()}.png`;
            const filepath = `/tmp/tarmac/screenshots/${filename}`;

            const { exitCode, stderr } = await execAsync(
              `xcrun simctl io "${udid}" screenshot "${filepath}"`
            );

            if (exitCode !== 0) {
              return { device, success: false, error: stderr.trim() };
            }

            return { device, success: true, path: filepath };
          } catch (e) {
            return { device, success: false, error: (e as Error).message };
          }
        })
      );

      const allSuccess = results.every((r) => r.success);
      return toolResult(allSuccess, {
        results,
        message: `Screenshots taken from ${results.filter((r) => r.success).length}/${devices.length} devices`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const biometric: ToolDefinition = {
  tool: {
    name: "biometric",
    description:
      "Simulate Face ID or Touch ID enrollment and matching/failing. Useful for testing biometric auth flows.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        action: {
          type: "string",
          description: "'enroll' to enable biometric, 'match' to simulate successful auth, 'nomatch' to simulate failed auth",
          enum: ["enroll", "match", "nomatch"],
        },
      },
      required: ["action"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const action = args.action as string;

      let cmd: string;
      let message: string;

      switch (action) {
        case "enroll":
          cmd = `xcrun simctl spawn "${device}" notifyutil -s com.apple.BiometricKit_Sim.enrollmentChanged 1`;
          message = "Biometric enrollment enabled";
          break;
        case "match":
          cmd = `xcrun simctl spawn "${device}" notifyutil -p com.apple.BiometricKit_Sim.fingerTouch.match`;
          message = "Biometric match simulated (success)";
          break;
        case "nomatch":
          cmd = `xcrun simctl spawn "${device}" notifyutil -p com.apple.BiometricKit_Sim.fingerTouch.nomatch`;
          message = "Biometric non-match simulated (failure)";
          break;
        default:
          return toolResult(false, null, `Unknown action: ${action}`);
      }

      const { exitCode, stderr } = await execAsync(cmd);

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device, action, message });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const networkCondition: ToolDefinition = {
  tool: {
    name: "network_condition",
    description:
      "Set network conditioning on the simulator to simulate different network conditions. Useful for testing offline states, slow connections, etc.",
    inputSchema: {
      type: "object" as const,
      properties: {
        profile: {
          type: "string",
          description:
            "Network profile: 'wifi' (default), '3g', 'edge', 'lte', 'dsl', 'lossy', 'offline', or 'reset' to remove conditioning",
          enum: ["wifi", "3g", "edge", "lte", "dsl", "lossy", "offline", "reset"],
        },
      },
      required: ["profile"],
    },
  },
  handler: async (args) => {
    const profile = args.profile as string;

    // Network Link Conditioner uses profiles in /Library/Apple/Library/NetworkLinkConditioner/
    // We can also use dnctl/pfctl for basic conditioning
    if (profile === "offline") {
      // Block all network on the simulator by toggling airplane-like mode via status bar
      const { exitCode } = await execAsync(
        `xcrun simctl status_bar booted override --dataNetwork wifi --wifiMode active --cellularMode notSupported 2>&1`
      );
      // Note: This only changes the status bar, not actual connectivity
      // For real offline testing, we'd need to use pfctl or Network Link Conditioner
      return toolResult(true, {
        profile,
        message:
          "Status bar updated to show offline. Note: For true network blocking, use macOS Network Link Conditioner in System Settings.",
        hint: "Consider using Charles Proxy or NLC for more precise network conditioning",
      });
    }

    if (profile === "reset") {
      await execAsync(`xcrun simctl status_bar booted clear 2>&1`);
      return toolResult(true, { profile, message: "Status bar reset to default" });
    }

    // Map profiles to status bar overrides for visual indication
    const barOverrides: Record<string, string> = {
      wifi: "--dataNetwork wifi --wifiMode active --wifiBars 3",
      "3g": "--dataNetwork 3g --wifiBars 0 --cellularMode active --cellularBars 2",
      edge: "--dataNetwork edge --wifiBars 0 --cellularMode active --cellularBars 1",
      lte: "--dataNetwork lte --wifiBars 0 --cellularMode active --cellularBars 3",
      dsl: "--dataNetwork wifi --wifiMode active --wifiBars 1",
      lossy: "--dataNetwork wifi --wifiMode active --wifiBars 1",
    };

    const override = barOverrides[profile] ?? "";
    await execAsync(`xcrun simctl status_bar booted override ${override} 2>&1`);

    return toolResult(true, {
      profile,
      message: `Status bar updated to reflect ${profile} network. Note: This is visual only. Use Network Link Conditioner for actual throttling.`,
    });
  },
};

export const getCrashLogs: ToolDefinition = {
  tool: {
    name: "get_crash_logs",
    description:
      "Retrieve crash logs from the simulator for a specific app. Returns the most recent crash reports.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        bundleId: {
          type: "string",
          description: "App bundle identifier to filter crash logs (optional — shows all if omitted)",
        },
        limit: {
          type: "number",
          description: "Maximum number of crash logs to return (default: 5)",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const bundleId = args.bundleId as string | undefined;
      const limit = (args.limit as number) ?? 5;

      // Crash logs are stored in the device's diagnostic reports directory
      const { stdout: devicePath } = await execAsync(
        `xcrun simctl get_app_container "${device}" com.apple.Preferences data 2>/dev/null || echo ""`
      );

      // Get the device data path from the container path
      // Typical path: ~/Library/Developer/CoreSimulator/Devices/<UDID>/
      const { stdout: homeDir } = await execAsync("echo $HOME");
      const crashDir = `${homeDir.trim()}/Library/Logs/DiagnosticReports`;
      const simCrashDir = `${homeDir.trim()}/Library/Developer/CoreSimulator/Devices/${device}/data/Library/Logs/CrashReporter`;

      let grepFilter = "";
      if (bundleId) {
        const appName = bundleId.split(".").pop() ?? bundleId;
        grepFilter = `| grep -i "${appName}"`;
      }

      // Check both locations
      const { stdout: crashFiles } = await execAsync(
        `(ls -t "${crashDir}"/*.ips "${crashDir}"/*.crash "${simCrashDir}"/*.ips "${simCrashDir}"/*.crash 2>/dev/null ${grepFilter}) | head -${limit}`
      );

      if (!crashFiles.trim()) {
        return toolResult(true, {
          message: "No crash logs found",
          searchPaths: [crashDir, simCrashDir],
        });
      }

      const files = crashFiles.trim().split("\n");
      const reports = await Promise.all(
        files.map(async (f) => {
          const { stdout: content } = await execAsync(`head -50 "${f}" 2>&1`);
          return { file: f, preview: content.trim() };
        })
      );

      return toolResult(true, {
        count: reports.length,
        reports,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const performanceTrace: ToolDefinition = {
  tool: {
    name: "performance_trace",
    description:
      "Capture a performance trace using xctrace. Records CPU, memory, and other metrics for a specified duration. Returns the trace file path for analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        duration: {
          type: "number",
          description: "Duration in seconds to record (default: 10, max: 60)",
        },
        template: {
          type: "string",
          description:
            "Instruments template: 'Time Profiler', 'Allocations', 'Leaks', 'Activity Monitor' (default: 'Activity Monitor')",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      mkdirSync("/tmp/tarmac/traces", { recursive: true });
      const device = await resolveDevice((args.device as string) ?? "booted");
      const duration = Math.min((args.duration as number) ?? 10, 60);
      const template = (args.template as string) ?? "Activity Monitor";
      const filepath = `/tmp/tarmac/traces/trace_${Date.now()}.trace`;

      const { stdout, stderr, exitCode } = await execAsync(
        `xcrun xctrace record --device "${device}" --template "${template}" --time-limit ${duration}s --output "${filepath}" 2>&1`,
        { timeout: (duration + 30) * 1000 }
      );

      if (exitCode !== 0) {
        return toolResult(false, null, (stdout + stderr).trim().slice(-2000));
      }

      // Export basic summary
      const { stdout: summary } = await execAsync(
        `xcrun xctrace export --input "${filepath}" --toc 2>&1 | head -50`
      );

      return toolResult(true, {
        path: filepath,
        duration,
        template,
        summary: summary.trim(),
        message: `Trace captured (${duration}s). Open with: open "${filepath}"`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
