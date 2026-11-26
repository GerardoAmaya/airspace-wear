-- Acento del visor por producto (tinta AA por tema; null = lima de marca).
ALTER TABLE "Product" ADD COLUMN "accentDark" TEXT;
ALTER TABLE "Product" ADD COLUMN "accentLight" TEXT;
