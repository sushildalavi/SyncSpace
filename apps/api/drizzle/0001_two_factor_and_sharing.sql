CREATE TYPE "public"."share_role" AS ENUM('editor', 'viewer');--> statement-breakpoint
CREATE TABLE "document_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"role" "share_role" NOT NULL,
	"shared_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_share" ADD CONSTRAINT "document_share_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_share" ADD CONSTRAINT "document_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_share" ADD CONSTRAINT "document_share_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_share_uq" ON "document_share" USING btree ("document_id","email");--> statement-breakpoint
CREATE INDEX "document_share_user_idx" ON "document_share" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_share_email_idx" ON "document_share" USING btree ("email");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");
--> statement-breakpoint
-- Stands in as the author of content left behind by deleted accounts. Created here so nobody can register the address.
INSERT INTO "user" ("id", "name", "email", "email_verified") VALUES ('deleted-user', 'Deleted user', 'deleted-user@syncspace.invalid', false) ON CONFLICT DO NOTHING;
