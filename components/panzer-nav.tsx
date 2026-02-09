import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { cn } from '~/lib/utils';
import { BarChart3, Tag, FileText } from 'lucide-react';

const navItems = [
  {
    href: '/panzer',
    label: 'Dashboard',
    icon: BarChart3,
  },
  {
    href: '/panzer/archetipos',
    label: 'Arquetipos',
    icon: Tag,
  },
  {
    href: '/panzer/runbooks',
    label: 'Runbooks',
    icon: FileText,
  },
];

export function PanzerNav() {
  const router = useRouter();

  return (
    <nav className="border-b mb-6">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-8">
          <Link href="/panzer" className="flex items-center gap-3 py-4">
            <Image
              src="/assets/panzer_cropped.png"
              alt="Panzer"
              width={40}
              height={40}
              className="object-contain"
            />
            <span className="text-xl font-bold text-foreground">Panzer</span>
          </Link>
          <div className="flex gap-6 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            // For /panzer (dashboard), only match exact path
            // For other routes, match exact path or subpaths
            const isActive = item.href === '/panzer'
              ? router.pathname === '/panzer'
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
      </div>
    </nav>
  );
}
