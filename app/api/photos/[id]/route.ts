import {
  bucket,
  db,
  error,
  journalOwner,
  ApiError,
  validId,
} from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { ownerId, canEdit } = await journalOwner(),
      { id } = await params;
    if (!validId(id)) throw new ApiError(404, "照片不存在。");
    const p = await db()
      .prepare(
        "SELECT p.object_key AS key, p.mime FROM photos p JOIN records r ON p.record_id = r.id AND p.owner_id = r.owner_id WHERE p.id = ? AND p.owner_id = ?" +
          (canEdit ? "" : " AND r.deleted_at IS NULL"),
      )
      .bind(id, ownerId ?? "")
      .first<{ key: string; mime: string }>();
    if (!p) throw new ApiError(404, "照片不存在。");
    const object = await bucket().get(p.key);
    if (!object) throw new ApiError(404, "照片暂时无法读取。");
    return new Response(object.body, {
      headers: {
        "Content-Type": p.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return error(e);
  }
}
