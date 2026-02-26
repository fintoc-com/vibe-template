ALTER TABLE "card_applications" ADD COLUMN "company_commune" text;
UPDATE "card_applications" SET "company_commune" = 'No informada' WHERE "company_commune" IS NULL;
ALTER TABLE "card_applications" ALTER COLUMN "company_commune" SET NOT NULL;