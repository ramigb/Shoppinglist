import { Link, useLocation } from "react-router-dom";
import { BarChart3, Home, Info, ListChecks, Plus, ShoppingBasket } from "lucide-react";
import { CreateListProvider } from "@/components/custom/CreateListProvider";
import { useCreateList } from "@/components/custom/create-list-context";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Today", path: "/", icon: Home },
  { label: "Lists", path: "/lists", icon: ListChecks },
  { label: "Insights", path: "/stats", icon: BarChart3 },
  { label: "About", path: "/about", icon: Info },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return <CreateListProvider><AppShell>{children}</AppShell></CreateListProvider>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { openCreateList } = useCreateList();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Basket home">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShoppingBasket className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Basket</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
            {navItems.map(({ label, path, icon: Icon }) => (
              <Link key={path} to={path} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors", location.pathname === path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground")}>
                <Icon className="size-4" />{label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Button type="button" onClick={openCreateList} className="hidden rounded-xl sm:flex">
              <Plus className="size-4" /> New list
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pt-10">{children}</main>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
        {navItems.slice(0, 2).map(({ label, path, icon: Icon }) => <MobileLink key={path} {...{label,path,Icon}} active={location.pathname === path} />)}
        <button type="button" onClick={openCreateList} className="mx-auto -mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg" aria-label="Create a new list"><Plus className="size-6" /></button>
        {navItems.slice(2).map(({ label, path, icon: Icon }) => <MobileLink key={path} {...{label,path,Icon}} active={location.pathname === path} />)}
      </nav>
    </div>
  );
}

function MobileLink({ label, path, Icon, active }: { label: string; path: string; Icon: typeof Home; active: boolean }) {
  return <Link to={path} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium", active ? "bg-accent text-primary" : "text-muted-foreground")}><Icon className="size-5" />{label}</Link>;
}
