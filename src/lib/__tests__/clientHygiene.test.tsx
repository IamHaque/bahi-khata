import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import { renderApp } from "@/test/app-render";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";

// S-42 — client hygiene and content safety: the searches the PRD
// requires, written as tests so they re-run with every commit.
//
//  1. no service-role key in the repo or client bundle
//  2. .env.example holds only the URL and the anon key
//  3. no supabase client access outside the api layer
//  4. user text is rendered as text, never as HTML

const HERE = __dirname;
const ROOT = join(HERE, "..", "..", "..");
const SRC = join(ROOT, "src");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-ssr",
  ".vscode",
  ".idea",
  ".temp",
]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".json", ".md",
  ".sql", ".html", ".css", ".scss", ".yml", ".yaml", ".example",
  ".txt", ".svg",
]);
const SKIP_FILES = new Set(["package-lock.json"]);

/** Every text file in the repo (tracked or not), minus bulky/vendored. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (TEXT_EXTENSIONS.has(ext) || entry.startsWith(".env")) {
        out.push(full);
      }
    }
  }
  return out;
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Supabase anon/service keys are JWTs — decode WITHOUT printing them. */
function jwtRoleClaim(value: string): string | null {
  const parts = value.trim().split(".");
  const b64urlPayload = parts[1];
  if (parts.length !== 3 || b64urlPayload === undefined) return null;
  try {
    const b64 = b64urlPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(b64urlPayload.length / 4) * 4, "=");
    // base64 → bytes → UTF-8 text (atob, no node typings needed here).
    const json = decodeURIComponent(
      Array.from(atob(b64), (c) =>
        "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join(""),
    );
    const claims = JSON.parse(json) as { role?: string };
    return claims.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Classify a Supabase key by SHAPE only (never log the value):
 * "anon-jwt" | "publishable" (the newer client-safe format) |
 * "service-secret" (must never ship) | "not-a-key".
 */
function keyShape(value: string): string {
  const v = value.trim();
  if (v.startsWith("sb_publishable_")) return "publishable";
  if (v.startsWith(["sb", "secret"].join("_") + "_")) return "service-secret";
  const role = jwtRoleClaim(v);
  if (role === "anon") return "anon-jwt";
  if (role === FORBIDDEN_CLAIM) return "service-secret";
  return "not-a-key";
}

// Assembled from fragments so this file itself never matches the scan.
const FORBIDDEN_MATERIAL = new RegExp(
  [
    ["service", "role"].join("_"),
    ["sb", "secret"].join("_") + "_",
    ["VITE", "SUPABASE", "SERVICE"].join("_"),
  ].join("|"),
  "i",
);
const FORBIDDEN_CLAIM = ["service", "role"].join("_");

/** Every JWT-shaped token in a text — payload role read WITHOUT printing. */
function jwtRoleIn(text: string): string[] {
  const roles: string[] = [];
  const tokens = text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
  for (const token of tokens ?? []) {
    const role = jwtRoleClaim(token);
    if (role) roles.push(role);
  }
  return roles;
}

describe("S-42 client hygiene", () => {
  it("no service-role key material exists anywhere in the repo", () => {
    // Words in prose are fine (docs say "service-role" with a hyphen);
    // this catches the actual identifier/secret shapes, plus any JWT
    // whose payload claims the service-role — including a key pasted
    // into any file (local .env included, since it starts with ".env").
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const content = readIfExists(file);
      if (!content) continue;
      const badMaterial = FORBIDDEN_MATERIAL.test(content);
      const hasServiceJwt = jwtRoleIn(content).includes(FORBIDDEN_CLAIM);
      if (badMaterial || hasServiceJwt) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no service-role key material exists in the built client bundle", () => {
    const dist = join(ROOT, "dist");
    if (!existsSync(dist)) {
      // The bundle is produced by `npm run build`; skip honestly when
      // it has not been built in this working copy.
      return;
    }
    // The bundle intentionally vendors supabase-js, whose minified code
    // mentions the service-role claim in error strings — so scan for the real
    // thing: a JWT whose payload claims that role. Anon/publishable
    // material is expected and safe in a client bundle.
    const offenders: string[] = [];
    for (const file of walk(dist)) {
      const content = readIfExists(file);
      if (content && jwtRoleIn(content).includes(FORBIDDEN_CLAIM)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it(".env.example holds only the URL and the anon key", () => {
    const example = readIfExists(join(ROOT, ".env.example"));
    expect(example).toBeTruthy();
    const keys = (example ?? "")
      .split("\n")
      .map((line) => (line.split("=")[0] ?? "").trim())
      .filter((key) => key.length > 0);
    expect(keys).toEqual(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
    // Placeholders, not real keys (real keys are JWT-shaped).
    for (const line of (example ?? "").split("\n")) {
      const value = line.split("=").slice(1).join("=");
      expect(jwtRoleClaim(value)).toBeNull();
    }
  });

  it.runIf(existsSync(join(ROOT, ".env")))(
    "the local .env holds a client-safe key, never a service-role key",
    () => {
      const env = readIfExists(join(ROOT, ".env")) ?? "";
      const relevant = env
        .split("\n")
        .filter((line) => line.includes("SUPABASE") && line.includes("KEY"))
        .filter((line) => !line.trim().startsWith("#"));
      expect(relevant.length).toBeGreaterThan(0);
      for (const line of relevant) {
        const name = (line.split("=")[0] ?? "").trim();
        const value = line.split("=").slice(1).join("=");
        // Fail on a pasted secret WITHOUT ever printing the value —
        // the assertion reports only the key's shape.
        expect(
          { name, shape: keyShape(value) },
          `${name} must be a client-safe key (anon JWT or publishable)`,
        ).toEqual({ name, shape: expect.stringMatching(/^(publishable|anon-jwt)$/) });
      }
    },
  );

  it("the supabase client is imported only by lib/supabase.ts and api layers", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel.includes("__tests__") || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) {
        continue;
      }
      const content = readIfExists(file) ?? "";
      const touchesClient =
        content.includes('from "@/lib/supabase"') ||
        content.includes("from '@/lib/supabase'") ||
        /\bcreateClient\s*\(/.test(content);
      if (!touchesClient) continue;
      const allowed =
        rel === "lib/supabase.ts" || rel.endsWith("/api.ts") || rel.endsWith("/api.tsx");
      if (!allowed) offenders.push(`src/${rel}`);
    }
    expect(offenders).toEqual([]);
  });

  it("user text never meets an HTML sink (no dangerouslySetInnerHTML etc.)", () => {
    const forbidden =
      /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/;
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel.includes("__tests__")) continue;
      const content = readIfExists(file) ?? "";
      if (forbidden.test(content)) offenders.push(`src/${rel}`);
    }
    expect(offenders).toEqual([]);
  });
});

// --- Content safety, proven by rendering -------------------------------

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const membersApi = vi.hoisted(() => ({
  getMyInvitations: vi.fn(),
  respondToInvitation: vi.fn(),
}));
vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
vi.mock("@/features/members/api", () => ({
  getMyInvitations: membersApi.getMyInvitations,
  respondToInvitation: membersApi.respondToInvitation,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

const PAYLOAD =
  '<img src=x onerror="window.__xss=1"></img><script>window.__xss=2</script>';

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async (): Promise<Memberships> => ({
    businesses: [
      {
        id: "b1",
        name: PAYLOAD,
        businessType: null,
        ownerId: "u1",
        ownerName: "Asha Verma",
        ownerEmail: "asha@example.com",
        role: "owner",
        isOwner: true,
      },
    ],
    invitations: [],
  }));
  membersApi.getMyInvitations.mockImplementation(async () => []);
});

describe("S-42 content safety", () => {
  it("a business name full of markup renders as literal text, never as HTML", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.businesses} element={<BusinessesPage />} />
      </Routes>,
      { session, route: paths.businesses },
    );

    // The exact string arrives as TEXT inside the card...
    const text = await screen.findByText(PAYLOAD);
    // ...and it did not become elements anywhere in the rendered tree.
    expect(text.querySelector("img, script, iframe, object, embed")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
    // Nothing executed (jsdom would have set these if markup had run).
    expect(
      (window as unknown as { __xss?: number }).__xss,
    ).toBeUndefined();
  });
});
