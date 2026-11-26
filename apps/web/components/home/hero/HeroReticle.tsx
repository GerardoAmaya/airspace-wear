import { useMemo } from 'react';
import styles from './HomeHero.module.css';

// Escala del dial de giro: píxeles por grado.
export const TAPE_PX_PER_DEG = 4;

// Retícula "Modelo · Ref. · En foco" de la portada: esquinas en el acento,
// marcas laterales y el dial de giro. La posiciona y dimensiona HeroClient
// (sigue al zapato en cada cuadro); aquí solo va el marcado.
export function HeroReticle({ target, lock, loading }: { target: string; lock: string; loading: string | null }) {
  return (
    <div className={styles.reticle} data-part="reticle" aria-hidden="true">
      <div className={`${styles.reticleInner} ${styles.frame}`} data-part="reticle-inner">
        <span className={styles.frameCorners} />
        <p className={`${styles.reticleTag} ${styles.hudLabel}`} data-part="reticle-text">
          {target}
        </p>
        <p className={`${styles.reticleLock} ${styles.hudLabel}`} data-part="reticle-text">
          <span className={styles.pip} />
          {lock}
        </p>
        <span className={`${styles.tick} ${styles.tickLeft}`} />
        <span className={`${styles.tick} ${styles.tickRight}`} />
        <div className={styles.tape}>
          <div className={styles.tapeWindow}>
            <Tape />
          </div>
          <span className={styles.caret} />
        </div>
        {loading && <p className={`${styles.reticleLoading} ${styles.hudLabel}`}>{loading}</p>}
      </div>
    </div>
  );
}

// Dial de -60° a 420° para poder envolver sin saltos. Los números son grados
// sueltos del dibujo (no texto de interfaz).
function Tape() {
  const { ticks, labels, width } = useMemo(() => {
    let path = '';
    const marks: { x: number; turn: number }[] = [];
    for (let degree = -60; degree <= 420; degree += 5) {
      const x = (degree + 60) * TAPE_PX_PER_DEG;
      const major = degree % 30 === 0;
      path += `M${x} ${major ? 0 : 4}V10`;
      if (major) marks.push({ x, turn: ((degree % 360) + 360) % 360 });
    }
    return { ticks: path, labels: marks, width: 480 * TAPE_PX_PER_DEG };
  }, []);
  return (
    <svg className={styles.tapeStrip} data-part="tape" width={width} height={26} viewBox={`0 0 ${width} 26`}>
      <path d={ticks} />
      {labels.map((mark) => (
        <text key={mark.x} x={mark.x} y={23}>
          {mark.turn}
        </text>
      ))}
    </svg>
  );
}
