import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

/**
 * Get the Simulator window's position and content area offset.
 * We need to translate simulator screen coordinates to macOS screen coordinates.
 */
async function getSimulatorWindowInfo(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  toolbarHeight: number;
}> {
  // Use AppleScript to get window position and size
  const script = `
    tell application "System Events"
      tell process "Simulator"
        set frontmost to true
        tell window 1
          set pos to position
          set sz to size
          return (item 1 of pos) & "," & (item 2 of pos) & "," & (item 1 of sz) & "," & (item 2 of sz)
        end tell
      end tell
    end tell
  `;

  const { stdout, exitCode } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);

  if (exitCode !== 0) {
    throw new Error(
      "Cannot get Simulator window position. Grant Accessibility permissions in System Settings > Privacy & Security > Accessibility for Terminal/your IDE."
    );
  }

  const [x, y, width, height] = stdout.trim().split(",").map(Number);
  // The simulator window has a toolbar/titlebar at the top (~28px for standard, ~52px with device chrome)
  const toolbarHeight = 52;

  return { x, y, width, height, toolbarHeight };
}

/**
 * Convert simulator screen coordinates (as a percentage or absolute)
 * to macOS screen coordinates for cliclick.
 */
async function toScreenCoords(
  simX: number,
  simY: number,
  usePercentage: boolean
): Promise<{ screenX: number; screenY: number }> {
  const win = await getSimulatorWindowInfo();
  const contentWidth = win.width;
  const contentHeight = win.height - win.toolbarHeight;

  let absX: number;
  let absY: number;

  if (usePercentage) {
    // Percentage of the simulator screen (0-100)
    absX = Math.round(win.x + (simX / 100) * contentWidth);
    absY = Math.round(win.y + win.toolbarHeight + (simY / 100) * contentHeight);
  } else {
    // Absolute pixel offset within the simulator content area
    absX = Math.round(win.x + simX);
    absY = Math.round(win.y + win.toolbarHeight + simY);
  }

  return { screenX: absX, screenY: absY };
}

export const tap: ToolDefinition = {
  tool: {
    name: "tap",
    description: `Tap at a location on the simulator screen. Coordinates can be percentages (0-100) of the screen or absolute pixels within the simulator content area. Use 'screenshot' first to identify the coordinates of UI elements. Requires Accessibility permissions for Terminal/IDE.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        x: {
          type: "number",
          description: "X coordinate (percentage 0-100 by default, or pixels if usePixels is true)",
        },
        y: {
          type: "number",
          description: "Y coordinate (percentage 0-100 by default, or pixels if usePixels is true)",
        },
        usePixels: {
          type: "boolean",
          description: "If true, x and y are treated as pixel offsets instead of percentages (default: false)",
        },
        doubleTap: {
          type: "boolean",
          description: "If true, performs a double-tap (default: false)",
        },
      },
      required: ["x", "y"],
    },
  },
  handler: async (args) => {
    try {
      const x = args.x as number;
      const y = args.y as number;
      const usePixels = (args.usePixels as boolean) ?? false;
      const doubleTap = (args.doubleTap as boolean) ?? false;

      const { screenX, screenY } = await toScreenCoords(x, y, !usePixels);
      const cmd = doubleTap ? "dc" : "c";

      const { exitCode, stderr } = await execAsync(
        `cliclick ${cmd}:${screenX},${screenY}`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim() || "Tap failed. Check Accessibility permissions.");
      }

      return toolResult(true, {
        action: doubleTap ? "double_tap" : "tap",
        simCoords: { x, y },
        screenCoords: { x: screenX, y: screenY },
        message: `Tapped at (${x}, ${y})`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const swipe: ToolDefinition = {
  tool: {
    name: "swipe",
    description: `Swipe on the simulator screen from one point to another. Coordinates can be percentages (0-100) or pixels. Use for scrolling, pulling to refresh, dismissing sheets, etc. Requires Accessibility permissions.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        startX: {
          type: "number",
          description: "Starting X coordinate",
        },
        startY: {
          type: "number",
          description: "Starting Y coordinate",
        },
        endX: {
          type: "number",
          description: "Ending X coordinate",
        },
        endY: {
          type: "number",
          description: "Ending Y coordinate",
        },
        usePixels: {
          type: "boolean",
          description: "If true, coordinates are pixels instead of percentages (default: false)",
        },
        duration: {
          type: "number",
          description: "Duration of swipe in milliseconds (default: 300)",
        },
      },
      required: ["startX", "startY", "endX", "endY"],
    },
  },
  handler: async (args) => {
    try {
      const usePixels = (args.usePixels as boolean) ?? false;
      const duration = (args.duration as number) ?? 300;

      const start = await toScreenCoords(
        args.startX as number,
        args.startY as number,
        !usePixels
      );
      const end = await toScreenCoords(
        args.endX as number,
        args.endY as number,
        !usePixels
      );

      // Use drag-down, drag-move, drag-up with a wait for smooth swipe
      const steps = Math.max(5, Math.round(duration / 30));
      const deltaX = (end.screenX - start.screenX) / steps;
      const deltaY = (end.screenY - start.screenY) / steps;

      let cmd = `cliclick dd:${start.screenX},${start.screenY}`;
      for (let i = 1; i <= steps; i++) {
        const mx = Math.round(start.screenX + deltaX * i);
        const my = Math.round(start.screenY + deltaY * i);
        cmd += ` w:${Math.round(duration / steps)} dm:${mx},${my}`;
      }
      cmd += ` du:${end.screenX},${end.screenY}`;

      const { exitCode, stderr } = await execAsync(cmd);

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim() || "Swipe failed. Check Accessibility permissions.");
      }

      return toolResult(true, {
        action: "swipe",
        from: { x: args.startX, y: args.startY },
        to: { x: args.endX, y: args.endY },
        message: "Swipe performed",
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const typeText: ToolDefinition = {
  tool: {
    name: "type_text",
    description: `Type text into the currently focused field in the simulator. The simulator must be frontmost and a text field must be focused. Requires Accessibility permissions.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text to type",
        },
      },
      required: ["text"],
    },
  },
  handler: async (args) => {
    try {
      const text = args.text as string;

      // Ensure simulator is frontmost
      await execAsync(
        `osascript -e 'tell application "Simulator" to activate'`
      );
      // Small delay for focus
      await new Promise((r) => setTimeout(r, 200));

      // Use cliclick to type
      const { exitCode, stderr } = await execAsync(
        `cliclick t:'${text.replace(/'/g, "'\\''")}'`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim() || "Type failed. Check Accessibility permissions.");
      }

      return toolResult(true, {
        action: "type",
        text,
        message: `Typed "${text}"`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const pressKey: ToolDefinition = {
  tool: {
    name: "press_key",
    description: `Press a keyboard key in the simulator. Use for Return/Enter, Escape, Tab, arrow keys, etc. Requires Accessibility permissions.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description:
            "Key to press. Supported: 'return', 'escape', 'tab', 'delete', 'space', 'up', 'down', 'left', 'right', 'home', or a modifier combo like 'cmd+a', 'cmd+c', 'cmd+v'",
        },
      },
      required: ["key"],
    },
  },
  handler: async (args) => {
    try {
      const key = args.key as string;

      // Ensure simulator is frontmost
      await execAsync(
        `osascript -e 'tell application "Simulator" to activate'`
      );
      await new Promise((r) => setTimeout(r, 100));

      // Map friendly names to cliclick key codes
      const keyMap: Record<string, string> = {
        return: "kp:return",
        enter: "kp:return",
        escape: "kp:escape",
        esc: "kp:escape",
        tab: "kp:tab",
        delete: "kp:delete",
        backspace: "kp:delete",
        space: "kp:space",
        up: "kp:arrow-up",
        down: "kp:arrow-down",
        left: "kp:arrow-left",
        right: "kp:arrow-right",
        home: "kp:home",
        end: "kp:end",
      };

      let cliclickCmd: string;

      if (key.includes("+")) {
        // Modifier combo like cmd+a
        const parts = key.split("+");
        const modifier = parts[0].toLowerCase();
        const char = parts[1];

        const modMap: Record<string, string> = {
          cmd: "cmd",
          command: "cmd",
          ctrl: "ctrl",
          control: "ctrl",
          alt: "alt",
          option: "alt",
          shift: "shift",
        };

        const mod = modMap[modifier] ?? modifier;
        cliclickCmd = `kd:${mod} t:${char} ku:${mod}`;
      } else {
        cliclickCmd = keyMap[key.toLowerCase()] ?? `kp:${key}`;
      }

      const { exitCode, stderr } = await execAsync(`cliclick ${cliclickCmd}`);

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim() || "Key press failed.");
      }

      return toolResult(true, {
        action: "press_key",
        key,
        message: `Pressed "${key}"`,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
