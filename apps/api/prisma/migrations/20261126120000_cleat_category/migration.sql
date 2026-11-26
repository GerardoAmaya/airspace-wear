-- Nueva categoría: tacos de fútbol (cleat). Va después de sneaker, igual
-- que en schema.prisma y en CATEGORIES de @airspace/contracts.
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'cleat' AFTER 'sneaker';
