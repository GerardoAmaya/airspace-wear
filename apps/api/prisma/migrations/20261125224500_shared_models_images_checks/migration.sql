-- Un modelo 3D puede servir a varios productos (colorways que comparten malla).
DROP INDEX "Product_modelId_key";
CREATE INDEX "Product_modelId_idx" ON "Product"("modelId");

-- Imagen propia del producto (ropa sin 3D, Open Graph).
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;

-- Índice para el listado sin filtro de categoría.
CREATE INDEX "Product_published_sortOrder_idx" ON "Product"("published", "sortOrder");

-- Lado externo del zapato como enum, conservando los datos ("+z" y "-z").
CREATE TYPE "LateralSide" AS ENUM ('plus_z', 'minus_z');
ALTER TABLE "Model3D"
  ALTER COLUMN "lateralSideFacing" TYPE "LateralSide"
  USING (CASE "lateralSideFacing" WHEN '+z' THEN 'plus_z' WHEN '-z' THEN 'minus_z' END)::"LateralSide";

-- Reglas que Prisma no expresa: una posición tiene exactamente 3 valores
-- (metros x, y, z) y las listas nunca son NULL.
ALTER TABLE "Hotspot" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_position_xyz" CHECK (array_length("position", 1) = 3);
ALTER TABLE "ProductTranslation" ALTER COLUMN "tags" SET NOT NULL;
ALTER TABLE "AssetCredit" ALTER COLUMN "changes" SET NOT NULL;
-- Precios y existencias no negativos.
ALTER TABLE "Product" ADD CONSTRAINT "Product_priceCents_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_stock_nonnegative" CHECK ("stock" >= 0);
