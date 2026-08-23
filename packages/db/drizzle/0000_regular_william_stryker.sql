CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"log" text NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "category_in_sub_rule" (
	"sub_rule_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "category_in_sub_rule_sub_rule_id_category_id_pk" PRIMARY KEY("sub_rule_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "category_sort_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_sort_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"student_id" uuid,
	"user_id" text,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hidden_in_vote" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_in_category" (
	"module_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "module_in_category_module_id_category_id_pk" PRIMARY KEY("module_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "module_in_date" (
	"module_id" uuid NOT NULL,
	"date_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "module_in_date_module_id_date_id_pk" PRIMARY KEY("module_id","date_id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"permanent_name" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"teacher" text,
	"picture_url" text,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	"schedule_label" text,
	"date_sort_id" uuid,
	"category_sort_id" uuid
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phase" text DEFAULT 'setup' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_blocked_category" (
	"rule_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "rule_blocked_category_rule_id_category_id_pk" PRIMARY KEY("rule_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "rule_blocked_date" (
	"rule_id" uuid NOT NULL,
	"date_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "rule_blocked_date_rule_id_date_id_pk" PRIMARY KEY("rule_id","date_id")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"module_count" integer NOT NULL,
	"priority" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rule_id" uuid
);
--> statement-breakpoint
CREATE TABLE "student_in_group" (
	"student_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "student_in_group_student_id_group_id_pk" PRIMARY KEY("student_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "student_in_module" (
	"student_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "student_in_module_student_id_module_id_pk" PRIMARY KEY("student_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "student_preferences" (
	"student_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"preference" integer NOT NULL,
	CONSTRAINT "student_preferences_student_id_module_id_pk" PRIMARY KEY("student_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_2" text,
	"sign_in_code" text,
	"vote_status" text NOT NULL,
	"vote_opened_at" timestamp with time zone,
	"vote_submitted_at" timestamp with time zone,
	"vote_code_sent_at" timestamp with time zone,
	"rule_id" uuid,
	CONSTRAINT "students_sign_in_code_unique" UNIQUE("sign_in_code")
);
--> statement-breakpoint
CREATE TABLE "sub_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_in_sub_rule" ADD CONSTRAINT "category_in_sub_rule_sub_rule_id_sub_rules_id_fk" FOREIGN KEY ("sub_rule_id") REFERENCES "public"."sub_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_in_sub_rule" ADD CONSTRAINT "category_in_sub_rule_category_id_module_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."module_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_in_sub_rule" ADD CONSTRAINT "category_in_sub_rule_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_sort_tags" ADD CONSTRAINT "category_sort_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_sort_tags" ADD CONSTRAINT "date_sort_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dates" ADD CONSTRAINT "dates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_categories" ADD CONSTRAINT "module_categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_category" ADD CONSTRAINT "module_in_category_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_category" ADD CONSTRAINT "module_in_category_category_id_module_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."module_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_category" ADD CONSTRAINT "module_in_category_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_date" ADD CONSTRAINT "module_in_date_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_date" ADD CONSTRAINT "module_in_date_date_id_dates_id_fk" FOREIGN KEY ("date_id") REFERENCES "public"."dates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_date" ADD CONSTRAINT "module_in_date_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_date_sort_id_date_sort_tags_id_fk" FOREIGN KEY ("date_sort_id") REFERENCES "public"."date_sort_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_category_sort_id_category_sort_tags_id_fk" FOREIGN KEY ("category_sort_id") REFERENCES "public"."category_sort_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_category" ADD CONSTRAINT "rule_blocked_category_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_category" ADD CONSTRAINT "rule_blocked_category_category_id_module_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."module_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_category" ADD CONSTRAINT "rule_blocked_category_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_date" ADD CONSTRAINT "rule_blocked_date_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_date" ADD CONSTRAINT "rule_blocked_date_date_id_dates_id_fk" FOREIGN KEY ("date_id") REFERENCES "public"."dates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_blocked_date" ADD CONSTRAINT "rule_blocked_date_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_group" ADD CONSTRAINT "student_in_group_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_group" ADD CONSTRAINT "student_in_group_group_id_student_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."student_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_group" ADD CONSTRAINT "student_in_group_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_module" ADD CONSTRAINT "student_in_module_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_module" ADD CONSTRAINT "student_in_module_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_in_module" ADD CONSTRAINT "student_in_module_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_preferences" ADD CONSTRAINT "student_preferences_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_preferences" ADD CONSTRAINT "student_preferences_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_preferences" ADD CONSTRAINT "student_preferences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_rules" ADD CONSTRAINT "sub_rules_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_rules" ADD CONSTRAINT "sub_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_project_id_key_idx" ON "settings" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "students_project_id_email_idx" ON "students" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");