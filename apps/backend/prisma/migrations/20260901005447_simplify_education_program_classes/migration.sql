/*
  Warnings:

  - Added the required column `instructor_id` to the `course_offerings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primary_education_field_id` to the `course_offerings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "attendance_change_histories" ADD COLUMN     "new_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "previous_checked_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "class_schedule_patterns" ADD COLUMN     "class_program_id" UUID;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "actual_ended_at" TIMESTAMPTZ(6),
ADD COLUMN     "actual_started_at" TIMESTAMPTZ(6),
ADD COLUMN     "class_program_id" UUID,
ADD COLUMN     "journal_written_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "class_subjects" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "class_program_id" UUID;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "archived_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "course_offering_subjects" ALTER COLUMN "sequence" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "course_offerings" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "instructor_id" UUID NOT NULL,
ADD COLUMN     "primary_education_field_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "class_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_class_programs_course_class" ON "class_programs"("course_offering_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_programs_class_course" ON "class_programs"("class_id", "course_offering_id");

-- CreateIndex
CREATE INDEX "idx_class_schedule_patterns_program_day" ON "class_schedule_patterns"("class_program_id", "active", "day_of_week");

-- CreateIndex
CREATE INDEX "idx_class_subjects_program_active" ON "class_subjects"("class_program_id", "active");

-- CreateIndex
CREATE INDEX "idx_classes_archived_dates" ON "classes"("archived_at", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_course_offerings_archived_name" ON "course_offerings"("archived_at", "name");

-- CreateIndex
CREATE INDEX "idx_course_offerings_instructor" ON "course_offerings"("instructor_id");

-- AddForeignKey
ALTER TABLE "class_programs" ADD CONSTRAINT "class_programs_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_programs" ADD CONSTRAINT "class_programs_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_program_id_fkey" FOREIGN KEY ("class_program_id") REFERENCES "class_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_patterns" ADD CONSTRAINT "class_schedule_patterns_class_program_id_fkey" FOREIGN KEY ("class_program_id") REFERENCES "class_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_program_id_fkey" FOREIGN KEY ("class_program_id") REFERENCES "class_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_primary_education_field_id_fkey" FOREIGN KEY ("primary_education_field_id") REFERENCES "education_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
