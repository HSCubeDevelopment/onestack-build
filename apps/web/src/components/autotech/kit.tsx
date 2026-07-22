'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';

/** Identity for the greeting + role label, from the same /api/me the Topbar uses. */
export interface Me {
  userId: string;
  role: 'OWNER' | 'STAFF' | 'TOW';
  signedIn: boolean;
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  return me;
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.assign('/login');
}

/** The sign-out pill shown top-right on the two home screens. */
export function SignOutButton() {
  return (
    <button className="at-signout" onClick={() => void signOut()}>
      <LogOut size={15} /> Sign out
    </button>
  );
}

/** Back bar for the inner screens — a big iOS chevron plus an optional right-hand slot. */
export function AtTopbar({ backHref, right }: { backHref: string; right?: React.ReactNode }) {
  return (
    <div className="at-topbar">
      <Link href={backHref} className="at-back" aria-label="Back">
        &#8249;
      </Link>
      {right ?? <span />}
    </div>
  );
}

/** The Auto Tech logo mark (the little navy wrench/car badge from the demo). */
export function AtLogo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 24 24">
        <path d="M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13m-14 0h14m-14 0v4m14-4v4M7 17h.01M17 17h.01" />
      </svg>
    </span>
  );
}

/** A brief confirmation toast. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="at-toast">{message}</div>;
}
