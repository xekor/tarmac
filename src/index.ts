#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "./tools/types.js";

// Import all tools
import {
  listSimulators,
  bootSimulator,
  shutdownSimulator,
  eraseSimulator,
} from "./tools/simulators.js";
import { build } from "./tools/build.js";
import {
  installApp,
  launchApp,
  terminateApp,
  listApps,
} from "./tools/apps.js";
import {
  screenshot,
  openUrl,
  pushNotification,
  setLocation,
} from "./tools/io.js";
import { setAppearance, getLogs } from "./tools/ui.js";
import { tap, swipe, typeText, pressKey } from "./tools/interact.js";
import { getUIElements, findAndTap, findAndType } from "./tools/accessibility.js";
import { startRecording, stopRecording } from "./tools/video.js";
import { getAppContainer, readAppFile, readUserDefaults } from "./tools/container.js";
import {
  multiScreenshot,
  biometric,
  networkCondition,
  getCrashLogs,
  performanceTrace,
} from "./tools/device.js";
import { visualDiff, snapshotCompare } from "./tools/diff.js";

// Registry of all tools
const tools: Map<string, ToolDefinition> = new Map([
  // Simulator management
  ["list_simulators", listSimulators],
  ["boot_simulator", bootSimulator],
  ["shutdown_simulator", shutdownSimulator],
  ["erase_simulator", eraseSimulator],
  // Build
  ["build", build],
  // App lifecycle
  ["install_app", installApp],
  ["launch_app", launchApp],
  ["terminate_app", terminateApp],
  ["list_apps", listApps],
  // I/O
  ["screenshot", screenshot],
  ["open_url", openUrl],
  ["push_notification", pushNotification],
  ["set_location", setLocation],
  // UI & Logs
  ["set_appearance", setAppearance],
  ["get_logs", getLogs],
  // Interaction (requires Accessibility permissions + cliclick)
  ["tap", tap],
  ["swipe", swipe],
  ["type_text", typeText],
  ["press_key", pressKey],
  // Accessibility-powered interaction
  ["get_ui_elements", getUIElements],
  ["find_and_tap", findAndTap],
  ["find_and_type", findAndType],
  // Video recording
  ["start_recording", startRecording],
  ["stop_recording", stopRecording],
  // App container & data
  ["get_app_container", getAppContainer],
  ["read_app_file", readAppFile],
  ["read_user_defaults", readUserDefaults],
  // Multi-device & advanced
  ["multi_screenshot", multiScreenshot],
  ["biometric", biometric],
  ["network_condition", networkCondition],
  ["get_crash_logs", getCrashLogs],
  ["performance_trace", performanceTrace],
  // Visual diffing
  ["visual_diff", visualDiff],
  ["snapshot_compare", snapshotCompare],
]);

class TarmacServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "tarmac", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(tools.values()).map((t) => t.tool),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolDef = tools.get(toolName);

      if (!toolDef) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      }

      try {
        return await toolDef.handler(
          (request.params.arguments as Record<string, unknown>) ?? {}
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: message }),
            },
          ],
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new TarmacServer();
server.run().catch(console.error);
