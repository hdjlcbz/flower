import { bucket, db, error, list, user } from "@/lib/server";
export async function GET() {
  try {
    const u = await user(),
      records = await list(u.userId);
    const rows = (
      await db()
        .prepare("SELECT id,object_key AS key FROM photos WHERE owner_id = ?")
        .bind(u.userId)
        .all<{ id: string; key: string }>()
    ).results;
    const keys = new Map(rows.map((p) => [p.id, p.key]));
    async function* lines() {
      yield JSON.stringify({
        type: "manifest",
        format: "flower-map",
        version: 1,
        createdAt: new Date().toISOString(),
      }) + "\n";
      for (const record of records) {
        yield JSON.stringify({ type: "record", record }) + "\n";
        for (const photo of record.photos) {
          const key = keys.get(photo.id),
            o = key ? await bucket().get(key) : null;
          if (!o) throw new Error("Backup photo missing");
          const a = new Uint8Array(await o.arrayBuffer());
          let binary = "";
          for (let i = 0; i < a.length; i += 8192)
            binary += String.fromCharCode(...a.subarray(i, i + 8192));
          yield JSON.stringify({
            type: "photo",
            recordId: record.id,
            photoId: photo.id,
            mime: photo.mime,
            data: btoa(binary),
          }) + "\n";
        }
      }
      yield JSON.stringify({ type: "complete", records: records.length }) +
        "\n";
    }
    const iterator = lines(),
      encoder = new TextEncoder();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(next.value));
        } catch (e) {
          controller.error(e);
        }
      },
      async cancel() {
        await iterator.return(undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition":
          'attachment; filename="flower-map-backup-' +
          new Date().toISOString().slice(0, 10) +
          '.ndjson"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return error(e);
  }
}
