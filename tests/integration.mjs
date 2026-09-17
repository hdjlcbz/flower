import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { validateBackup, importBackup } from "../lib/backup.ts";
const base = process.env.FLOWER_MAP_TEST_URL || "http://localhost:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Integration tests must run against a local test database.");
const headers = { Cookie: "__sites_local_auth=1" },
  ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
await fs.mkdir(".sites-runtime", { recursive: true });
await fs.writeFile(".sites-runtime/test-ids.json", JSON.stringify(ids));
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
const form = (record, image = true) => {
  const f = new FormData();
  f.set("record", JSON.stringify(record));
  if (image)
    f.append("photos", new Blob([png], { type: "image/png" }), "test.png");
  return f;
};
async function request(path, init = {}) {
  return fetch(base + path, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
}
const date = new Date().toISOString().slice(0, 10),
  draft = {
    id: ids[0],
    cityCode: "330100",
    date,
    title: "测试记录 A",
    flower: "郁金香",
    meaning: "测试寓意",
    story: "此内容仅用于本地验证",
    keepPhotos: [],
  };
const cleanup = async () => {
  const quoted = ids.map((id) => "'" + id + "'").join(",");
  await fs.writeFile(
    ".sites-runtime/integration-cleanup.sql",
    "DELETE FROM photos WHERE owner_id='local_seedy' AND record_id IN (" +
      quoted +
      ");\nDELETE FROM records WHERE owner_id='local_seedy' AND id IN (" +
      quoted +
      ");\n",
  );
  await promisify(execFile)(process.execPath, [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    ".sites-runtime/integration-cleanup.sql",
  ]);
};

try {
  assert.equal((await fetch(base + "/api/records")).status, 401);
  assert.equal(
    (
      await request("/api/records", {
        method: "POST",
        headers: { Origin: "https://untrusted.invalid" },
        body: form(draft),
      })
    ).status,
    403,
  );
  const badDate = await request("/api/records", {
    method: "POST",
    body: form({ ...draft, date: "2026-99-99" }),
  });
  assert.equal(badDate.status, 400);
  assert.equal(
    (await request("/api/records", { method: "POST", body: form(draft) }))
      .status,
    201,
  );
  assert.equal(
    (
      await (
        await request("/api/records", { method: "POST", body: form(draft) })
      ).json()
    ).skipped,
    true,
  );
  assert.equal(
    (
      await request("/api/records", {
        method: "POST",
        body: form({ ...draft, id: ids[1], title: "测试记录 B" }, false),
      })
    ).status,
    201,
  );
  let listed = (await (await request("/api/records")).json()).records;
  assert.equal(
    listed.filter((r) => ids.includes(r.id) && !r.deletedAt).length,
    2,
  );
  let record = listed.find((r) => r.id === ids[0]);
  assert.equal(record.photos.length, 1);
  const photoId = record.photos[0].id;
  assert.equal((await request("/api/photos/" + photoId)).status, 200);
  assert.equal((await fetch(base + "/api/photos/" + photoId)).status, 401);
  const edited = {
    ...draft,
    title: "已编辑的测试记录",
    version: record.version,
    keepPhotos: [photoId],
    coverPhoto: "new-0",
  };
  assert.equal(
    (
      await request("/api/records/" + ids[0], {
        method: "PUT",
        body: form(edited),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/records/" + ids[0], {
        method: "PUT",
        body: form({ ...edited, coverPhoto: photoId }, false),
      })
    ).status,
    409,
  );
  listed = (await (await request("/api/records")).json()).records;
  record = listed.find((r) => r.id === ids[0]);
  assert.equal(record.photos.length, 2);
  assert.notEqual(record.photos[0].id, photoId);
  assert.equal(record.title, edited.title);
  assert.equal(
    (
      await request("/api/records/" + ids[0] + "?version=" + record.version, {
        method: "DELETE",
      })
    ).status,
    200,
  );
  listed = (await (await request("/api/records")).json()).records;
  assert.ok(listed.find((r) => r.id === ids[0]).deletedAt);
  assert.equal(
    listed.filter((r) => ids.includes(r.id) && !r.deletedAt).length,
    1,
  );
  assert.equal(
    (await request("/api/records/" + ids[0] + "/restore", { method: "POST" }))
      .status,
    200,
  );
  const cities = JSON.parse(await fs.readFile("data/cities.json", "utf8"));
  const paris = cities.find(
    (c) => c.name === "Paris" && c.countryCode === "FRA",
  );
  assert.ok(paris);
  assert.equal(
    (
      await request("/api/records", {
        method: "POST",
        body: form(
          { ...draft, id: ids[2], cityCode: paris.code, title: "测试海外记录" },
          false,
        ),
      })
    ).status,
    201,
  );
  const backup = await (await request("/api/backup")).text();
  const lines = backup
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  assert.equal(lines[0].type, "manifest");
  assert.equal(lines.at(-1).type, "complete");
  assert.equal(
    lines.filter((r) => r.type === "record" && ids.includes(r.record.id))
      .length,
    3,
  );
  assert.equal(
    lines.filter((r) => r.type === "photo" && ids.includes(r.recordId)).length,
    2,
  );
  await fs.writeFile(".sites-runtime/test-backup.ndjson", backup);
  console.log(
    "PASS: authentication, source checks, invalid dates, city records, idempotency, image storage, version conflicts, trash restore, overseas records, complete photo backup.",
  );

  await cleanup();
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, init = {}) =>
    nativeFetch(new URL(url, base), {
      ...init,
      headers: { ...headers, ...init.headers },
    });
  try {
    const incomplete = new File(
      [
        lines
          .slice(0, -1)
          .map((r) => JSON.stringify(r))
          .join("\n") + "\n",
      ],
      "bad.ndjson",
    );
    await assert.rejects(() => validateBackup(incomplete), /不完整/);
    const file = new File([backup], "backup.ndjson");
    const imported = await importBackup(file, () => {});
    assert.equal(imported.added, 3);
    const restored = (
      await (await request("/api/records")).json()
    ).records.filter((r) => ids.includes(r.id));
    assert.equal(restored.length, 3);
    assert.equal(
      restored.reduce((n, r) => n + r.photos.length, 0),
      2,
    );
    for (const r of restored)
      for (const p of r.photos)
        assert.equal((await request("/api/photos/" + p.id)).status, 200);
    assert.equal((await importBackup(file, () => {})).added, 0);
    console.log(
      "PASS: backup validation, photo round-trip restoration and duplicate imports.",
    );
  } finally {
    globalThis.fetch = nativeFetch;
    await cleanup();
  }
} finally {
  await cleanup();
}
