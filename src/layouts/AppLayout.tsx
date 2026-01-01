import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { CreateListDialog } from "@/components/custom/CreateListDialog";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const navItems = [
    { label: "Home", path: "/" },
    { label: "My Lists", path: "/lists" },
    { label: "Statistics", path: "/stats" },
    { label: "About", path: "/about" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="mr-4 flex items-center">
            {/* Mobile Menu */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <div className="flex flex-col space-y-4 py-4">
                  <Link
                    to="/"
                    className="font-bold text-lg mb-2"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Shopping List
                  </Link>
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "transition-colors hover:text-foreground/80",
                        location.pathname === item.path
                          ? "text-foreground"
                          : "text-foreground/60"
                      )}
                      onClick={() => setIsSheetOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      className="flex-1 justify-start"
                      onClick={() => {
                        setIsCreateOpen(true);
                        setIsSheetOpen(false);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Create List
                    </Button>
                  </div>
                  <div className="pt-2">
                     <ModeToggle />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="mr-6 flex items-center space-x-2 font-bold">
              Shopping List
            </Link>
          </div>

          <nav className="hidden md:flex items-center space-x-4 lg:space-x-6 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "transition-colors hover:text-foreground/80",
                  location.pathname === item.path
                    ? "text-foreground"
                    : "text-foreground/60"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden md:flex items-center space-x-2">
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create List
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6 px-4">{children}</main>

      <CreateListDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
