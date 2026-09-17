import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import cities from "@/data/cities.json";
import type { FlowerRecord, RecordDraft } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB) throw new ApiError(503, "记录服务暂不可用，请稍后重试。");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new ApiError(503, "照片服务暂不可用，请稍后重试。");
  return env.BUCKET;
}
export async function user(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new ApiError(403, "请求来源不正确。");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiError(403, "请求来源不正确。");
  }
  const u = await getChatGPTUser();
  if (!u) throw new ApiError(401, "请先登录，再查看或维护记录。");
  if (!isOwner(u.email))
    throw new ApiError(403, "只有网站所有者可以维护记录。");
  const { ownerId } = await journalOwner();
  if (ownerId !== u.userId) throw new ApiError(403, "相册维护身份不匹配。");
  return u;
}
export function isOwner(email: string) {
  const ownerEmail = (env as unknown as { FLOWER_MAP_OWNER_EMAIL?: string })
    .FLOWER_MAP_OWNER_EMAIL;
  return !!ownerEmail && email.toLowerCase() === ownerEmail.toLowerCase();
}
export async function journalOwner() {
  const u = await getChatGPTUser();
  const canEdit = !!u && isOwner(u.email);
  if (canEdit) {
    await db()
      .prepare(
        "INSERT OR IGNORE INTO journal_settings (key, value) VALUES ('owner_id', ?)",
      )
      .bind(u!.userId)
      .run();
  }
  const setting = await db()
    .prepare("SELECT value FROM journal_settings WHERE key = 'owner_id'")
    .first<{ value: string }>();
  if (canEdit && setting && setting.value !== u!.userId)
    throw new ApiError(403, "相册维护身份不匹配，请联系网站所有者。");
  return { ownerId: setting?.value, canEdit };
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function error(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  console.error(
    "Flower map storage operation failed",
    e instanceof Error ? e.name : "unknown",
  );
  return json({ error: "操作没有完成，输入已保留，请稍后重试。" }, 503);
}
export function validId(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}
export async function list(owner: string, includeDeleted = true) {
  const result = await db()
    .prepare(
      "SELECT id, city_code AS cityCode, date, title, flower, meaning, story, deleted_at AS deletedAt, created_at AS createdAt, updated_at AS updatedAt, version FROM records WHERE owner_id = ?" +
        (includeDeleted ? "" : " AND deleted_at IS NULL") +
        " ORDER BY date DESC, created_at DESC",
    )
    .bind(owner)
    .all<FlowerRecord>();
  const photos = await db()
    .prepare(
      "SELECT id, record_id AS recordId, position, mime, size FROM photos WHERE owner_id = ? ORDER BY position",
    )
    .bind(owner)
    .all<{
      id: string;
      recordId: string;
      position: number;
      mime: string;
      size: number;
    }>();
  const byRecord = new Map<string, typeof photos.results>();
  for (const p of photos.results) {
    const a = byRecord.get(p.recordId) || [];
    a.push(p);
    byRecord.set(p.recordId, a);
  }
  return result.results.map((r) => ({
    ...r,
    photos: (byRecord.get(r.id) || []).map(({ recordId, ...p }) => p),
  }));
}
export async function multipart(request: Request) {
  const max = 16 * 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new ApiError(413, "图片总大小超出限制。");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "缺少记录内容。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "图片总大小超出限制。");
    }
    chunks.push(r.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }
  return new Response(body, {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
export async function parse(request: Request) {
  const form = await multipart(request);
  let draft: RecordDraft;
  try {
    draft = JSON.parse(String(form.get("record")));
  } catch {
    throw new ApiError(400, "记录格式不正确。");
  }
  if (
    !draft ||
    typeof draft !== "object" ||
    !validId(draft.id) ||
    !cities.some((c) => c.code === draft.cityCode)
  )
    throw new ApiError(400, "请选择有效的城市。");
  for (const [key, max] of [
    ["title", 100],
    ["flower", 150],
    ["meaning", 500],
    ["story", 5000],
  ] as const) {
    if (typeof draft[key] !== "string" || draft[key].length > max)
      throw new ApiError(400, "文字内容超出长度限制。");
    draft[key] = draft[key].trim();
  }
  if (!draft.title) throw new ApiError(400, "请填写记录名称。");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    (isNaN(new Date(draft.date + "T00:00:00Z").getTime())
      ? ""
      : new Date(draft.date + "T00:00:00Z").toISOString()
    ).slice(0, 10) !== draft.date ||
    draft.date >
      new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  )
    throw new ApiError(400, "请选择今天或之前的有效送花日期。");
  if (
    !Array.isArray(draft.keepPhotos) ||
    draft.keepPhotos.some((p) => !validId(p)) ||
    new Set(draft.keepPhotos).size !== draft.keepPhotos.length
  )
    throw new ApiError(400, "照片列表不正确。");
  const files = form
    .getAll("photos")
    .filter((x): x is File => typeof x !== "string");
  if (files.length + draft.keepPhotos.length > 8)
    throw new ApiError(400, "每条记录最多保存8张照片。");
  if (
    draft.coverPhoto !== undefined &&
    (typeof draft.coverPhoto !== "string" ||
      !(
        draft.keepPhotos.includes(draft.coverPhoto) ||
        (/^new-\d+$/.test(draft.coverPhoto) &&
          Number(draft.coverPhoto.slice(4)) < files.length)
      ))
  )
    throw new ApiError(400, "封面照片不正确。");
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > 2 * 1024 * 1024)
      throw new ApiError(400, "每张照片最多2MB，请重新选择。");
    const magic = new Uint8Array(await f.slice(0, 12).arrayBuffer());
    const jpg = magic[0] === 255 && magic[1] === 216 && magic[2] === 255,
      png =
        magic[0] === 137 &&
        magic[1] === 80 &&
        magic[2] === 78 &&
        magic[3] === 71,
      webp =
        String.fromCharCode(...magic.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...magic.slice(8, 12)) === "WEBP";
    if (!(
      (f.type === "image/jpeg" && jpg) ||
      (f.type === "image/png" && png) ||
      (f.type === "image/webp" && webp)
    ))
      throw new ApiError(400, "仅支持JPEG、PNG和WebP图片。");
  }
  if (total > 12 * 1024 * 1024) throw new ApiError(400, "照片总大小最多12MB。");
  return { draft, files };
}
export async function save(request: Request, id?: string) {
  const u = await user(request),
    { draft, files } = await parse(request);
  if (id && (id !== draft.id || !Number.isInteger(draft.version)))
    throw new ApiError(400, "记录版本不正确。");
  const old = await db()
    .prepare(
      "SELECT id, version, deleted_at AS deletedAt FROM records WHERE id = ? AND owner_id = ?",
    )
    .bind(draft.id, u.userId)
    .first<{ id: string; version: number; deletedAt: string | null }>();
  if (id && (!old || old.deletedAt)) throw new ApiError(404, "记录不存在。");
  if (!id && old) return json({ id: old.id, skipped: true });
  if (!id && draft.keepPhotos.length)
    throw new ApiError(400, "新记录不应引用已有照片。");
  if (id && old!.version !== draft.version)
    throw new ApiError(409, "记录已被修改，请刷新后再保存。");
  const oldPhotos = old
    ? (
        await db()
          .prepare(
            "SELECT id, object_key AS key FROM photos WHERE record_id = ? AND owner_id = ?",
          )
          .bind(draft.id, u.userId)
          .all<{ id: string; key: string }>()
      ).results
    : [];
  if (draft.keepPhotos.some((p) => !oldPhotos.some((x) => x.id === p)))
    throw new ApiError(400, "照片不属于这条记录。");
  const uploaded: { id: string; key: string; mime: string; size: number }[] =
      [],
    token = crypto.randomUUID(),
    now = new Date().toISOString();
  let committed = false;
  try {
    for (const f of files) {
      const pid = crypto.randomUUID(),
        key = u.userId + "/" + draft.id + "/" + pid;
      await bucket().put(key, f.stream(), {
        httpMetadata: { contentType: f.type },
      });
      uploaded.push({ id: pid, key, mime: f.type, size: f.size });
    }
    const sql = id
      ? "UPDATE records SET city_code=?,date=?,title=?,flower=?,meaning=?,story=?,updated_at=?,version=version+1,write_token=? WHERE id=? AND owner_id=? AND version=? AND deleted_at IS NULL"
      : "INSERT INTO records (city_code,date,title,flower,meaning,story,updated_at,write_token,id,owner_id,created_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO NOTHING";
    const first = db()
      .prepare(sql)
      .bind(
        draft.cityCode,
        draft.date,
        draft.title,
        draft.flower,
        draft.meaning,
        draft.story,
        now,
        token,
        draft.id,
        u.userId,
        id ? draft.version : now,
      );
    let order = [...draft.keepPhotos, ...uploaded.map((p) => p.id)];
    const cover = draft.coverPhoto?.startsWith("new-")
      ? uploaded[Number(draft.coverPhoto.slice(4))]?.id
      : draft.coverPhoto;
    if (cover) order = [cover, ...order.filter((id) => id !== cover)];
    const statements = [first];
    if (id) {
      const removed = oldPhotos.filter((p) => !draft.keepPhotos.includes(p.id));
      for (const p of removed)
        statements.push(
          db()
            .prepare(
              "DELETE FROM photos WHERE id = ? AND EXISTS (SELECT 1 FROM records WHERE id = ? AND write_token = ?)",
            )
            .bind(p.id, draft.id, token),
        );
      draft.keepPhotos.forEach((pid, pos) =>
        statements.push(
          db()
            .prepare(
              "UPDATE photos SET position = ? WHERE id = ? AND EXISTS (SELECT 1 FROM records WHERE id = ? AND write_token = ?)",
            )
            .bind(order.indexOf(pid), pid, draft.id, token),
        ),
      );
    }
    uploaded.forEach((p, i) =>
      statements.push(
        db()
          .prepare(
            "INSERT INTO photos (id,record_id,owner_id,object_key,position,mime,size) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id = ? AND write_token = ?)",
          )
          .bind(
            p.id,
            draft.id,
            u.userId,
            p.key,
            order.indexOf(p.id),
            p.mime,
            p.size,
            draft.id,
            token,
          ),
      ),
    );
    const results = await db().batch(statements);
    if (results[0].meta.changes === 0) {
      if (id) throw new ApiError(409, "记录已被修改，请刷新后再保存。");
      return json({ id: draft.id, skipped: true });
    }
    committed = true;
    for (const p of oldPhotos.filter((p) => !draft.keepPhotos.includes(p.id)))
      await bucket()
        .delete(p.key)
        .catch(() => {});
    return json({ id: draft.id }, id ? 200 : 201);
  } finally {
    if (!committed)
      for (const p of uploaded)
        await bucket()
          .delete(p.key)
          .catch(() => {});
  }
}
