CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "class_instructor_assignments"
ADD CONSTRAINT "chk_instructor_assignment_dates"
CHECK (
  "assigned_to" IS NULL
  OR "assigned_from" <= "assigned_to"
);

CREATE UNIQUE INDEX "uq_class_current_instructor"
ON "class_instructor_assignments" ("class_id")
WHERE "assigned_to" IS NULL;

ALTER TABLE "class_instructor_assignments"
ADD CONSTRAINT "ex_class_instructor_assignment_period"
EXCLUDE USING gist (
  "class_id" WITH =,
  daterange(
    "assigned_from",
    COALESCE("assigned_to" + 1, 'infinity'::date),
    '[)'
  ) WITH &&
);