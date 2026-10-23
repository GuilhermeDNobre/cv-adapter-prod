function withScheme(link: string): string {
  const trimmed = link.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function extractHostname(link: string): string {
  const trimmed = link.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    return new URL(withScheme(trimmed)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLinkedInHost(hostname: string): boolean {
  return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
}

function isGitHubHost(hostname: string): boolean {
  return hostname === 'github.com' || hostname === 'www.github.com';
}

function isGitHubProfilePath(link: string): boolean {
  const trimmed = link.trim();
  try {
    const pathname = new URL(withScheme(trimmed)).pathname;
    const segments = pathname.split('/').filter((segment) => segment !== '');
    return segments.length <= 1;
  } catch {
    const withoutScheme = trimmed.replace(/^https?:\/\//i, '');
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex === -1) {
      return true;
    }
    const path = withoutScheme.slice(slashIndex + 1).split(/[?#]/)[0] ?? '';
    return path.split('/').filter((segment) => segment !== '').length <= 1;
  }
}

function stripScheme(link: string): string {
  return link.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function resolveLinkLabel(rawLink: string): string {
  const trimmed = rawLink.trim();
  if (trimmed === '') {
    return '';
  }
  const hostname = extractHostname(trimmed);
  if (isLinkedInHost(hostname)) {
    return 'LinkedIn';
  }
  if (isGitHubHost(hostname) && isGitHubProfilePath(trimmed)) {
    return 'GitHub';
  }
  return stripScheme(trimmed);
}

export function toLinkHref(rawLink: string): string {
  return withScheme(rawLink.trim());
}

export function toPhoneHref(rawPhone: string): string {
  const normalized = rawPhone.trim().replace(/[\s().-]/g, '');
  return `tel:${normalized}`;
}

export function toEmailHref(rawEmail: string): string {
  return `mailto:${rawEmail.trim()}`;
}
