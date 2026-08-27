CREATE TABLE "student_pinned_module" (
	"student_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "student_pinned_module_student_id_module_id_pk" PRIMARY KEY("student_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "student_pinned_module" ADD CONSTRAINT "student_pinned_module_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_pinned_module" ADD CONSTRAINT "student_pinned_module_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_pinned_module" ADD CONSTRAINT "student_pinned_module_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;