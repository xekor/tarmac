import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

export const setAppearance: ToolDefinition = {
  tool: {
    name: "set_appearance",
    description:
      "Get or set the simulator's appearance mode (light/dark). Call without 'mode' to get current appearance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        mode: {
          type: "string",
          description: "Appearance mode: 'light' or 'dark'. Omit to get current mode.",
          enum: ["light", "dark"],
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const mode = args.mode as string | undefined;

      if (mode) {
        const { stderr, exitCode } = await execAsync(
          `xcrun simctl ui "${device}" appearance ${mode}`
        );

        if (exitCode !== 0) {
          return toolResult(false, null, stderr.trim());
        }

        return toolResult(true, { device, appearance: mode, message: `Appearance set to ${mode}` });
      }

      // Get current appearance
      const { stdout, exitCode } = await execAsync(
        `xcrun simctl ui "${device}" appearance`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, "Failed to get appearance");
      }

      return toolResult(true, { device, appearance: stdout.trim() });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const getLogs: ToolDefinition = {
  tool: {
    name: "get_logs",
    description:
      "Capture device logs from the simulator for a specified duration. Useful for debugging runtime issues, crashes, and app behavior. Use 'predicate' to filter logs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        duration: {
          type: "number",
          description: "Duration in seconds to capture logs (default: 5, max: 30)",
        },
        predicate: {
          type: "string",
          description:
            "NSPredicate filter for logs (e.g. 'subsystem == \"com.munkee.InstaSize\"' or 'eventMessage contains \"error\"')",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const duration = Math.min((args.duration as number) ?? 5, 30);
      const predicate = args.predicate as string | undefined;

      let cmd = `xcrun simctl spawn "${device}" log stream --style compact --timeout ${duration}`;

      if (predicate) {
        cmd += ` --predicate '${predicate.replace(/'/g, "'\\''")}'`;
      }

      const { stdout, exitCode } = await execAsync(cmd, {
        timeout: (duration + 5) * 1000,
      });

      if (exitCode !== 0 && !stdout) {
        return toolResult(false, null, "Failed to capture logs");
      }

      // Trim to a reasonable size
      const lines = stdout.split("\n");
      const truncated = lines.length > 200;
      const output = truncated ? lines.slice(-200).join("\n") : stdout;

      return toolResult(true, {
        device,
        duration,
        lineCount: lines.length,
        truncated,
        logs: output,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
