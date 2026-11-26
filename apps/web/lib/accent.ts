import type { CSSProperties } from 'react';

// Acento por producto (viene de la API): tinta AA para el tema oscuro y para
// el claro. Se aplica con atributos en el contenedor del visor; base.css
// elige la tinta del tema activo en --accent-ink. Sin acento, los estilos
// caen al lima de la marca: var(--accent-ink, var(--color-primary)).
export type ProductAccent = { dark: string; light: string } | null;

export function accentProps(accent: ProductAccent): { 'data-accent'?: ''; style?: CSSProperties } {
  if (!accent) return {};
  return { 'data-accent': '', style: { '--accent-dark': accent.dark, '--accent-light': accent.light } as CSSProperties };
}
