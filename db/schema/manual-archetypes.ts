import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

/**
 * Manual archetype definitions
 * User-defined archetypes that take priority over BERT classification
 */
export const manualArchetypes = pgTable('manual_archetypes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // Archetype info
  name: text('name').notNull().unique(),
  description: text('description').notNull(),

  // Keywords for matching (array of strings)
  keywords: jsonb('keywords').notNull().$type<string[]>(),

  // Optional: example message IDs that should match this archetype
  // Useful for future ML re-training with user feedback
  exampleMessageIds: jsonb('example_message_ids').$type<string[]>(),

  // Priority level (higher = checked first)
  priority: integer('priority').notNull().default(100),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Manual corrections to message classifications
 * Tracks when users manually override BERT classifications
 */
export const manualArchetypeCorrections = pgTable('manual_archetype_corrections', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // Message being corrected
  messageId: text('message_id').notNull(),

  // Classification change
  originalArchetype: text('original_archetype').notNull(),
  correctedArchetype: text('corrected_archetype').notNull(),

  // User who made the correction
  correctedBy: text('corrected_by').notNull(),

  // Optional: reason for correction
  reason: text('reason'),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
