#!/usr/bin/env bash
#
# 스키마·마이그레이션·시드 무결성 게이트다(기획안 §32, §33.1~4).
#
# 임시 DB를 새로 만들어 전체 마이그레이션·시드를 적용하고 다음을 확인한 뒤
# 그 DB를 지운다. 개발·운영 DB는 절대 건드리지 않는다.
#
#  1. 빈 DB에 전체 마이그레이션이 한 번에 성공한다.
#  2. Prisma Client 생성과 nest build가 성공한다.
#  3. 필수 시드(교육 분야·약관·시스템 설정·최초 관리자 등)가 생성된다.
#  4. 시드를 다시 실행해도 행 수가 늘거나 상태가 역행하지 않는다(멱등성).
#  5. prisma/verify.sql 이 한 줄도 내지 않는다(부분 유니크·트리거·exclusion 제약).
#
# 사용:  pnpm --filter @lms/backend verify:schema
set -euo pipefail

cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL 환경변수가 필요합니다.}"

PROBE_DB="lms_verify_$$"
url() {
  SRC="$DATABASE_URL" DB="$1" node -e '
    const u = new URL(process.env.SRC);
    u.pathname = "/" + process.env.DB;
    u.search = "";
    process.stdout.write(u.toString());
  '
}
ADMIN_URL="$(url postgres)"
PROBE_URL="$(url "$PROBE_DB")"
PRISMA_URL="${PROBE_URL}?schema=public"

cleanup() {
  psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$PROBE_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▶ 임시 DB 생성: $PROBE_DB"
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$PROBE_DB\""

echo "▶ (1) 전체 마이그레이션 적용"
DATABASE_URL="$PRISMA_URL" npx prisma migrate deploy

echo "▶ (2) Prisma Client 생성 + 빌드"
npx prisma generate >/dev/null
pnpm build >/dev/null

# 재실행 시 행 수를 비교할 안정 테이블들.
COUNT_SQL="SELECT string_agg(t || '=' || n, ',' ORDER BY t) FROM (
  SELECT 'education_fields' t, count(*) n FROM education_fields
  UNION ALL SELECT 'subjects', count(*) FROM subjects
  UNION ALL SELECT 'course_offerings', count(*) FROM course_offerings
  UNION ALL SELECT 'classes', count(*) FROM classes
  UNION ALL SELECT 'enrollments', count(*) FROM enrollments
  UNION ALL SELECT 'question_bank', count(*) FROM question_bank
  UNION ALL SELECT 'exam_templates', count(*) FROM exam_templates
  UNION ALL SELECT 'exams', count(*) FROM exams
  UNION ALL SELECT 'terms_documents', count(*) FROM terms_documents
  UNION ALL SELECT 'system_settings', count(*) FROM system_settings
  UNION ALL SELECT 'users', count(*) FROM users
) s"

echo "▶ (3) 시드 1회차"
DATABASE_URL="$PRISMA_URL" npx tsx prisma/seed.ts >/dev/null
C1="$(psql "$PROBE_URL" -tAc "$COUNT_SQL")"

echo "▶ (4) 시드 2회차 — 멱등성"
DATABASE_URL="$PRISMA_URL" npx tsx prisma/seed.ts >/dev/null
C2="$(psql "$PROBE_URL" -tAc "$COUNT_SQL")"
if [ "$C1" != "$C2" ]; then
  echo "✗ 시드 재실행에서 행 수가 바뀌었습니다."
  echo "  1회차: $C1"
  echo "  2회차: $C2"
  exit 1
fi
echo "  행 수 고정: $C2"

echo "▶ (5) verify.sql — 스키마 무결성"
OUT="$(psql -q "$PROBE_URL" -v ON_ERROR_STOP=1 -f prisma/verify.sql)"
if [ -n "$OUT" ]; then
  echo "✗ verify.sql 이 위반을 보고했습니다:"
  echo "$OUT"
  exit 1
fi

echo "✓ 스키마·마이그레이션·시드 무결성 전부 통과"
