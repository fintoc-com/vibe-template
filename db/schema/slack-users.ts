import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const slackUsers = pgTable('slack_users', {
  id: text('id').primaryKey(), // Slack user ID
  name: text('name').notNull(),
  realName: text('real_name').notNull(),
  isBot: boolean('is_bot').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
