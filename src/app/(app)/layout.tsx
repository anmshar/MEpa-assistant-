import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface px-4 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-4 flex items-center justify-between md:mb-6">
          <Logo href="/dashboard" />
        </div>
        <NavLinks />
        <div className="mt-4 hidden border-t border-line pt-4 text-sm md:block">
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-ink-3">{user.email}</div>
          <form action={logout} className="mt-2">
            <button className="text-ink-3 hover:text-ink">Log out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
