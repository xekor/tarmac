import type { ToolDefinition } from "./types.js";
import { execAsync, toolResult } from "../utils/exec.js";

export const build: ToolDefinition = {
  tool: {
    name: "build",
    description: `Build an Xcode project or workspace for the iOS simulator. Returns structured build output including errors and warnings. On success, returns the build product path.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Path to .xcodeproj file (use this OR workspace, not both)",
        },
        workspace: {
          type: "string",
          description: "Path to .xcworkspace file (use this OR project, not both)",
        },
        scheme: {
          type: "string",
          description: "Build scheme name (required)",
        },
        configuration: {
          type: "string",
          description: "Build configuration: Debug or Release (default: Debug)",
        },
        destination: {
          type: "string",
          description:
            "Destination simulator (default: 'platform=iOS Simulator,name=iPhone 16')",
        },
        derivedDataPath: {
          type: "string",
          description: "Custom DerivedData path (default: system default)",
        },
      },
      required: ["scheme"],
    },
  },
  handler: async (args) => {
    const scheme = args.scheme as string;
    const configuration = (args.configuration as string) ?? "Debug";
    const destination =
      (args.destination as string) ?? "platform=iOS Simulator,name=iPhone 16";
    const derivedDataPath = args.derivedDataPath as string | undefined;

    let cmd = "xcodebuild";

    if (args.workspace) {
      cmd += ` -workspace "${args.workspace}"`;
    } else if (args.project) {
      cmd += ` -project "${args.project}"`;
    }

    cmd += ` -scheme "${scheme}"`;
    cmd += ` -configuration ${configuration}`;
    cmd += ` -sdk iphonesimulator`;
    cmd += ` -destination '${destination}'`;

    if (derivedDataPath) {
      cmd += ` -derivedDataPath "${derivedDataPath}"`;
    }

    cmd += ` build 2>&1`;

    // Check if xcbeautify is available
    const { exitCode: hasXcbeautify } = await execAsync("which xcbeautify");

    if (hasXcbeautify === 0) {
      cmd += " | xcbeautify --report result-bundle 2>&1";
    }

    const { stdout, stderr, exitCode } = await execAsync(cmd, {
      timeout: 600_000, // 10 min timeout for builds
      maxBuffer: 50 * 1024 * 1024,
    });

    const output = stdout + stderr;

    // Parse errors and warnings
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const line of output.split("\n")) {
      if (line.includes("error:")) {
        errors.push(line.trim());
      } else if (line.includes("warning:")) {
        warnings.push(line.trim());
      }
    }

    if (exitCode !== 0) {
      return toolResult(false, { errors: errors.slice(0, 20), warnings: warnings.slice(0, 10), output: output.slice(-3000) }, "Build failed");
    }

    // Try to find the built .app path
    let appPath: string | null = null;
    const buildDirCmd = derivedDataPath
      ? `find "${derivedDataPath}" -name "*.app" -path "*/Debug-iphonesimulator/*" | head -1`
      : `find ~/Library/Developer/Xcode/DerivedData -name "${scheme}.app" -path "*/Debug-iphonesimulator/*" -newer /tmp/tarmac_build_marker 2>/dev/null | head -1`;

    // Create a marker file for timing
    await execAsync("mkdir -p /tmp/tarmac && touch /tmp/tarmac_build_marker");

    const { stdout: foundApp } = await execAsync(buildDirCmd);
    if (foundApp.trim()) {
      appPath = foundApp.trim();
    }

    return toolResult(true, {
      message: "Build succeeded",
      scheme,
      configuration,
      appPath,
      warnings: warnings.slice(0, 10),
    });
  },
};
