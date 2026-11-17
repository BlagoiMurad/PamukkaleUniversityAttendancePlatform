-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OneTimeTokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET', 'MFA_LOGIN');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseTeacherRole" AS ENUM ('OWNER', 'CO_TEACHER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "EnrollmentState" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'LOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'MANUAL_PRESENT', 'MANUAL_LATE', 'EXCUSED', 'REMOVED_FROM_SESSION');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('APRILTAG', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('STUDENT_DISPUTE', 'MANUAL_CHECKIN', 'TEACHER_CORRECTION');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTING', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "university_id" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "role" "Role" NOT NULL,
    "password_hash" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "temp_password_expires_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "faculty_number" TEXT,
    "programme" TEXT,
    "year" INTEGER,
    "group" TEXT,
    "optional_fields" JSONB,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "department" TEXT,
    "faculty" TEXT,
    "title" TEXT,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_family" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_label" TEXT,
    "user_agent" TEXT,
    "ip_coarse" TEXT,
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "OneTimeTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "faculty" TEXT,
    "owner_id" UUID NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_teachers" (
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "role" "CourseTeacherRole" NOT NULL DEFAULT 'CO_TEACHER',
    "can_manage_roster" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("course_id","teacher_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "state" "EnrollmentState" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT,
    "room" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "scheduled_end_at" TIMESTAMP(3) NOT NULL,
    "actual_started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "session_secret" TEXT,
    "join_token" TEXT,
    "marker_epoch" TIMESTAMP(3),
    "marker_rotation_seconds" INTEGER NOT NULL DEFAULT 20,
    "marker_policy_version" INTEGER NOT NULL DEFAULT 1,
    "attendance_policy_version" INTEGER,
    "late_after_seconds" INTEGER,
    "checkin_close_after_seconds" INTEGER,
    "grace_ms" INTEGER,
    "end_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_challenges" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_session_id" UUID NOT NULL,
    "nonce_hash" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "attendance_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "verified_at" TIMESTAMP(3),
    "lateness_seconds" INTEGER,
    "evidence_type" "EvidenceType" NOT NULL,
    "device_session_id" UUID,
    "policy_version" INTEGER,
    "grace_used" BOOLEAN NOT NULL DEFAULT false,
    "manually_corrected" BOOLEAN NOT NULL DEFAULT false,
    "last_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "old_status" "AttendanceStatus",
    "new_status" "AttendanceStatus",
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_requests" (
    "id" UUID NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attendance_id" UUID,
    "author_id" UUID NOT NULL,
    "requested_status" "AttendanceStatus",
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" UUID,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "actor_role" "Role",
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "ip_coarse" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "rows" JSONB NOT NULL,
    "summary" JSONB,
    "report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policies" (
    "version" SERIAL NOT NULL,
    "late_after_seconds" INTEGER NOT NULL,
    "checkin_close_after_seconds" INTEGER,
    "grace_ms" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_university_id_key" ON "users"("university_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_faculty_number_key" ON "student_profiles"("faculty_number");

-- CreateIndex
CREATE INDEX "device_sessions_user_id_revoked_at_idx" ON "device_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_tokens_token_hash_key" ON "one_time_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "one_time_tokens_user_id_type_idx" ON "one_time_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_term_key" ON "courses"("code", "term");

-- CreateIndex
CREATE INDEX "enrollments_course_id_state_idx" ON "enrollments"("course_id", "state");

-- CreateIndex
CREATE INDEX "enrollments_student_id_state_idx" ON "enrollments"("student_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_join_token_key" ON "lessons"("join_token");

-- CreateIndex
CREATE INDEX "lessons_course_id_starts_at_idx" ON "lessons"("course_id", "starts_at");

-- CreateIndex
CREATE INDEX "lessons_teacher_id_starts_at_idx" ON "lessons"("teacher_id", "starts_at");

-- CreateIndex
CREATE INDEX "lessons_status_idx" ON "lessons"("status");

-- CreateIndex
CREATE INDEX "attendance_challenges_lesson_id_user_id_status_idx" ON "attendance_challenges"("lesson_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "attendance_challenges_device_session_id_status_idx" ON "attendance_challenges"("device_session_id", "status");

-- CreateIndex
CREATE INDEX "attendances_student_id_idx" ON "attendances"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_lesson_id_student_id_key" ON "attendances"("lesson_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_events_attendance_id_created_at_idx" ON "attendance_events"("attendance_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_requests_lesson_id_status_idx" ON "attendance_requests"("lesson_id", "status");

-- CreateIndex
CREATE INDEX "attendance_requests_student_id_status_idx" ON "attendance_requests"("student_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_scope_key_key" ON "idempotency_records"("user_id", "scope", "key");

-- CreateIndex
CREATE INDEX "import_batches_created_by_id_created_at_idx" ON "import_batches"("created_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_challenges" ADD CONSTRAINT "attendance_challenges_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_challenges" ADD CONSTRAINT "attendance_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_challenges" ADD CONSTRAINT "attendance_challenges_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "device_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one ACTIVE lesson per course (spec 9: "teacher starts twice")
CREATE UNIQUE INDEX "lessons_one_active_per_course" ON "lessons"("course_id") WHERE "status" = 'ACTIVE';
