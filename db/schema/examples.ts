import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const examples = pgTable('examples', {
  id: serial('id').primaryKey(),
  field: text('field').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Example = typeof examples.$inferSelect;
export type NewExample = typeof examples.$inferInsert;
