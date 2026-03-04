import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult } from "../utils/exec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AX_DUMP_PATH = join(__dirname, "..", "..", "helpers", "ax-dump");

interface AXElement {
  role: string;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getUIElements: ToolDefinition = {
  tool: {
    name: "get_ui_elements",
    description: `Query the accessibility tree of the running iOS app in the Simulator. Returns all visible UI elements with their role (button, text, text field, etc.), label, value, and screen position. Use this to find elements before tapping them. Optionally filter by label text.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description:
            "Filter elements by label/value/role containing this text (case-insensitive). Omit to get all elements.",
        },
        maxDepth: {
          type: "number",
          description: "Max depth to traverse the UI tree (default: 15)",
        },
        maxResults: {
          type: "number",
          description: "Max number of elements to return (default: 200)",
        },
      },
    },
  },
  handler: async (args) => {
    const maxDepth = (args.maxDepth as number) ?? 15;
    const maxResults = (args.maxResults as number) ?? 200;
    const filter = args.filter as string | undefined;

    let cmd = `"${AX_DUMP_PATH}" ${maxDepth} ${maxResults}`;
    if (filter) {
      cmd += ` "${filter.replace(/"/g, '\\"')}"`;
    }

    const { stdout, exitCode } = await execAsync(cmd, { timeout: 10_000 });

    if (exitCode !== 0) {
      return toolResult(
        false,
        null,
        stdout.includes("error")
          ? stdout
          : "Failed to query accessibility tree. Is the Simulator running?"
      );
    }

    try {
      const elements: AXElement[] = JSON.parse(stdout);
      return toolResult(true, {
        count: elements.length,
        elements,
      });
    } catch {
      return toolResult(false, null, "Failed to parse accessibility data");
    }
  },
};

export const findAndTap: ToolDefinition = {
  tool: {
    name: "find_and_tap",
    description: `Find a UI element by its label text and tap it. Much more reliable than tapping by coordinates. Searches the accessibility tree for a matching element and clicks its center point. Requires Accessibility permissions.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        label: {
          type: "string",
          description:
            'The label text to search for (case-insensitive, partial match). E.g. "Login", "Submit", "Settings"',
        },
        index: {
          type: "number",
          description:
            "If multiple elements match, tap the Nth one (0-indexed, default: 0)",
        },
        doubleTap: {
          type: "boolean",
          description: "If true, performs a double-tap (default: false)",
        },
      },
      required: ["label"],
    },
  },
  handler: async (args) => {
    const label = args.label as string;
    const index = (args.index as number) ?? 0;
    const doubleTap = (args.doubleTap as boolean) ?? false;

    // Find the element
    const cmd = `"${AX_DUMP_PATH}" 15 200 "${label.replace(/"/g, '\\"')}"`;
    const { stdout, exitCode } = await execAsync(cmd, { timeout: 10_000 });

    if (exitCode !== 0) {
      return toolResult(false, null, "Failed to query accessibility tree");
    }

    let elements: AXElement[];
    try {
      elements = JSON.parse(stdout);
    } catch {
      return toolResult(false, null, "Failed to parse accessibility data");
    }

    if (elements.length === 0) {
      return toolResult(false, null, `No element found matching "${label}"`);
    }

    if (index >= elements.length) {
      return toolResult(
        false,
        null,
        `Only ${elements.length} element(s) matched "${label}", but index ${index} was requested`
      );
    }

    const el = elements[index];

    // Calculate center point of the element (already in screen coordinates)
    const centerX = el.x + Math.round(el.width / 2);
    const centerY = el.y + Math.round(el.height / 2);

    const clickCmd = doubleTap ? "dc" : "c";
    const { exitCode: tapExit, stderr } = await execAsync(
      `cliclick ${clickCmd}:${centerX},${centerY}`
    );

    if (tapExit !== 0) {
      return toolResult(false, null, stderr.trim() || "Tap failed");
    }

    return toolResult(true, {
      action: doubleTap ? "double_tap" : "tap",
      element: {
        role: el.role,
        label: el.label,
        position: { x: centerX, y: centerY },
        bounds: { x: el.x, y: el.y, width: el.width, height: el.height },
      },
      message: `Tapped "${el.label}" (${el.role}) at (${centerX}, ${centerY})`,
    });
  },
};

export const findAndType: ToolDefinition = {
  tool: {
    name: "find_and_type",
    description: `Find a text field by label, tap it to focus, then type text into it. Combines element finding, tapping, and typing in one step.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        label: {
          type: "string",
          description:
            'Label of the text field to find (e.g. "Email", "Password", "Search")',
        },
        text: {
          type: "string",
          description: "The text to type after focusing the field",
        },
        clearFirst: {
          type: "boolean",
          description: "If true, select all and delete existing text before typing (default: false)",
        },
        index: {
          type: "number",
          description: "If multiple fields match, use the Nth one (0-indexed, default: 0)",
        },
      },
      required: ["label", "text"],
    },
  },
  handler: async (args) => {
    const label = args.label as string;
    const text = args.text as string;
    const clearFirst = (args.clearFirst as boolean) ?? false;
    const index = (args.index as number) ?? 0;

    // Find the element
    const cmd = `"${AX_DUMP_PATH}" 15 200 "${label.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(cmd, { timeout: 10_000 });

    let elements: AXElement[];
    try {
      elements = JSON.parse(stdout);
    } catch {
      return toolResult(false, null, "Failed to parse accessibility data");
    }

    // Filter to text-input-like elements first, fall back to any match
    const textElements = elements.filter((e) =>
      ["text field", "text area", "secure text field", "AXTextField", "AXTextArea", "AXSecureTextField", "search field"].some(
        (r) => e.role.toLowerCase().includes(r.toLowerCase())
      )
    );
    const candidates = textElements.length > 0 ? textElements : elements;

    if (candidates.length === 0) {
      return toolResult(false, null, `No element found matching "${label}"`);
    }

    const el = candidates[Math.min(index, candidates.length - 1)];
    const centerX = el.x + Math.round(el.width / 2);
    const centerY = el.y + Math.round(el.height / 2);

    // Tap to focus
    await execAsync(`cliclick c:${centerX},${centerY}`);
    await new Promise((r) => setTimeout(r, 300));

    // Clear existing text if requested
    if (clearFirst) {
      await execAsync("cliclick kd:cmd t:a ku:cmd");
      await new Promise((r) => setTimeout(r, 100));
      await execAsync("cliclick kp:delete");
      await new Promise((r) => setTimeout(r, 100));
    }

    // Type the text
    const { exitCode: typeExit } = await execAsync(
      `cliclick t:'${text.replace(/'/g, "'\\''")}'`
    );

    if (typeExit !== 0) {
      return toolResult(false, null, "Failed to type text");
    }

    return toolResult(true, {
      action: "find_and_type",
      element: { role: el.role, label: el.label },
      text,
      message: `Typed "${text}" into "${el.label}" (${el.role})`,
    });
  },
};
