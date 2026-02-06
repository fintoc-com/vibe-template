import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '~/lib/utils';
import { BarChart3, Tag, FileText } from 'lucide-react';

const navItems = [
  {
    href: '/tiger',
    label: 'Dashboard',
    icon: BarChart3,
  },
  {
    href: '/tiger/archetipos',
    label: 'Arquetipos',
    icon: Tag,
  },
  {
    href: '/tiger/runbooks',
    label: 'Runbooks',
    icon: FileText,
  },
];

export function TigerNav() {
  const router = useRouter();

  return (
    <nav className="border-b mb-6">
      <div className="container mx-auto px-4">
        <div className="flex gap-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            // For /tiger (dashboard), only match exact path
            // For other routes, match exact path or subpaths
            const isActive = item.href === '/tiger'
              ? router.pathname === '/tiger'
              : router.pathname === item.href || router.pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 py-4 border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
