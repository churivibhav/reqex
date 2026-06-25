import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { cli } from "httpyac";

import { initEngineProviders, parseFile, resolveRegionAtLine, sendRegion } from "../src/engine/index.js";
import { createMockServer } from "./helpers/mock-server.js";

test("resolveRegionAtLine picks innermost request region", async () => {
  cli.initFileProvider();
  initEngineProviders();
  const fixture = path.join(process.cwd(), "test/fixtures/multi-request.http");
  const content = await readFile(fixture, "utf8");
  const parsed = await parseFile(fixture, async () => content, process.cwd());

  const getRegion = resolveRegionAtLine(parsed.regions, 1);
  assert.ok(getRegion);
  assert.equal(getRegion.method, "GET");

  const postRegion = parsed.regions.find((region) => region.method === "POST");
  assert.ok(postRegion);
  const createRegion = resolveRegionAtLine(parsed.regions, postRegion.startLine + 2);
  assert.equal(createRegion?.id, postRegion.id);
});

test("sendRegion executes against mock HTTP server", async () => {
  cli.initFileProvider();
  initEngineProviders();

  const server = await createMockServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const filePath = path.join(process.cwd(), "test/fixtures/mock-request.http");
  const content = `GET ${server.url}/hello\n`;
  await import("node:fs/promises").then((fs) => fs.writeFile(filePath, content, "utf8"));

  const parsed = await parseFile(filePath, async () => content, process.cwd());
  const region = parsed.regions.find((r) => r.hasRequest);
  assert.ok(region);

  const result = await sendRegion({
    filePath,
    regionId: region!.id,
    workingDir: process.cwd(),
  });

  assert.equal(result.statusCode, 200);
  assert.match(result.body, /"ok"\s*:\s*true/u);

  await server.close();
});
