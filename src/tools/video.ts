import { mkdirSync } from "fs";
import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

const VIDEO_DIR = "/tmp/tarmac/videos";

// Track active recordings by device
const activeRecordings = new Map<string, { pid: number; path: string }>();

export const startRecording: ToolDefinition = {
  tool: {
    name: "start_recording",
    description:
      "Start recording the simulator screen to a video file. Call stop_recording to finish and save. Only one recording per device at a time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        filename: {
          type: "string",
          description: "Custom filename (default: timestamp-based). Will be saved as .mov",
        },
        codec: {
          type: "string",
          description: "Video codec: 'h264' or 'hevc' (default: 'hevc')",
          enum: ["h264", "hevc"],
        },
      },
    },
  },
  handler: async (args) => {
    try {
      mkdirSync(VIDEO_DIR, { recursive: true });
      const device = await resolveDevice((args.device as string) ?? "booted");
      const filename = (args.filename as string) ?? `recording_${Date.now()}.mov`;
      const filepath = `${VIDEO_DIR}/${filename.endsWith(".mov") ? filename : filename + ".mov"}`;
      const codec = (args.codec as string) ?? "hevc";

      if (activeRecordings.has(device)) {
        return toolResult(false, null, "A recording is already in progress for this device. Call stop_recording first.");
      }

      // Start recording in background using spawn
      const { exec: execRaw } = await import("child_process");
      const proc = execRaw(
        `xcrun simctl io "${device}" recordVideo --codec=${codec} --force "${filepath}"`,
        { timeout: 600_000 }
      );

      if (proc.pid) {
        activeRecordings.set(device, { pid: proc.pid, path: filepath });
      }

      // Wait for recording to actually start
      await new Promise((r) => setTimeout(r, 1000));

      return toolResult(true, {
        device,
        path: filepath,
        message: "Recording started. Call stop_recording when done.",
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const stopRecording: ToolDefinition = {
  tool: {
    name: "stop_recording",
    description: "Stop an active screen recording and save the video file.",
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
      const recording = activeRecordings.get(device);

      if (!recording) {
        // Try killing any simctl recordVideo process as fallback
        await execAsync("pkill -f 'simctl io.*recordVideo'");
        return toolResult(true, { message: "Sent stop signal to any active recordings" });
      }

      // Send SIGINT to stop recording gracefully
      process.kill(recording.pid, "SIGINT");
      activeRecordings.delete(device);

      // Wait for the file to be finalized
      await new Promise((r) => setTimeout(r, 2000));

      return toolResult(true, {
        device,
        path: recording.path,
        message: `Recording saved to ${recording.path}`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
