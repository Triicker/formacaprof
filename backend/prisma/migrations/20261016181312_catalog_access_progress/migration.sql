-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ModuleKind" AS ENUM ('presentation', 'curriculum');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('video', 'reading', 'document', 'activity');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('static', 'external', 'local');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('public', 'protected');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('active', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "LessonProgressStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "CompletionSource" AS ENUM ('manual', 'player');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120),
    "storage_provider" "StorageProvider" NOT NULL,
    "storage_key" VARCHAR(500),
    "external_url" VARCHAR(1000),
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size" INTEGER,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'protected',
    "metadata" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(200),
    "description" TEXT,
    "cover_asset_id" UUID,
    "thumbnail_asset_id" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "theme_config" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(200),
    "description" TEXT,
    "kind" "ModuleKind" NOT NULL DEFAULT 'curriculum',
    "cover_asset_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "lesson_type" "LessonType" NOT NULL DEFAULT 'video',
    "media_asset_id" UUID,
    "thumbnail_asset_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "duration_seconds" INTEGER,
    "required_for_completion" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_collection_access" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'active',
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institution_collection_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "assigned_by" UUID,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "status" "LessonProgressStatus" NOT NULL DEFAULT 'in_progress',
    "watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "completion_source" "CompletionSource",
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "experience" SMALLINT NOT NULL,
    "usefulness" SMALLINT NOT NULL,
    "navigation" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "verification_code" VARCHAR(20) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "collections_status_display_order_idx" ON "collections"("status", "display_order");

-- CreateIndex
CREATE INDEX "modules_collection_id_status_display_order_idx" ON "modules"("collection_id", "status", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "modules_collection_id_slug_key" ON "modules"("collection_id", "slug");

-- CreateIndex
CREATE INDEX "lessons_module_id_status_display_order_idx" ON "lessons"("module_id", "status", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_module_id_slug_key" ON "lessons"("module_id", "slug");

-- CreateIndex
CREATE INDEX "institution_collection_access_collection_id_status_idx" ON "institution_collection_access"("collection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "institution_collection_access_institution_id_collection_id_key" ON "institution_collection_access"("institution_id", "collection_id");

-- CreateIndex
CREATE INDEX "enrollments_collection_id_institution_id_status_idx" ON "enrollments"("collection_id", "institution_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_user_id_idx" ON "enrollments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_institution_id_user_id_collection_id_key" ON "enrollments"("institution_id", "user_id", "collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_enrollment_id_lesson_id_key" ON "lesson_progress"("enrollment_id", "lesson_id");

-- CreateIndex
CREATE INDEX "feedbacks_enrollment_id_idx" ON "feedbacks"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_enrollment_id_key" ON "certificates"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_code_key" ON "certificates"("verification_code");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_thumbnail_asset_id_fkey" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_thumbnail_asset_id_fkey" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_collection_access" ADD CONSTRAINT "institution_collection_access_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_collection_access" ADD CONSTRAINT "institution_collection_access_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_collection_access" ADD CONSTRAINT "institution_collection_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_institution_id_fkey" FOREIGN KEY ("user_id", "institution_id") REFERENCES "memberships"("user_id", "institution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de integridade que o schema Prisma não expressa
ALTER TABLE "collections" ADD CONSTRAINT "collections_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "modules" ADD CONSTRAINT "modules_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_duration_chk" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0);
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_watched_chk" CHECK ("watched_seconds" >= 0);
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_completed_chk" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_ratings_chk" CHECK ("experience" BETWEEN 1 AND 5 AND "usefulness" BETWEEN 1 AND 5 AND "navigation" BETWEEN 1 AND 5);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_location_chk" CHECK (
  ("storage_provider" = 'external' AND "external_url" ~ '^https://')
  OR ("storage_provider" IN ('static', 'local') AND "storage_key" IS NOT NULL AND "storage_key" NOT LIKE '%..%')
);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_static_public_chk" CHECK ("storage_provider" <> 'static' OR "visibility" = 'public');
ALTER TABLE "institution_collection_access" ADD CONSTRAINT "ica_revoked_chk" CHECK (("status" = 'revoked') = ("revoked_at" IS NOT NULL));
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_revoked_chk" CHECK (("status" = 'revoked') = ("revoked_at" IS NOT NULL));
