import { z } from 'astro/zod';

/**
 * Alan hiç yoksa iç varsayılanlarıyla doldurulmuş nesne döner.
 * Zod 3'te `.default({})` bunu yapıyordu; Zod 4'te (Astro 6+) varsayılan değer olduğu gibi döner ve
 * iç varsayılanlar UYGULANMAZ (kayıtlı veri farklı okunurdu). Bu yardımcı iki sürümde de aynı sonucu verir.
 */
export function bosIseVarsayilan<T extends z.ZodType>(sema: T) {
  return sema.default(() => sema.parse({}) as never);
}
