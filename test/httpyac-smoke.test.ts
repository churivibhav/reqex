import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { cli, store } from "httpyac";

test("httpyac smoke import and parse", async () => {
  cli.initFileProvider();
  const fixture = path.join(process.cwd(), "test/fixtures/multi-request.http");
  const storeInstance = new store.HttpFileStore();
  const httpFile = await storeInstance.getOrCreate(
    fixture,
    async () => readFile(fixture, "utf8"),
    0,
    { workingDir: process.cwd() },
  );

  assert.ok(httpFile.httpRegions.length >= 3);
  const requestRegions = httpFile.httpRegions.filter((region) => region.request);
  assert.equal(requestRegions.length, 3);
});
