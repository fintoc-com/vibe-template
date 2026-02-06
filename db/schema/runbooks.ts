import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Runbooks generated from Slack threads
 * Documentation created by analyzing conversation threads
 */
export const runbooks = pgTable('runbooks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // Runbook content
  title: text('title').notNull(),
  content: text('content').notNull(), // Markdown format

  // Source information
  threadTs: text('thread_ts').notNull(), // Slack thread timestamp
  channelId: text('channel_id').notNull(),

  // Generation metadata
  prompt: text('prompt'), // Optional user instructions
  model: text('model').notNull().default('claude-sonnet-4-5'), // Model used

  // User info
  createdBy: text('created_by').notNull(), // User email who created it

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
