import { existsSync, mkdirSync } from "fs";
import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult, resolveDevice } from "../utils/exec.js";

const SCREENSHOT_DIR = "/tmp/tarmac/screenshots";
const DIFF_DIR = "/tmp/tarmac/diffs";

export const visualDiff: ToolDefinition = {
  tool: {
    name: "visual_diff",
    description: `Compare two screenshots pixel-by-pixel and generate a diff image highlighting changes. Useful for visual regression testing — take a "before" screenshot, make code changes, take an "after" screenshot, then diff them.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        before: {
          type: "string",
          description: "Path to the 'before' screenshot",
        },
        after: {
          type: "string",
          description: "Path to the 'after' screenshot",
        },
        threshold: {
          type: "number",
          description: "Color difference threshold (0-100). Pixels with difference below this are ignored. Default: 5",
        },
      },
      required: ["before", "after"],
    },
  },
  handler: async (args) => {
    try {
      mkdirSync(DIFF_DIR, { recursive: true });
      const before = args.before as string;
      const after = args.after as string;
      const threshold = (args.threshold as number) ?? 5;

      if (!existsSync(before)) {
        return toolResult(false, null, `Before image not found: ${before}`);
      }
      if (!existsSync(after)) {
        return toolResult(false, null, `After image not found: ${after}`);
      }

      const diffPath = `${DIFF_DIR}/diff_${Date.now()}.png`;

      // Use sips to get image dimensions
      const { stdout: beforeInfo } = await execAsync(
        `sips -g pixelWidth -g pixelHeight "${before}" 2>&1`
      );
      const { stdout: afterInfo } = await execAsync(
        `sips -g pixelWidth -g pixelHeight "${after}" 2>&1`
      );

      // Use ImageMagick if available, fallback to a Python script
      const { exitCode: hasConvert } = await execAsync("which magick");

      if (hasConvert === 0) {
        // ImageMagick compare
        const { stdout: compareOut, exitCode: compareExit } = await execAsync(
          `magick compare -metric AE -fuzz ${threshold}% "${before}" "${after}" "${diffPath}" 2>&1`
        );

        const changedPixels = parseInt(compareOut.trim()) || 0;

        return toolResult(true, {
          diffPath,
          changedPixels,
          beforeDimensions: beforeInfo.trim(),
          afterDimensions: afterInfo.trim(),
          message:
            changedPixels === 0
              ? "Images are identical"
              : `${changedPixels} pixels differ. Diff image saved to ${diffPath}. Use Read tool to view it.`,
        });
      }

      // Fallback: use Python with PIL/Pillow if available
      const { exitCode: hasPillow } = await execAsync(
        "python3 -c 'from PIL import Image' 2>&1"
      );

      if (hasPillow === 0) {
        const pyScript = `
import sys
from PIL import Image, ImageChops, ImageDraw
import json

img1 = Image.open("${before}").convert("RGB")
img2 = Image.open("${after}").convert("RGB")

# Resize if needed
if img1.size != img2.size:
    img2 = img2.resize(img1.size)

diff = ImageChops.difference(img1, img2)

# Count changed pixels
threshold = ${threshold} * 255 / 100
changed = 0
pixels = diff.load()
w, h = diff.size
for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        if max(r, g, b) > threshold:
            changed += 1
            pixels[x, y] = (255, 0, 0)
        else:
            pixels[x, y] = (0, 0, 0)

# Overlay diff on the "after" image
overlay = Image.blend(img2, diff, 0.5)
overlay.save("${diffPath}")

print(json.dumps({"changedPixels": changed, "totalPixels": w * h, "changePercent": round(changed / (w * h) * 100, 2)}))
`;
        const { stdout: pyOut, exitCode: pyExit } = await execAsync(
          `python3 -c '${pyScript.replace(/'/g, "'\\''")}'`
        );

        if (pyExit === 0) {
          const result = JSON.parse(pyOut.trim());
          return toolResult(true, {
            diffPath,
            ...result,
            message:
              result.changedPixels === 0
                ? "Images are identical"
                : `${result.changePercent}% of pixels differ (${result.changedPixels}/${result.totalPixels}). Diff overlay saved to ${diffPath}.`,
          });
        }
      }

      // Last resort: just report dimension comparison
      return toolResult(true, {
        beforeDimensions: beforeInfo.trim(),
        afterDimensions: afterInfo.trim(),
        message:
          "Neither ImageMagick nor Pillow available for pixel diff. Install with: brew install imagemagick OR pip3 install Pillow. You can still visually compare by reading both images.",
        beforePath: before,
        afterPath: after,
      });
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};

export const snapshotCompare: ToolDefinition = {
  tool: {
    name: "snapshot_compare",
    description: `Take a 'before' and 'after' screenshot with a code change in between. Shortcut: takes a screenshot now, waits for you to make changes, then takes another and diffs them.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        device: {
          type: "string",
          description: "Device name, UDID, or 'booted' (default: 'booted')",
        },
        phase: {
          type: "string",
          description:
            "'before' to capture the baseline screenshot, 'after' to capture the comparison and generate diff",
          enum: ["before", "after"],
        },
        name: {
          type: "string",
          description: "Name for this comparison (used for file naming). Default: 'snapshot'",
        },
      },
      required: ["phase"],
    },
  },
  handler: async (args) => {
    try {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      mkdirSync(DIFF_DIR, { recursive: true });
      const device = await resolveDevice((args.device as string) ?? "booted");
      const phase = args.phase as string;
      const name = (args.name as string) ?? "snapshot";

      const filepath = `${SCREENSHOT_DIR}/${name}_${phase}.png`;

      const { exitCode, stderr } = await execAsync(
        `xcrun simctl io "${device}" screenshot "${filepath}"`
      );

      if (exitCode !== 0) {
        return toolResult(false, null, stderr.trim());
      }

      if (phase === "before") {
        return toolResult(true, {
          phase: "before",
          path: filepath,
          message: `Baseline captured. Make your changes, then call snapshot_compare with phase='after' and the same name='${name}'.`,
        });
      }

      // Phase is "after" — also generate the diff
      const beforePath = `${SCREENSHOT_DIR}/${name}_before.png`;
      if (!existsSync(beforePath)) {
        return toolResult(true, {
          phase: "after",
          path: filepath,
          message: "After screenshot captured, but no 'before' screenshot found to compare against.",
        });
      }

      // Trigger visual diff
      const diffResult = await visualDiff.handler({
        before: beforePath,
        after: filepath,
        threshold: 5,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              data: {
                phase: "after",
                beforePath,
                afterPath: filepath,
                diff: JSON.parse(diffResult.content[0].text),
              },
            }, null, 2),
          },
        ],
      };
    } catch (e) {
      return toolResult(false, null, (e as Error).message);
    }
  },
};
