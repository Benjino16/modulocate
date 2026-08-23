ALTER TABLE "module_in_category" DROP CONSTRAINT "module_in_category_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "module_in_category" DROP CONSTRAINT "module_in_category_category_id_module_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "module_in_date" DROP CONSTRAINT "module_in_date_module_id_modules_id_fk";
--> statement-breakpoint
ALTER TABLE "module_in_date" DROP CONSTRAINT "module_in_date_date_id_dates_id_fk";
--> statement-breakpoint
ALTER TABLE "module_in_category" ADD CONSTRAINT "module_in_category_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_category" ADD CONSTRAINT "module_in_category_category_id_module_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."module_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_date" ADD CONSTRAINT "module_in_date_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_in_date" ADD CONSTRAINT "module_in_date_date_id_dates_id_fk" FOREIGN KEY ("date_id") REFERENCES "public"."dates"("id") ON DELETE cascade ON UPDATE no action;