'use client';

import dynamic from 'next/dynamic';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createSpin, now, type Spin, useSpinDrag } from '@/components/home/board/rig';
import { type Clip, CLIPS } from '@/lib/avatar/avatar';
import { FITTING, type FootFit, type Fitting, mirrorFoot, type ModelFit } from '@/lib/avatar/fitting';
import { useMotionStore } from '@/lib/motion/store';
import { useStageActivity } from '@/lib/three/director';
import type { AvatarPlayback, AvatarStatus } from '../AvatarScene';
import type { AvatarView } from '../rig';
import styles from './AvatarDevTool.module.css';

const AvatarScene = dynamic(() => import('../AvatarScene'), { ssr: false });

// Herramienta de calibración (solo desarrollo, /[locale]/hangar/dev). Los
// rótulos van fijos en inglés: no llega a producción (la página responde 404).

export interface DevSneaker {
  slug: string;
  name: string;
  url: string;
  foot: 'left' | 'right';
}

// Duración de cada clip (s), de assets/avatar/manifest.json.
const CLIP_SECONDS: Record<Clip, number> = { idle: 9.933, walk: 1.033, turn: 1, pose: 0.033 };
const YAWS = [
  { label: 'Front', degrees: 0 },
  { label: 'Right side', degrees: -90 },
  { label: 'Back', degrees: 180 },
  { label: 'Left side', degrees: 90 },
  { label: '3/4', degrees: -35 },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AvatarDevTool({ sneakers }: { sneakers: DevSneaker[] }) {
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stage);
  const [spin] = useState(() => ({ current: createSpin() }));
  useSpinDrag(stage, spin, reducedMotion);
  const playback = useRef<AvatarPlayback>({ paused: false, time: 0, speed: 1 });

  const [slug, setSlug] = useState(sneakers[0]?.slug ?? '');
  const [clip, setClip] = useState<Clip>('idle');
  const [view, setView] = useState<AvatarView>('full');
  const [fitting, setFitting] = useState<Fitting>(FITTING);
  const [debug, setDebug] = useState({ grid: false, axes: false });
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<AvatarStatus>('loading');
  const [save, setSave] = useState<SaveState>('idle');
  const onReady = useCallback(() => setReady(true), []);

  const sneaker = sneakers.find((item) => item.slug === slug) ?? null;
  const shoe = sneaker ? { slug: sneaker.slug, url: sneaker.url, foot: sneaker.foot } : null;
  const index = sneakers.findIndex((item) => item.slug === slug);
  const step = (delta: number) => setSlug(sneakers[(index + delta + sneakers.length) % sneakers.length]!.slug);

  const setYaw = (degrees: number) => fixSpin(spin.current, degrees);

  const updatePlayback = (next: Partial<AvatarPlayback>) => {
    Object.assign(playback.current, next);
    if (next.paused !== undefined) setPaused(next.paused);
    if (next.time !== undefined) setTime(next.time);
    if (next.speed !== undefined) setSpeed(next.speed);
  };

  const edit = (change: (draft: Fitting) => Fitting) => {
    setSave('idle');
    setFitting((current) => change(structuredClone(current)));
  };
  const editFoot = (side: 'right' | 'left', change: (foot: FootFit) => void) =>
    edit((draft) => {
      change(draft[side]);
      if (draft.mirrorLeft) draft.left = mirrorFoot(draft.right);
      return draft;
    });
  const model: ModelFit = fitting.models[slug] ?? {};
  const editModel = (key: keyof ModelFit, value: number) =>
    edit((draft) => {
      draft.models[slug] = { ...draft.models[slug], [key]: value };
      return draft;
    });
  const resetModel = () =>
    edit((draft) => {
      delete draft.models[slug];
      return draft;
    });

  const onSave = async () => {
    setSave('saving');
    try {
      const response = await fetch('/api/dev/avatar-fitting', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fitting) });
      setSave(response.ok ? 'saved' : 'error');
    } catch {
      setSave('error');
    }
  };

  const footPanel = (side: 'right' | 'left', disabled: boolean) => {
    const foot = fitting[side];
    return (
      <fieldset className={styles.group} disabled={disabled}>
        <legend>{side === 'right' ? 'Right foot' : 'Left foot'}</legend>
        {(['x', 'y', 'z'] as const).map((axis, axisIndex) => (
          <Range
            key={`p${axis}`}
            label={`pos ${axis} (cm)`}
            value={foot.position[axisIndex]! * 100}
            min={axis === 'y' ? -6 : axis === 'x' ? (side === 'right' ? -16 : 0) : -8}
            max={axis === 'y' ? 6 : axis === 'x' ? (side === 'right' ? 0 : 16) : 12}
            step={0.05}
            onChange={(value) => editFoot(side, (draft) => void (draft.position[axisIndex] = round(value / 100, 5)))}
          />
        ))}
        {(['pitch x', 'yaw y', 'roll z'] as const).map((axis, axisIndex) => (
          <Range
            key={axis}
            label={`${axis} (°)`}
            value={foot.rotation[axisIndex]!}
            min={-30}
            max={30}
            step={0.25}
            onChange={(value) => editFoot(side, (draft) => void (draft.rotation[axisIndex] = round(value, 3)))}
          />
        ))}
        <Range label="scale" value={foot.scale} min={0.75} max={1.15} step={0.005} onChange={(value) => editFoot(side, (draft) => void (draft.scale = round(value, 4)))} />
      </fieldset>
    );
  };

  return (
    <div className={styles.tool}>
      <div className={styles.stageWrap}>
        <div ref={setStage} className={styles.stage} data-ready={ready || undefined} data-status={status}>
          <span className={styles.halo} aria-hidden="true" />
          <div className={styles.canvas}>
            <AvatarScene
              active={active}
              lite={lite}
              reducedMotion={reducedMotion}
              shoe={shoe}
              clip={clip}
              fitting={fitting}
              view={view}
              spin={spin}
              autoRotate={false}
              playback={playback}
              debug={debug}
              onReady={onReady}
              onStatus={setStatus}
            />
          </div>
          <p className={styles.badge}>
            {status === 'error' ? 'Error: avatar or sneaker failed to load (see .env.example)' : status === 'loading' || !ready ? 'Loading…' : `${sneaker?.name ?? ''} · ${clip}`}
          </p>
        </div>
      </div>

      <aside className={styles.panel} aria-label="Avatar fitting">
        <h1 className={styles.title}>Avatar fitting</h1>

        <fieldset className={styles.group}>
          <legend>Sneaker</legend>
          <div className={styles.row}>
            <button type="button" onClick={() => step(-1)} aria-label="Previous sneaker">
              ‹
            </button>
            <select value={slug} onChange={(event) => setSlug(event.target.value)} data-testid="sneaker">
              {sneakers.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name} ({item.foot === 'right' ? 'R' : 'L'})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => step(1)} aria-label="Next sneaker">
              ›
            </button>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Clip</legend>
          <div className={styles.chips}>
            {CLIPS.map((name) => (
              <button key={name} type="button" aria-pressed={clip === name} onClick={() => setClip(name)} data-clip={name}>
                {name}
              </button>
            ))}
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={paused} onChange={(event) => updatePlayback({ paused: event.target.checked })} data-testid="pause" /> Pause at time
          </label>
          <Range label="time (s)" value={time} min={0} max={CLIP_SECONDS[clip]} step={0.01} onChange={(value) => updatePlayback({ time: value, paused: true })} />
          <Range label="speed" value={speed} min={0.1} max={1.5} step={0.05} onChange={(value) => updatePlayback({ speed: value })} />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Camera</legend>
          <div className={styles.chips}>
            {(['full', 'feet'] as const).map((name) => (
              <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)} data-view={name}>
                {name}
              </button>
            ))}
          </div>
          <div className={styles.chips}>
            {YAWS.map((yaw) => (
              <button key={yaw.label} type="button" onClick={() => setYaw(yaw.degrees)} data-yaw={yaw.degrees}>
                {yaw.label}
              </button>
            ))}
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={debug.grid} onChange={(event) => setDebug({ ...debug, grid: event.target.checked })} /> Floor grid (y = 0)
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={debug.axes} onChange={(event) => setDebug({ ...debug, axes: event.target.checked })} /> Shoe axes
          </label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Global</legend>
          <Range label="lift (cm)" value={fitting.lift * 100} min={0} max={6} step={0.05} onChange={(value) => edit((draft) => ({ ...draft, lift: round(value / 100, 5) }))} />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={fitting.mirrorLeft}
              onChange={(event) =>
                edit((draft) => {
                  draft.mirrorLeft = event.target.checked;
                  if (draft.mirrorLeft) draft.left = mirrorFoot(draft.right);
                  return draft;
                })
              }
            />{' '}
            Mirror left (derive from right)
          </label>
        </fieldset>

        {footPanel('right', false)}
        {footPanel('left', fitting.mirrorLeft)}

        <fieldset className={styles.group}>
          <legend>Override: {sneaker?.name ?? slug}</legend>
          <Range label="lift (cm)" value={(model.lift ?? 0) * 100} min={-3} max={5} step={0.05} onChange={(value) => editModel('lift', round(value / 100, 5))} />
          <Range label="height (cm)" value={(model.height ?? 0) * 100} min={-3} max={3} step={0.05} onChange={(value) => editModel('height', round(value / 100, 5))} />
          <Range label="forward (cm)" value={(model.forward ?? 0) * 100} min={-4} max={4} step={0.05} onChange={(value) => editModel('forward', round(value / 100, 5))} />
          <Range label="scale" value={model.scale ?? 1} min={0.85} max={1.15} step={0.005} onChange={(value) => editModel('scale', round(value, 4))} />
          <button type="button" onClick={resetModel}>
            Reset override
          </button>
        </fieldset>

        <div className={styles.save}>
          <button type="button" className={styles.primary} onClick={onSave} disabled={save === 'saving'} data-testid="save">
            Save fitting.json
          </button>
          <span role="status">{{ idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed' }[save]}</span>
        </div>
        <pre className={styles.json}>{JSON.stringify(fitting, null, 2)}</pre>
      </aside>
    </div>
  );
}

// Deja la plataforma quieta en un ángulo (vistas fijas para calibrar).
function fixSpin(state: Spin, degrees: number) {
  state.keyTween?.kill();
  state.velocity = 0;
  state.angle = (degrees * Math.PI) / 180;
  state.resumeAt = now() + 3600;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange(value: number): void }): ReactNode {
  return (
    <label className={styles.range}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
