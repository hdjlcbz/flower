import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const journalSettings = sqliteTable("journal_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    cityCode: text("city_code").notNull(),
    date: text("date").notNull(),
    title: text("title").notNull(),
    flower: text("flower").notNull().default(""),
    meaning: text("meaning").notNull().default(""),
    story: text("story").notNull().default(""),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
    writeToken: text("write_token").notNull(),
  },
  (table) => [index("idx_records_owner_date").on(table.ownerId, table.date)],
);
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id),
    ownerId: text("owner_id").notNull(),
    key: text("object_key").notNull(),
    position: integer("position").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
  },
  (table) => [index("idx_photos_record").on(table.recordId, table.position)],
);
