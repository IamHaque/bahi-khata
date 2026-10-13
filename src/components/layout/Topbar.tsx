import { useCallback, useState } from "react";
import {
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
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
}

export function Topbar({
  title,
  onToggleSidebar,
  onOpenMenu,
  collapsed,
}: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isDark = resolvedTheme === "dark";

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // signOut errors are non-critical; Supabase clears the local session regardless
    }
  }, [signOut]);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="flex h-14 items-center gap-3 px-4">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/* Collapse — desktop only */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground lg:block"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>

        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        {/* Global search trigger — palette wired in S-28 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent-wash hover:text-foreground"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs md:inline">
            ⌘K
          </kbd>
        </button>

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
                className="rounded-full transition-opacity hover:opacity-80"
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
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground"
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
    </header>
  );
}
