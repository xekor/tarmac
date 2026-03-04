import { exec } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execAsync(
  command: string,
  options: { timeout?: number; maxBuffer?: number } = {}
): Promise<ExecResult> {
  const { timeout = 300_000, maxBuffer = 10 * 1024 * 1024 } = options;

  return new Promise((resolve) => {
    exec(command, { timeout, maxBuffer }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        exitCode: error?.code ?? 0,
      });
    });
  });
}

export function toolResult(
  success: boolean,
  data: unknown,
  error?: string
): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(success ? { success, data } : { success, error }, null, 2),
      },
    ],
  };
}

export async function resolveDevice(device: string): Promise<string> {
  if (device === "booted" || /^[0-9A-F-]{36}$/i.test(device)) {
    return device;
  }

  // Resolve device name to UDID
  const { stdout } = await execAsync("xcrun simctl list devices -j");
  const parsed = JSON.parse(stdout);
  const devices = parsed.devices;

  for (const runtime of Object.keys(devices)) {
    for (const d of devices[runtime]) {
      if (d.name === device && d.isAvailable) {
        return d.udid;
      }
    }
  }

  throw new Error(`Device "${device}" not found. Use list_simulators to see available devices.`);
}
