import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const cardApplications = pgTable('card_applications', {
  id: serial('id').primaryKey(),
  merchantExternalId: text('merchant_external_id'),
  companyName: text('company_name').notNull(),
  companyRut: text('company_rut').notNull(),
  companyAddress: text('company_address').notNull(),
  companyCommune: text('company_commune').notNull(),
  companyWebsiteUrl: text('company_website_url'),
  monthlyTransactions: integer('monthly_transactions'),
  averageTicketClp: integer('average_ticket_clp'),
  contactEmail: text('contact_email').notNull(),
  legalRepName: text('legal_rep_name').notNull(),
  legalRepRut: text('legal_rep_rut').notNull(),
  legalRepBirthDate: text('legal_rep_birth_date').notNull(),
  mcc: text('mcc'),
  regcheckStatus: text('regcheck_status').notNull(),
  regcheckRiskLevel: text('regcheck_risk_level'),
  regcheckTaxStartDate: text('regcheck_tax_start_date'),
  regcheckProfileUrl: text('regcheck_profile_url'),
  decision: text('decision').notNull(),
  decisionReason: text('decision_reason').notNull(),
  customerMessage: text('customer_message').notNull(),
  rawInput: jsonb('raw_input').notNull(),
  rawRegcheck: jsonb('raw_regcheck'),
  raiApprovalStatus: text('rai_approval_status').notNull().default('not_required'),
  raiReviewedBySlackUserId: text('rai_reviewed_by_slack_user_id'),
  raiReviewedAt: timestamp('rai_reviewed_at'),
  slackChannelId: text('slack_channel_id'),
  slackMessageTs: text('slack_message_ts'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type CardApplication = typeof cardApplications.$inferSelect;
export type NewCardApplication = typeof cardApplications.$inferInsert;
