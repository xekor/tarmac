import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

export const installApp: ToolDefinition = {
  tool: {
    name: "install_app",
    description:
      "Install a .app bundle onto a booted simulator. The app must be built for the simulator architecture.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        appPath: {
          type: "string",
          description: "Absolute path to the .app bundle to install",
        },
      },
      required: ["appPath"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const appPath = args.appPath as string;
      const { stderr, exitCode } = await execAsync(
        `xcrun simctl install "${device}" "${appPath}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device, appPath, message: "App installed" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const launchApp: ToolDefinition = {
  tool: {
    name: "launch_app",
    description:
      "Launch an installed app on a booted simulator by its bundle identifier. Optionally capture stdout/stderr.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        bundleId: {
          type: "string",
          description: "App bundle identifier (e.g. 'com.munkee.InstaSize')",
        },
        terminateExisting: {
          type: "boolean",
          description: "Terminate existing instance before launching (default: true)",
        },
      },
      required: ["bundleId"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const bundleId = args.bundleId as string;
      const terminateExisting = args.terminateExisting !== false;

      let flags = "";
      if (terminateExisting) {
        flags += " --terminate-running-process";
      }

      const { stdout, stderr, exitCode } = await execAsync(
        `xcrun simctl launch${flags} "${device}" "${bundleId}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      // simctl launch prints the PID
      const pid = stdout.trim().split(":").pop()?.trim();

      return toolResult(true, { device, bundleId, pid, message: "App launched" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const terminateApp: ToolDefinition = {
  tool: {
    name: "terminate_app",
    description: "Terminate a running app on the simulator by its bundle identifier.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        bundleId: {
          type: "string",
          description: "App bundle identifier",
        },
      },
      required: ["bundleId"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const bundleId = args.bundleId as string;
      const { stderr, exitCode } = await execAsync(
        `xcrun simctl terminate "${device}" "${bundleId}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device, bundleId, message: "App terminated" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const listApps: ToolDefinition = {
  tool: {
    name: "list_apps",
    description: "List all installed apps on a simulator with their bundle IDs and metadata.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const { stdout, stderr, exitCode } = await execAsync(
        `xcrun simctl listapps "${device}" 2>&1`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      // listapps outputs plist format — extract bundle IDs and names
      const apps: Array<{ bundleId: string; name: string }> = [];
      const lines = stdout.split("\n");
      let currentBundleId = "";

      for (const line of lines) {
        const bundleMatch = line.match(/CFBundleIdentifier.*?=\s*"(.+?)"/);
        if (bundleMatch) {
          currentBundleId = bundleMatch[1];
        }
        const nameMatch = line.match(/CFBundleDisplayName.*?=\s*"(.+?)"/);
        if (nameMatch && currentBundleId) {
          apps.push({ bundleId: currentBundleId, name: nameMatch[1] });
          currentBundleId = "";
        }
      }

      // If plist parsing didn't work well, just return raw output
      if (apps.length === 0) {
        return toolResult(true, { raw: stdout.slice(0, 5000) });
      }

      return toolResult(true, apps);
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
