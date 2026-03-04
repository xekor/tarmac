import { mkdirSync } from "fs";
import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

const SCREENSHOT_DIR = "/tmp/tarmac/screenshots";

export const screenshot: ToolDefinition = {
  tool: {
    name: "screenshot",
    description:
      "Capture a screenshot of the simulator screen. Returns the file path to the PNG image. Claude can then read this image to analyze the UI.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        filename: {
          type: "string",
          description: "Custom filename (default: timestamp-based)",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const device = await resolveDevice((args.device as string) ?? "booted");
      const filename =
        (args.filename as string) ?? `screenshot_${Date.now()}.png`;
      const filepath = `${SCREENSHOT_DIR}/${filename}`;

      const { stderr, exitCode } = await execAsync(
        `xcrun simctl io "${device}" screenshot "${filepath}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, {
        path: filepath,
        message: "Screenshot captured. Use the Read tool to view this image.",
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const openUrl: ToolDefinition = {
  tool: {
    name: "open_url",
    description:
      "Open a URL or deep link in the simulator. Useful for testing deep links, universal links, or navigating to specific app screens.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        url: {
          type: "string",
          description: "URL or deep link to open (e.g. 'https://example.com' or 'myapp://screen')",
        },
      },
      required: ["url"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const url = args.url as string;
      const { stderr, exitCode } = await execAsync(
        `xcrun simctl openurl "${device}" "${url}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device, url, message: "URL opened" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const pushNotification: ToolDefinition = {
  tool: {
    name: "push_notification",
    description:
      "Send a simulated push notification to an app on the simulator. Provide the notification payload as a JSON object.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        bundleId: {
          type: "string",
          description: "Target app's bundle identifier",
        },
        payload: {
          type: "object",
          description:
            'Push notification payload JSON (e.g. {"aps": {"alert": {"title": "Hello", "body": "World"}}})',
        },
      },
      required: ["bundleId", "payload"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const bundleId = args.bundleId as string;
      const payload = JSON.stringify(args.payload);

      const { stderr, exitCode } = await execAsync(
        `echo '${payload.replace(/'/g, "'\\''")}' | xcrun simctl push "${device}" "${bundleId}" -`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, { device, bundleId, message: "Push notification sent" });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const setLocation: ToolDefinition = {
  tool: {
    name: "set_location",
    description:
      "Set the simulated GPS location on a simulator. Useful for testing location-based features.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        latitude: {
          type: "number",
          description: "Latitude coordinate",
        },
        longitude: {
          type: "number",
          description: "Longitude coordinate",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const lat = args.latitude as number;
      const lon = args.longitude as number;
      const { stderr, exitCode } = await execAsync(
        `xcrun simctl location "${device}" set ${lat},${lon}`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      return toolResult(true, {
        device,
        latitude: lat,
        longitude: lon,
        message: "Location set",
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
