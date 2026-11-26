-- Ropa en el catálogo (docs/plan-paso-4.md, fase 0).

-- Sistema de tallas como enum, conservando los datos ("EU" y "BALL").
-- ALPHA: tallas de letra de la ropa (S a XL); ONE: talla única (gorras,
-- lentes, mochilas). Igual que SIZE_SYSTEMS en @airspace/contracts.
CREATE TYPE "SizeSystem" AS ENUM ('EU', 'ALPHA', 'ONE', 'BALL');
ALTER TABLE "ProductSize"
  ALTER COLUMN "system" TYPE "SizeSystem"
  USING "system"::"SizeSystem";

-- Subcategoría de la ropa (un valor por producto, para filtrar) y lugar de
-- la prenda en el avatar del Hangar 360° (null: solo catálogo).
CREATE TYPE "Subcategory" AS ENUM ('tshirt', 'sweatshirt', 'jacket', 'pants', 'shorts', 'cap', 'accessory');
CREATE TYPE "AvatarSlot" AS ENUM ('top', 'bottom', 'head', 'eyes');
ALTER TABLE "Product"
  ADD COLUMN "subcategory" "Subcategory",
  ADD COLUMN "avatarSlot" "AvatarSlot";

-- Reglas que Prisma no expresa: toda prenda tiene subcategoría y solo la
-- ropa la tiene; solo la ropa ocupa un lugar en el avatar (los zapatos se
-- prueban por categoría).
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategory_apparel"
  CHECK (("category" = 'apparel') = ("subcategory" IS NOT NULL));
ALTER TABLE "Product" ADD CONSTRAINT "Product_avatarSlot_apparel"
  CHECK ("avatarSlot" IS NULL OR "category" = 'apparel');

-- Filtro de la ropa por subcategoría.
CREATE INDEX "Product_category_subcategory_published_sortOrder_idx"
  ON "Product"("category", "subcategory", "published", "sortOrder");
