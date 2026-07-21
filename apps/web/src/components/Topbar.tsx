'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MessageSquare, Bell, LogIn, LogOut } from 'lucide-react';
import { SiteSwitcher } from '@/components/SiteSwitcher';

interface Me {
  userId: string;
  role: 'OWNER' | 'STAFF';
  signedIn: boolean;
}

export function Topbar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  };

  const role = me?.role ?? 'OWNER';

  return (
    <header className="topbar">
      <div className="search">
        <Search size={16} />
        <input placeholder="Search for anything…" />
      </div>
      {/* Multi-workshop switcher (52.2) — only renders for a shop with 2+ sites, owners only. */}
      {role === 'OWNER' && <SiteSwitcher />}
      <div className="spacer" />
      <button className="icon-btn" title="Messages">
        <MessageSquare size={17} />
        <span className="badge-dot" />
      </button>
      <button className="icon-btn" title="Notifications">
        <Bell size={17} />
        <span className="badge-dot" />
      </button>
      <div className="user">
        <div className="avatar">{me?.signedIn ? role.slice(0, 2).toUpperCase() : 'DE'}</div>
        <div>
          <div className="u-name">{me?.signedIn ? 'Signed in' : 'Demo (owner)'}</div>
          <div className="u-role">{role === 'OWNER' ? 'Owner' : 'Staff'}</div>
        </div>
        {me?.signedIn ? (
          <button className="icon-btn" title="Sign out" onClick={signOut}>
            <LogOut size={16} />
          </button>
        ) : (
          <button className="icon-btn" title="Sign in" onClick={() => router.push('/login')}>
            <LogIn size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
