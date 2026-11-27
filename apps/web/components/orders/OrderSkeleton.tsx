'use client';

import { useParams } from 'next/navigation';
import { ViewTransition } from 'react';
import styles from './orders.module.css';

// Esqueleto de la página de un pedido mientras llegan los datos. Lleva el
// mismo name de <ViewTransition> que la fila de la lista, así el morph de la
// fila al titular empieza aunque los datos todavía no lleguen.
export function OrderViewSkeleton() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className={styles.detail} aria-busy="true">
      <ViewTransition name={`order-number-${id}`} share="morph" default="none">
        <span className={styles.skeletonTitle} />
      </ViewTransition>
      <span className={styles.skeletonBlock} />
      <span className={styles.skeletonBlock} />
    </div>
  );
}
