import { createServer, type Server } from "node:http";

export async function createMockServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock server");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    server,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
