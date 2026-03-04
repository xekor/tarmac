import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

export const listSimulators: ToolDefinition = {
  tool: {
    name: "list_simulators",
    description:
      "List all available iOS simulator devices, their state (Booted/Shutdown), and runtime versions. Use this to find device names or UDIDs for other commands.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description: 'Filter by state: "booted", "shutdown", or "all" (default: "all")',
        },
      },
    },
  },
  handler: async (args) => {
    const filter = (args.filter as string) ?? "all";
    const { stdout, exitCode } = await execAsync("xcrun simctl list devices -j");

    if (exitCode !== 0) {
      return toolResult(false, null, "Failed to list simulators");
    }

    const parsed = JSON.parse(stdout);
    const result: Array<{
      name: string;
      udid: string;
      state: string;
      runtime: string;
      isAvailable: boolean;
    }> = [];

    for (const [runtime, devices] of Object.entries(parsed.devices)) {
      const runtimeName = runtime.replace("com.apple.CoreSimulator.SimRuntime.", "");
      for (const d of devices as Array<Record<string, unknown>>) {
        if (!d.isAvailable) continue;
        if (filter === "booted" && d.state !== "Booted") continue;
        if (filter === "shutdown" && d.state !== "Shutdown") continue;

        result.push({
          name: d.name as string,
          udid: d.udid as string,
          state: d.state as string,
          runtime: runtimeName,
          isAvailable: d.isAvailable as boolean,
        });
      }
    }

    return toolResult(true, result);
  },
};

export const bootSimulator: ToolDefinition = {
  tool: {
    name: "boot_simulator",
    description:
      "Boot an iOS simulator. Accepts a device name (e.g. 'iPhone 16') or UDID. The simulator must be shut down.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name or UDID to boot",
        },
      },
      required: ["device"],
    },
  },
  handler: async (args) => {
    try {
      const udid = await resolveDevice(args.device as string);
      const { stderr, exitCode } = await execAsync(`xcrun simctl boot "${udid}"`);

      if (exitCode !== 0) {
        if (stderr.includes("current state: Booted")) {
          return toolResult(true, { device: udid, message: "Already booted" });
        }
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device: udid, message: "Simulator booted" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const shutdownSimulator: ToolDefinition = {
  tool: {
    name: "shutdown_simulator",
    description: "Shut down a running iOS simulator. Use 'booted' to shut down the currently booted device.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted'",
        },
      },
      required: ["device"],
    },
  },
  handler: async (args) => {
    try {
      const udid = await resolveDevice(args.device as string);
      const { stderr, exitCode } = await execAsync(`xcrun simctl shutdown "${udid}"`);

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device: udid, message: "Simulator shut down" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const eraseSimulator: ToolDefinition = {
  tool: {
    name: "erase_simulator",
    description:
      "Erase a simulator's contents and settings, resetting it to factory state. The simulator must be shut down first.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted'",
        },
      },
      required: ["device"],
    },
  },
  handler: async (args) => {
    try {
      const udid = await resolveDevice(args.device as string);
      const { stderr, exitCode } = await execAsync(`xcrun simctl erase "${udid}"`);

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device: udid, message: "Simulator erased" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
