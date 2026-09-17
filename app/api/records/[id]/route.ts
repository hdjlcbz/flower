import { ApiError, db, error, json, save, user, validId } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  try {
    return await save(request, (await params).id);
  } catch (e) {
    return error(e);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const u = await user(request),
      { id } = await params;
    if (!validId(id)) throw new ApiError(400, "记录编号不正确。");
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isInteger(version) || version < 1)
      throw new ApiError(400, "记录版本不正确。");
    const r = await db()
      .prepare(
        "UPDATE records SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL",
      )
      .bind(
        new Date().toISOString(),
        new Date().toISOString(),
        id,
        u.userId,
        version,
      )
      .run();
    if (!r.meta.changes) throw new ApiError(409, "记录已改变，请刷新后重试。");
    return json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
