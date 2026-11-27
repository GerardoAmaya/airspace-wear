'use client';

import { useState } from 'react';
import { initials } from './account-actions';
import styles from './Account.module.css';

// Foto de Google o, si no hay (o no carga), las iniciales sobre el lima.
export function Avatar({ name, email, image, size = 'small' }: { name: string; email: string; image: string | null | undefined; size?: 'small' | 'large' | 'xl' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = image && failed !== image;
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {showImage ? (
        // Foto externa de Google (sin next/image: no hace falta optimizarla).
        // Sin referrer, como pide Google para sus fotos de perfil.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(image)} />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
