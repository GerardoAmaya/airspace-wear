-- Las listas son NOT NULL: sin valor, quedan vacías en lugar de fallar.
ALTER TABLE "AssetCredit" ALTER COLUMN "changes" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProductTranslation" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
