import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .url(
      'VITE_SUPABASE_URL must be a full URL, for example https://abc.supabase.co',
    ),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY is missing or too short'),
});

export type Env = z.infer<typeof schema>;
export type EnvResult =
  | { ok: true; env: Env }
  | { ok: false; problems: string[] };

export function readEnv(
  raw: Record<string, unknown> = import.meta.env,
): EnvResult {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, env: parsed.data };
  // PRD S-47 Behaviour: the page must name the missing variable. zod's
  // default type error ("expected string, received undefined") omits the
  // field name, so prefix it unless the message already carries it.
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => {
      const name = i.path.join(".");
      return name && !i.message.includes(name) ? `${name}: ${i.message}` : i.message;
    }),
  };
}
