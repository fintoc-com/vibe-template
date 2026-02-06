import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { slackUsers } from './slack-users';

export const slackMessages = pgTable('slack_messages', {
  // Slack message ID (timestamp)
  id: text('id').primaryKey(),

  // Channel info
  channelId: text('channel_id').notNull(),

  // Message content
  text: text('text').notNull(),
  rawText: text('raw_text').notNull(),

  // User info
  userId: text('user_id').notNull().references(() => slackUsers.id),

  // Timestamps
  timestamp: text('timestamp').notNull(),
  datetime: timestamp('datetime').notNull(),

  // Message classification
  type: text('type').notNull(), // 'reminder' | 'bot' | 'user'
  subtype: text('subtype'),

  // User category
  categoryRole: text('category_role').notNull(),
  categoryGroup: text('category_group').notNull(),

  // Topic detection
  topic: text('topic').notNull(),
  topicColor: text('topic_color').notNull(),

  // Summary
  summary: text('summary').notNull(),

  // Archetype detection
  archetype: text('archetype').notNull(),
  archetypeConfidence: text('archetype_confidence').notNull(),

  // Message flags
  isIgnored: boolean('is_ignored').notNull().default(false),

  // Thread info
  threadTs: text('thread_ts'),
  isThreadReply: boolean('is_thread_reply').notNull().default(false),
  parentMessageId: text('parent_message_id').references((): any => slackMessages.id),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
