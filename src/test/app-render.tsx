import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";

const mockState = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockState.session } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  },
}));

export interface RenderAppOptions {
  route?: string;
  session?: Session | null;
}

export function renderApp(ui: React.ReactNode, options: RenderAppOptions = {}): RenderResult {
  mockState.session = options.session ?? null;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

export function __setMockSession(session: Session | null) {
  mockState.session = session;
}
