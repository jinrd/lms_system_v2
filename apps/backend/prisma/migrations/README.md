# 손으로 작성한 SQL 마이그레이션 — 검증·롤백

기획안 §32에 따라, Prisma 스키마로 표현할 수 없어 손으로 작성한 SQL
마이그레이션은 적용 검증 쿼리와 롤백 절차를 함께 둔다. 이미 적용된
마이그레이션 파일은 체크섬 때문에 수정할 수 없으므로, 아래에 정리한다.
새 마이그레이션(`20260906020000` 이후)은 파일 안 주석에 직접 둔다.

---

## 20260902233104_add_question_template_checks

문제은행·시험 템플릿 테이블의 한 행짜리 값 범위 CHECK 제약 15개.

### 적용 검증

```sql
SELECT conname FROM pg_constraint
 WHERE contype = 'c' AND conname LIKE 'chk_%'
   AND conrelid::regclass::text IN (
     'question_bank', 'question_options', 'question_accepted_answers',
     'exam_templates', 'exam_template_parts',
     'exam_template_questions', 'exam_template_practical_criteria'
   );
-- 기대: 15행
```

위반 INSERT가 거부되는지 확인(각 1건):

```sql
-- default_score <= 0
INSERT INTO question_bank (subject_id, type, prompt, default_score, difficulty, active, updated_at)
SELECT id, 'SHORT_ANSWER', 'x', 0, 'EASY', false, now() FROM subjects LIMIT 1;
-- ERROR: chk_question_bank_default_score_positive

-- 필기 파트에 파일 제한
INSERT INTO exam_template_parts
  (exam_template_id, type, total_score, pass_score, duration_minutes,
   default_open_offset_days, default_open_days, max_files, updated_at)
SELECT id, 'WRITTEN', 100, 60, 60, 0, 7, 3, now() FROM exam_templates LIMIT 1;
-- ERROR: chk_exam_template_parts_written_columns
```

### 롤백

```sql
ALTER TABLE "exam_template_practical_criteria"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_practical_criteria_name_not_blank",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_practical_criteria_max_score_positive";
ALTER TABLE "exam_template_questions"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_questions_score_positive";
ALTER TABLE "exam_template_parts"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_practical_columns",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_written_columns",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_open_offset_not_negative",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_open_days_positive",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_pass_score_range",
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_total_score_positive";
ALTER TABLE "exam_templates"
  DROP CONSTRAINT IF EXISTS "chk_exam_templates_default_open_days_positive",
  DROP CONSTRAINT IF EXISTS "chk_exam_templates_name_not_blank";
ALTER TABLE "question_accepted_answers"
  DROP CONSTRAINT IF EXISTS "chk_question_accepted_answers_normalized_not_blank",
  DROP CONSTRAINT IF EXISTS "chk_question_accepted_answers_text_not_blank";
ALTER TABLE "question_options"
  DROP CONSTRAINT IF EXISTS "chk_question_options_content_not_blank";
ALTER TABLE "question_bank"
  DROP CONSTRAINT IF EXISTS "chk_question_bank_prompt_not_blank",
  DROP CONSTRAINT IF EXISTS "chk_question_bank_default_score_positive";
```

---

## 20260906010000_add_exam_template_activation_triggers

활성 시험 템플릿의 점수 합계 = 파트 총점을 커밋 시점에 보장하는 지연 제약
트리거 4개(+ 공용 함수 `check_exam_template_part_totals`).

### 적용 검증

```sql
SELECT tgname FROM pg_trigger
 WHERE tgname IN (
   'exam_template_questions_totals_check',
   'exam_template_criteria_totals_check',
   'exam_template_parts_totals_check',
   'exam_templates_activation_check'
 );
-- 기대: 4행

SELECT proname FROM pg_proc
 WHERE proname IN (
   'check_exam_template_part_totals',
   'trg_check_exam_template_questions',
   'trg_check_exam_template_criteria',
   'trg_check_exam_template_parts',
   'trg_check_exam_template_activation'
 );
-- 기대: 5행
```

동작 확인:

```sql
-- 활성 템플릿의 문제 배점을 직접 바꾸면 커밋 시 거부된다.
UPDATE exam_template_questions SET score = score + 1
 WHERE exam_template_part_id IN (
   SELECT p.id FROM exam_template_parts p
   JOIN exam_templates t ON t.id = p.exam_template_id
  WHERE t.active AND p.type = 'WRITTEN'
 );
-- ERROR: active exam template part ... score sum ... does not match total ...
```

### 롤백

```sql
DROP TRIGGER IF EXISTS "exam_templates_activation_check" ON "exam_templates";
DROP TRIGGER IF EXISTS "exam_template_parts_totals_check" ON "exam_template_parts";
DROP TRIGGER IF EXISTS "exam_template_criteria_totals_check" ON "exam_template_practical_criteria";
DROP TRIGGER IF EXISTS "exam_template_questions_totals_check" ON "exam_template_questions";
DROP FUNCTION IF EXISTS trg_check_exam_template_activation();
DROP FUNCTION IF EXISTS trg_check_exam_template_parts();
DROP FUNCTION IF EXISTS trg_check_exam_template_criteria();
DROP FUNCTION IF EXISTS trg_check_exam_template_questions();
DROP FUNCTION IF EXISTS check_exam_template_part_totals(UUID);
```

---

## 20260906020000_add_question_and_part_type_integrity_triggers

문제 유형별 보기·정답 개수 지연 제약 트리거 + 필기·실기 하위 데이터 혼입
차단 트리거. 검증·롤백은 해당 `migration.sql` 파일 하단 주석에 있다.
