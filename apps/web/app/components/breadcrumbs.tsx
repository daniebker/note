import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function breadcrumbJsonLd(items: Crumb[]) {
  const base = process.env.SITE_URL ?? "http://localhost:3002";
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${base}${item.href}` } : {}),
    })),
  };
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted"
    >
      {items.map((item, i) => (
        <span className="flex items-center gap-1.5" key={i}>
          {i > 0 && <span aria-hidden="true">&gt;</span>}
          {item.href ? (
            <Link className="hover:text-accent hover:underline" href={item.href}>
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="truncate text-ink">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
