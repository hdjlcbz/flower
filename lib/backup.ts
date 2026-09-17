import type { FlowerRecord, RecordDraft } from "./types";
export async function* backupLines(file: File) {
  const reader = file.stream().getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const r = await reader.read();
      buffer += r.done
        ? decoder.decode()
        : decoder.decode(r.value, { stream: true });
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (line.trim()) yield JSON.parse(line);
      }
      if (buffer.length > 4 * 1024 * 1024)
        throw new Error("备份中有过大的条目。");
      if (r.done) break;
    }
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    reader.releaseLock();
  }
}
export async function validateBackup(file: File) {
  let first = true,
    complete = false,
    count = 0,
    current: FlowerRecord | null = null,
    photos = new Set<string>(),
    ids = new Set<string>();
  function check() {
    if (
      current &&
      (current.photos.length !== photos.size ||
        current.photos.some((p) => !photos.has(p.id)))
    )
      throw new Error("备份缺少照片，未开始导入。");
  }
  for await (const row of backupLines(file)) {
    if (complete) throw new Error("备份结束后有多余内容。");
    if (first) {
      first = false;
      if (
        row.type !== "manifest" ||
        row.format !== "flower-map" ||
        row.version !== 1
      )
        throw new Error("请选择送花地图导出的备份文件。");
      continue;
    }
    if (row.type === "record") {
      check();
      current = row.record;
      if (
        !current ||
        !Array.isArray(current.photos) ||
        current.photos.length > 8 ||
        typeof current.id !== "string" ||
        ids.has(current.id)
      )
        throw new Error("备份记录格式不正确。");
      for (const k of [
        "cityCode",
        "date",
        "title",
        "flower",
        "meaning",
        "story",
      ] as const)
        if (typeof current[k] !== "string")
          throw new Error("备份记录格式不正确。");
      ids.add(current.id);
      photos = new Set();
      count++;
    } else if (row.type === "photo") {
      if (
        !current ||
        row.recordId !== current.id ||
        !current.photos.some((p) => p.id === row.photoId) ||
        photos.has(row.photoId) ||
        typeof row.data !== "string" ||
        row.data.length > 2800000 ||
        !["image/jpeg", "image/png", "image/webp"].includes(row.mime) ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(row.data)
      )
        throw new Error("备份照片格式不正确。");
      photos.add(row.photoId);
    } else if (row.type === "complete") {
      check();
      if (row.records !== count) throw new Error("备份记录数量不一致。");
      complete = true;
    } else throw new Error("备份包含无法识别的条目。");
  }
  if (!complete) throw new Error("备份不完整，未开始导入。");
  return count;
}
export async function importBackup(
  file: File,
  onProgress: (count: number) => void,
) {
  await validateBackup(file);
  let current: FlowerRecord | null = null,
    files: File[] = [],
    done = 0,
    added = 0;
  async function commit() {
    if (!current) return;
    const draft: RecordDraft = { ...current, keepPhotos: [] };
    const form = new FormData();
    form.set("record", JSON.stringify(draft));
    files.forEach((f) => form.append("photos", f));
    const response = await fetch("/api/records", {
        method: "POST",
        body: form,
      }),
      value = (await response.json()) as { error?: string; skipped?: boolean };
    if (!response.ok)
      throw new Error(
        "已处理" +
          done +
          "条。" +
          value.error +
          " 可再次导入，已存在的记录会跳过。",
      );
    if (!value.skipped) {
      added++;
      if (current.deletedAt) {
        const r = await fetch("/api/records/" + current.id + "?version=1", {
          method: "DELETE",
        });
        if (!r.ok) throw new Error("回收站记录未恢复状态，请检查这条记录。");
      }
    }
    done++;
    onProgress(done);
  }
  for await (const row of backupLines(file)) {
    if (row.type === "record") {
      await commit();
      current = row.record;
      files = [];
    } else if (row.type === "photo") {
      const raw = atob(row.data),
        bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      files.push(new File([bytes], row.photoId + ".jpg", { type: row.mime }));
    } else if (row.type === "complete") await commit();
  }
  return { added, skipped: done - added };
}
