import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { AppShell } from "@/components/layout/AppShell";
import { EntityDialog } from "@/components/app/EntityDialog";

// S-40 — focus management: the skip link is the first keyboard stop and
// targets a focusable main landmark; dialogs and sheets close on Escape
// and hand focus back to the control that opened them.
//
// Comparisons use document.activeElement directly (no jest-dom in this
// repo). The same EntityDialog harness exercises both shells: on
// desktop it renders a Dialog, and with the media query flipped it
// renders a bottom Sheet — the two overlays the app actually uses.

vi.setConfig({ testTimeout: 30000 });

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

/** AppShell under test needs no API mocks — the sidebar falls back to
 *  the app name while memberships are unavailable (appShell.test.tsx). */
function renderShell() {
  return renderApp(
    <AppShell />,
    { session, route: "/b/biz1" },
  );
}

/**
 * A real EntityDialog opened from a real trigger button. Children are
 * not react-hook-form-registered on purpose: these tests are about
 * focus, not submission.
 */
function DialogHarness({ triggerLabel }: { triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title="Add Customer"
        schema={z.object({ name: z.string().min(1) })}
        defaultValues={{ name: "" }}
        submitLabel="Save customer"
        onSubmit={() => {}}
      >
        <input aria-label="Name" defaultValue="" />
      </EntityDialog>
    </>
  );
}

function renderDialogHarness(triggerLabel: string) {
  return renderApp(<DialogHarness triggerLabel={triggerLabel} />, {
    session,
    route: "/b/biz1",
  });
}

beforeEach(() => {
  // Every test starts on the desktop media query; the sheet test
  // flips it explicitly.
  __setMatchMedia(false);
});

describe("S-40 focus management", () => {
  describe("skip link", () => {
    it("is the first thing a keyboard user reaches", async () => {
      renderShell();
      await screen.findByText("Skip to content");

      const user = userEvent.setup();
      await user.tab();

      const active = document.activeElement as HTMLAnchorElement | null;
      expect(active?.tagName).toBe("A");
      expect(active?.getAttribute("href")).toBe("#main-content");
      expect(active?.textContent).toBe("Skip to content");
    });

    it("targets a main landmark a keyboard can land on", async () => {
      renderShell();
      const main = await screen.findByRole("main");

      expect(main.id).toBe("main-content");
      // tabindex=-1: the skip link's target is programmatically
      // focusable (the browser focuses it on activation) without
      // becoming a tab stop of its own.
      expect(main.getAttribute("tabindex")).toBe("-1");
      main.focus();
      expect(document.activeElement).toBe(main);
    });
  });

  describe("dialog", () => {
    it("opens with Enter, focuses inside, and Escape returns focus to the trigger", async () => {
      renderDialogHarness("Open add customer");
      const user = userEvent.setup();
      const trigger = await screen.findByRole("button", {
        name: "Open add customer",
      });

      await user.tab();
      expect(document.activeElement).toBe(trigger);
      await user.keyboard("{Enter}");

      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      // Focus is handed back to the control that opened the dialog.
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
  });

  describe("sheet", () => {
    it("opens with Enter, focuses inside, and Escape returns focus to the trigger", async () => {
      // (max-width: 767px) matches → EntityDialog renders the bottom
      // Sheet instead of the desktop Dialog.
      __setMatchMedia(true);
      renderDialogHarness("Open add customer (sheet)");
      const user = userEvent.setup();
      const trigger = await screen.findByRole("button", {
        name: "Open add customer (sheet)",
      });

      await user.tab();
      expect(document.activeElement).toBe(trigger);
      await user.keyboard("{Enter}");

      const sheet = await screen.findByRole("dialog");
      // Prove the Sheet primitive rendered, not the desktop Dialog —
      // the Sheet popup carries its own data-slot.
      expect(sheet.getAttribute("data-slot")).toBe("sheet-content");
      await waitFor(() =>
        expect(sheet.contains(document.activeElement)).toBe(true),
      );

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      // Focus is handed back to the control that opened the sheet.
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
  });
});
