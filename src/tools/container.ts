import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

export const getAppContainer: ToolDefinition = {
  tool: {
    name: "get_app_container",
    description:
      "Get the file system path to an installed app's container on the simulator. Use this to inspect app data, UserDefaults, databases, caches, etc.",
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
        container: {
          type: "string",
          description:
            "Container type: 'app' (the .app bundle), 'data' (Documents, Library, etc), 'groups' (shared app groups). Default: 'data'",
          enum: ["app", "data", "groups"],
        },
      },
      required: ["bundleId"],
    },
  },
  handler: async (args) => {
    try {
      const device = await resolveDevice((args.device as string) ?? "booted");
      const bundleId = args.bundleId as string;
      const container = (args.container as string) ?? "data";

      const { stdout, stderr, exitCode } = await execAsync(
        `xcrun simctl get_app_container "${device}" "${bundleId}" ${container}`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim() || "Failed to get app container");
      }

      const containerPath = stdout.trim();

      // List the top-level contents
      const { stdout: listing } = await execAsync(`ls -la "${containerPath}" 2>&1`);

      return toolResult(true, {
        device,
        bundleId,
        container,
        path: containerPath,
        contents: listing.trim(),
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const readAppFile: ToolDefinition = {
  tool: {
    name: "read_app_file",
    description:
      "Read a file from an app's container. Useful for inspecting UserDefaults plists, SQLite databases, log files, etc. Use get_app_container first to find the base path.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
        asPlist: {
          type: "boolean",
          description: "If true, convert plist to readable XML format (default: false)",
        },
      },
      required: ["path"],
    },
  },
  handler: async (args) => {
    try {
      const filePath = args.path as string;
      const asPlist = (args.asPlist as boolean) ?? false;

      if (asPlist || filePath.endsWith(".plist")) {
        const { stdout, exitCode } = await execAsync(
          `plutil -convert xml1 -o - "${filePath}" 2>&1`
        );
        if (exitCode !== 0) {
          return toolResult(false, null, stdout.trim());
        }
        return toolResult(true, { path: filePath, format: "plist-xml", content: stdout });
      }

      // Check if it's a SQLite database
      const { stdout: fileType } = await execAsync(`file "${filePath}"`);
      if (fileType.includes("SQLite")) {
        const { stdout: tables } = await execAsync(
          `sqlite3 "${filePath}" ".tables" 2>&1`
        );
        const { stdout: schema } = await execAsync(
          `sqlite3 "${filePath}" ".schema" 2>&1`
        );
        return toolResult(true, {
          path: filePath,
          format: "sqlite",
          tables: tables.trim(),
          schema: schema.trim().slice(0, 5000),
          hint: "Use read_app_file with a SQL query via the 'query' tool or read specific tables",
        });
      }

      // Read as text
      const { stdout, exitCode } = await execAsync(
        `cat "${filePath}" 2>&1 | head -500`
      );
      if (exitCode !== 0) {
        return toolResult(false, null, stdout.trim());
      }

      return toolResult(true, {
        path: filePath,
        format: "text",
        content: stdout.slice(0, 10000),
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const readUserDefaults: ToolDefinition = {
  tool: {
    name: "read_user_defaults",
    description:
      "Read an app's UserDefaults plist directly. Shortcut that finds the app container and reads the preferences plist.",
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

      const { stdout: containerPath, exitCode } = await execAsync(
        `xcrun simctl get_app_container "${device}" "${bundleId}" data`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, "Failed to get app container. Is the app installed?");
      }

      const prefsPath = `${containerPath.trim()}/Library/Preferences/${bundleId}.plist`;
      const { stdout, exitCode: readExit } = await execAsync(
        `plutil -convert xml1 -o - "${prefsPath}" 2>&1`
      );

      if (readExit !== 0) {
        // Try to list what plist files exist
        const { stdout: listing } = await execAsync(
          `ls "${containerPath.trim()}/Library/Preferences/" 2>&1`
        );
        return toolResult(false, null, `Plist not found at expected path. Available: ${listing.trim()}`);
      }

      return toolResult(true, {
        device,
        bundleId,
        path: prefsPath,
        content: stdout,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
