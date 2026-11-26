// Escenarios del guion de la consola (fase 4). Aquí solo van los datos que no
// son texto: qué productos recomienda cada idea y con qué coincidencia. Los
// textos (idea, pregunta, respuesta y motivos) viven en
// messages/home/stylist.<idioma>.json, en HomeStylist.scenarios.<id>. En la
// respuesta, {p1} y {p2} se reemplazan por el nombre del producto que manda
// la API (los nombres viven en la base de datos, nunca en los mensajes).
export const STYLIST_SCENARIOS = [
  {
    id: 'comfort',
    picks: [
      { slug: 'new-balance-997', match: 97 },
      { slug: 'nike-pegasus-36', match: 91 },
    ],
  },
  {
    id: 'concert',
    picks: [
      { slug: 'nike-air-uptempo', match: 96 },
      { slug: 'jordan-4-travis-scott', match: 92 },
    ],
  },
  {
    id: 'basic',
    picks: [
      { slug: 'adidas-samba', match: 97 },
      { slug: 'adidas-gazelle', match: 90 },
    ],
  },
] as const;

export type ScenarioId = (typeof STYLIST_SCENARIOS)[number]['id'];

// Textos de un escenario (se leen con t.raw de HomeStylist.scenarios.<id>,
// con un motivo por recomendación: reason1 y reason2).
export interface ScenarioCopy {
  chip: string;
  question: string;
  answer: string;
  reasons: string[];
}
