'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from './button';

interface SiteHeaderProps {
  readonly homeHref?: string;
  readonly settingsHref?: string;
  readonly resumesHref?: string;
}

function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_ITEM_BASE = [
  'flex h-[30px] items-center rounded-md px-[10px] text-[13px] font-medium tabular-nums',
  'hover:bg-surface-2',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
].join(' ');

export function SiteHeader({
  homeHref = '/',
  settingsHref = '/configuracoes',
  resumesHref = '/curriculos',
}: SiteHeaderProps): React.JSX.Element {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';

  const links = [
    { href: homeHref, label: 'Início' },
    { href: resumesHref, label: 'Currículos' },
    { href: settingsHref, label: 'Configurações' },
  ];

  return (
    <header className="sticky top-0 z-20 h-14 border-b border-border bg-bg">
      <div className="mx-auto flex h-full w-full max-w-[1160px] items-center gap-6 px-8">
        <Link
          href={homeHref}
          className="flex items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span
            aria-hidden="true"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-fg"
          >
            cv
          </span>
          <span className="font-semibold text-text">cv-adapter</span>
        </Link>
        <nav aria-label="Navegação principal" className="flex items-center gap-1">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href + link.label}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`${NAV_ITEM_BASE} ${active ? 'bg-surface-2 text-text' : 'text-text-2 hover:text-text'}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <IconButton
            aria-label={!mounted ? 'Alternar tema' : isDark ? 'Usar tema claro' : 'Usar tema escuro'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {!mounted ? (
              <>
                <Moon size={16} aria-hidden="true" className="block dark:hidden" />
                <Sun size={16} aria-hidden="true" className="hidden dark:block" />
              </>
            ) : isDark ? (
              <Sun size={16} aria-hidden="true" />
            ) : (
              <Moon size={16} aria-hidden="true" />
            )}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
