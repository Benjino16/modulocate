import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  capacity: integer("capacity").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
