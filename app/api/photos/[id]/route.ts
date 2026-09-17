import { bucket, db, error, user, ApiError, validId } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await user(),
      { id } = await params;
    if (!validId(id)) throw new ApiError(404, "照片不存在。");
    const p = await db()
      .prepare(
        "SELECT object_key AS key, mime FROM photos WHERE id = ? AND owner_id = ?",
      )
      .bind(id, u.userId)
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
