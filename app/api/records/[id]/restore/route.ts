import { ApiError, db, error, json, user, validId } from "@/lib/server";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await user(request),
      { id } = await params;
    if (!validId(id)) throw new ApiError(400, "记录编号不正确。");
    const r = await db()
      .prepare(
        "UPDATE records SET deleted_at = NULL,updated_at = ?,version = version + 1 WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL",
      )
      .bind(new Date().toISOString(), id, u.userId)
      .run();
    if (!r.meta.changes) throw new ApiError(404, "回收站中没有这条记录。");
    return json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
