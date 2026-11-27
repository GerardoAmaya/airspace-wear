// Enlaces del encabezado, en orden. Cambiar la lista no borra nada: cada
// enlace sigue en SiteHeader y en los mensajes es/en. El robot flotante
// reemplaza a "Estilista IA" en el encabezado (el pie lo conserva); para
// volver a mostrarlo, agregar 'stylist' (por ejemplo, después de 'balls').
// Con 'orders' en la lista, el menú del teléfono no repite "Mis pedidos"
// entre las entradas de la cuenta.
export type HeaderLink = 'catalog' | 'hangar' | 'balls' | 'orders' | 'stylist';

export const HEADER_LINKS: readonly HeaderLink[] = ['catalog', 'hangar', 'balls', 'orders'];
