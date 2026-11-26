// Eje inclinado del balón en foco. Vive aparte de BallScene para que el panel
// y la ficha lean el ángulo sin cargar three.js (la escena se carga diferida).
export const TILT_Z = 0.4; // eje inclinado de lado (~23°)
export const AXIS_DEGREES = Math.round((TILT_Z * 180) / Math.PI);
