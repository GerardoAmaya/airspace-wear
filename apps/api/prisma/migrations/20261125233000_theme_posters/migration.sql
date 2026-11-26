-- Pósters por tema: la iluminación del estudio cambia entre oscuro y claro.
ALTER TABLE "Model3D" DROP COLUMN "posterUrl";
ALTER TABLE "Model3D" ADD COLUMN "posterDarkUrl" TEXT;
ALTER TABLE "Model3D" ADD COLUMN "posterLightUrl" TEXT;
