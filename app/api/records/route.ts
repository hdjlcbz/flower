import { error, json, list, save, journalOwner } from "@/lib/server";
export async function GET() {
  try {
    const { ownerId, canEdit } = await journalOwner();
    return json({
      records: ownerId ? await list(ownerId, canEdit) : [],
      canEdit,
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    return await save(request);
  } catch (e) {
    return error(e);
  }
}
