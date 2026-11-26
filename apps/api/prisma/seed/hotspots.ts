import type { HotspotView, Locale } from '@airspace/contracts';

// Detalles 3D por producto. position: metros en la pose canónica del modelo
// (suela en y = 0, punta hacia +X). view: pose del zapato y encuadre de
// cámara que usa la web (portado de design/prototype/sections/flight/content.js).
// Si el modelo se vuelve a optimizar con otra pose, se recalibran aquí.

export interface SeedHotspot {
  key: string;
  position: [number, number, number];
  view: HotspotView;
  text: Record<Locale, { title: string; text: string }>;
}

export const HOTSPOTS: Record<string, SeedHotspot[]> = {
  'air-jordan-1': [
    {
      key: 'swoosh',
      position: [-0.04, 0.055, 0.058],
      view: {
        pose: { yaw: 0.12, pitch: 0, bank: 0.06 },
        camera: { zoom: 1.1, elev: 0.04, focus: 0.15, shift: -0.06 },
        slot: { side: 'right', y: 0.47 },
        mobile: { zoom: 1, yaw: 0.1 },
      },
      text: {
        es: { title: 'Swoosh de cuero', text: 'Cuero superpuesto y cosido a lo largo del lateral.' },
        en: { title: 'Leather Swoosh', text: 'Overlaid leather, stitched along the side.' },
      },
    },
    {
      key: 'toe',
      position: [0.105, 0.05, 0.0],
      view: {
        pose: { yaw: 0.9, pitch: -0.03, bank: 0.36, rim: 0.6 },
        camera: { zoom: 1.12, elev: 0.1, focus: 0.3, shift: -0.06 },
        slot: { side: 'right', y: 0.42 },
        mobile: { zoom: 1.05, yaw: 0.8 },
      },
      text: {
        es: { title: 'Puntera perforada', text: 'Perforaciones que dejan respirar al pie en cada paso.' },
        en: { title: 'Perforated toe', text: 'Perforations that let your foot breathe with every step.' },
      },
    },
    {
      key: 'collar',
      position: [-0.105, 0.16, 0.025],
      view: {
        pose: { yaw: -0.62, pitch: 0, bank: 0.2 },
        camera: { zoom: 1.2, elev: 0.12, focus: 0.3, shift: 0.07 },
        slot: { side: 'left', y: 0.27 },
        mobile: { zoom: 1.05, yaw: -0.55 },
      },
      text: {
        es: { title: 'Cuello acolchado', text: 'Espuma alrededor del tobillo que sujeta sin apretar.' },
        en: { title: 'Padded collar', text: 'Foam around the ankle that holds without squeezing.' },
      },
    },
    {
      key: 'sole',
      position: [0.055, 0.0, 0.005],
      view: {
        pose: { yaw: 0.2, pitch: 0.04, bank: -0.62, rim: 0.2, shadow: 0 },
        camera: { zoom: 1.15, elev: -0.06, focus: 0.25, shift: -0.05 },
        slot: { side: 'right', y: 0.5 },
        mobile: { zoom: 1, yaw: 0.2 },
      },
      text: {
        es: { title: 'Suela de goma', text: 'Goma con círculo de pivote para girar con agarre.' },
        en: { title: 'Rubber outsole', text: 'Rubber with a pivot circle for grippy turns.' },
      },
    },
  ],
  'jordan-4-travis-scott': [
    {
      key: 'support',
      position: [-0.04, 0.06, -0.058],
      view: {
        pose: { yaw: 0.12, pitch: 0, bank: 0.06 },
        camera: { zoom: 1.1, elev: 0.04, focus: 0.15, shift: -0.06 },
        slot: { side: 'right', y: 0.47 },
        mobile: { zoom: 1, yaw: 0.1 },
      },
      text: {
        es: { title: 'Soporte lateral', text: 'Pieza negra con salpicado de color que sujeta el empeine.' },
        en: { title: 'Side support', text: 'A black speckled piece that holds the midfoot in place.' },
      },
    },
    {
      key: 'toe',
      position: [0.105, 0.05, 0.0],
      view: {
        pose: { yaw: 0.9, pitch: -0.03, bank: 0.36, rim: 0.6 },
        camera: { zoom: 1.12, elev: 0.1, focus: 0.3, shift: -0.06 },
        slot: { side: 'right', y: 0.42 },
        mobile: { zoom: 1.05, yaw: 0.8 },
      },
      text: {
        es: { title: 'Puntera de gamuza', text: 'Gamuza lila suave que cubre toda la punta.' },
        en: { title: 'Suede toe', text: 'Soft lilac suede that wraps the whole toe.' },
      },
    },
    {
      key: 'collar',
      position: [-0.105, 0.112, -0.035],
      view: {
        pose: { yaw: -0.62, pitch: 0, bank: 0.2 },
        camera: { zoom: 1.2, elev: 0.12, focus: 0.3, shift: 0.07 },
        slot: { side: 'left', y: 0.27 },
        mobile: { zoom: 1.05, yaw: -0.55 },
      },
      text: {
        es: { title: 'Forro morado', text: 'Cuello acolchado con forro morado intenso alrededor del tobillo.' },
        en: { title: 'Purple lining', text: 'A padded collar with a deep purple lining around the ankle.' },
      },
    },
    {
      key: 'sole',
      position: [0.055, 0.0, -0.005],
      view: {
        pose: { yaw: 0.2, pitch: 0.04, bank: -0.62, rim: 0.2, shadow: 0 },
        camera: { zoom: 1.15, elev: -0.06, focus: 0.25, shift: -0.05 },
        slot: { side: 'right', y: 0.5 },
        mobile: { zoom: 1, yaw: 0.2 },
      },
      text: {
        es: { title: 'Suela de goma', text: 'Goma negra y gris con agarre de punta a talón.' },
        en: { title: 'Rubber outsole', text: 'Black and gray rubber with grip from toe to heel.' },
      },
    },
  ],
};
