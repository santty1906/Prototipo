import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/profiles", label: "Profiles" },
  { href: "/upload", label: "Upload" },
];

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Talent Profile System
        </Link>
        <nav className="flex items-center gap-5 text-sm text-slate-600">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
