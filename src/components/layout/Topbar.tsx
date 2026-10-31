import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMemberships, usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { CustomerCommandPalette } from "@/features/customers/components/CustomerCommandPalette";
import { TransactionSheet } from "@/features/transactions/components/TransactionSheet";
import {
  closeTransactionSheet,
  openTransactionSheet,
  useTransactionSheet,
} from "@/features/transactions/sheetStore";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar } from "@/components/app/Avatar";

interface TopbarProps {
  title: string;
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
  collapsed: boolean;
  /** L-05: false on pages whose PageHeader already leads with Add
   *  transaction, so the screen keeps exactly one primary action. */
  showAddTransaction?: boolean;
}

export function Topbar({
  title,
  onToggleSidebar,
  onOpenMenu,
  collapsed,
  showAddTransaction = true,
}: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isDark = resolvedTheme === "dark";

  // S-28: Ctrl/Cmd+K opens the customer search palette from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // S-24: how many invitations are waiting for me (from the shared
  // memberships query — no extra network). Clicking goes to /businesses.
  const { data: memberships } = useMemberships();
  const invitationCount = memberships?.invitations.length ?? 0;

  // S-32: the top bar's Add transaction (viewers see nothing — no Add
  // actions anywhere) and the app's one TransactionSheet instance;
  // row menus, the ledger and the "Customer added" toast all open the
  // same store this subscribes to.
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
  const sheet = useTransactionSheet();

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // signOut errors are non-critical; Supabase clears the local session regardless
    }
  }, [signOut]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background print:hidden">
      <div className="flex min-h-14 items-center gap-3 px-4 pt-[env(safe-area-inset-top)]">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/* Collapse — desktop only */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 lg:block"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>

        {/* L-05: one page title. The top bar's copy is a paragraph for
            mobile only; from lg up the page's h1 is the only title and
            this spacer keeps the right-hand controls right-aligned. */}
        <p className="min-w-0 flex-1 truncate text-base font-semibold lg:hidden">
          {title}
        </p>
        <div className="hidden flex-1 lg:block" aria-hidden="true" />

        {/* Global search trigger (S-28) — opens the customer palette */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs md:inline">
            ⌘K
          </kbd>
        </button>

        {/* Add transaction (S-32) — owner/editor only, anywhere in the
            business unless the page leads with it (L-05). Opens the
            shared sheet with the picker first. */}
        {showAddTransaction && businessId !== "" && can("manageTransactions") && (
          <button
            type="button"
            onClick={() => openTransactionSheet()}
            className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent-wash pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label="Add transaction"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add transaction</span>
          </button>
        )}

        {/* Invitation count badge (S-24) — opens the businesses page
            where each invitation is answered. */}
        {invitationCount > 0 && (
          <button
            type="button"
            onClick={() => navigate(paths.businesses)}
            aria-label={`Invitations (${invitationCount} pending)`}
            className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <Mail className="size-5" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {invitationCount}
            </span>
          </button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="User menu"
                className="rounded-full transition-opacity hover:opacity-80 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              />
            }
          >
            <Avatar name={user?.email ?? "User"} />
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="end">
            <div className="border-b border-border px-2 py-2">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11"
              onClick={() => {
                setUserMenuOpen(false);
                void handleSignOut();
              }}
            >
              Sign out
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <CustomerCommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      {/* The app's one transaction sheet (S-32 add, S-33 edit). */}
      <TransactionSheet
        open={sheet.open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openTransactionSheet(sheet.customer);
          else closeTransactionSheet();
        }}
        businessId={businessId}
        customer={sheet.customer}
        mode={sheet.mode}
        transaction={sheet.transaction}
        presetType={sheet.presetType}
      />
    </header>
  );
}
