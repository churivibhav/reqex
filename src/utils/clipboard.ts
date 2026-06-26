import clipboard from "clipboardy";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await clipboard.write(text);
    return true;
  } catch {
    if (process.stdout.write(`\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`)) {
      return true;
    }
    return false;
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    return await clipboard.read();
  } catch {
    return null;
  }
}
