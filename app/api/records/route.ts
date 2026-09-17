import { error, json, list, save, user } from "@/lib/server";
export async function GET() {
  try {
    const u = await user();
    return json({
      records: await list(u.userId),
      user: { email: u.email, name: u.displayName },
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
