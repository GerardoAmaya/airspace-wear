-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('es', 'en');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('sneaker', 'apparel', 'ball');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('new', 'available', 'low_stock', 'coming_soon');

-- CreateEnum
CREATE TYPE "Foot" AS ENUM ('left', 'right');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('model', 'font', 'library');

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "brandId" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "availability" "Availability" NOT NULL DEFAULT 'available',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "modelId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "productId" INTEGER NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "colorway" TEXT,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "edition" TEXT,
    "hostCity" TEXT,
    "materials" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("productId","locale")
);

-- CreateTable
CREATE TABLE "ProductSize" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "system" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Model3D" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "heroUrl" TEXT NOT NULL,
    "liteUrl" TEXT NOT NULL,
    "heroBytes" INTEGER NOT NULL,
    "liteBytes" INTEGER NOT NULL,
    "heroTriangles" INTEGER NOT NULL,
    "liteTriangles" INTEGER NOT NULL,
    "foot" "Foot",
    "lateralSideFacing" TEXT,
    "posterUrl" TEXT,
    "creditId" INTEGER NOT NULL,

    CONSTRAINT "Model3D_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotspot" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION[],
    "view" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Hotspot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotspotTranslation" (
    "hotspotId" INTEGER NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "HotspotTranslation_pkey" PRIMARY KEY ("hotspotId","locale")
);

-- CreateTable
CREATE TABLE "AssetCredit" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "sourceUrl" TEXT,
    "author" TEXT NOT NULL,
    "authorUrl" TEXT,
    "licenseName" TEXT NOT NULL,
    "licenseUrl" TEXT,
    "commercialUse" BOOLEAN NOT NULL DEFAULT true,
    "shareAlike" BOOLEAN NOT NULL DEFAULT false,
    "changes" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_reference_key" ON "Product"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Product_modelId_key" ON "Product"("modelId");

-- CreateIndex
CREATE INDEX "Product_category_published_sortOrder_idx" ON "Product"("category", "published", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSize_productId_system_label_key" ON "ProductSize"("productId", "system", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Model3D_slug_key" ON "Model3D"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Model3D_creditId_key" ON "Model3D"("creditId");

-- CreateIndex
CREATE UNIQUE INDEX "Hotspot_productId_key_key" ON "Hotspot"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCredit_key_key" ON "AssetCredit"("key");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model3D"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Model3D" ADD CONSTRAINT "Model3D_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "AssetCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotspotTranslation" ADD CONSTRAINT "HotspotTranslation_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
