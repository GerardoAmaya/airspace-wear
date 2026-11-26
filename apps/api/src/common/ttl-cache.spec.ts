import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  afterEach(() => vi.useRealTimers());

  it('reutiliza el valor mientras no vence y lo recarga al vencer', async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get('a', load)).toBe(1);
    expect(await cache.get('a', load)).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await cache.get('a', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('comparte la misma carga entre pedidos simultáneos', async () => {
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockResolvedValue(7);
    await Promise.all([cache.get('a', load), cache.get('a', load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('no guarda errores: el siguiente pedido vuelve a intentar', async () => {
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(3);
    await expect(cache.get('a', load)).rejects.toThrow('caída');
    expect(await cache.get('a', load)).toBe(3);
  });

  it('descarta la entrada más vieja al llegar al límite', async () => {
    const cache = new TtlCache<string>(1000, 2);
    const load = (value: string) => vi.fn().mockResolvedValue(value);
    await cache.get('a', load('a'));
    await cache.get('b', load('b'));
    await cache.get('c', load('c'));
    const reload = load('a2');
    expect(await cache.get('a', reload)).toBe('a2');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
