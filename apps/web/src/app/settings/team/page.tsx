'use client';
import { useState } from 'react';
import { ShieldCheck, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useRole } from '@/lib/use-role';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

interface Member {
  userId: string;
  email: string | null;
  role: 'OWNER' | 'STAFF';
  canViewFinance: boolean;
}

/**
 * Team & access (40.8). The owner sees everyone in the workshop and controls who can view money: an
 * owner always can; a staff member only if granted here. Owner-only (the API enforces it too).
 */
export default function TeamPage() {
  const { isStaff } = useRole();
  const { data, loading, error, reload } = useAsync(() => api.get<Member[]>('/auth/directory'), []);
  const members = data ?? [];

  if (isStaff) {
    return (
      <>
        <PageHead title="Team" />
        <div className="card">
          <EmptyState>Only the owner can manage the team.</EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="Team & access" sub="Who's in the workshop, and who can see money" />
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <div className="card">
          {members.length === 0 ? (
            <EmptyState>No team members yet.</EmptyState>
          ) : (
            members.map((m) => <MemberRow key={m.userId} member={m} onChanged={reload} />)
          )}
          <div className="hintnote" style={{ marginTop: 12 }}>
            <ShieldCheck size={12} style={{ verticalAlign: '-1px' }} /> Finance access lets a staff
            member open <strong>Money &amp; Payments</strong> and invoices. Owners always have it.
          </div>
        </div>
      )}
    </>
  );
}

function MemberRow({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isOwner = member.role === 'OWNER';

  async function toggleFinance() {
    setErr(null);
    setBusy(true);
    try {
      await api.patch(`/auth/members/${member.userId}/finance`, {
        canViewFinance: !member.canViewFinance,
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not update finance access');
      setBusy(false);
    }
  }

  return (
    <div className="job-row">
      <div className="job-row-main">
        <span className="more-icon" aria-hidden>
          <User size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>
            {member.email ?? member.userId.slice(0, 8)}
            <span className="badge" style={{ marginLeft: 8 }}>
              {isOwner ? 'Owner' : 'Staff'}
            </span>
          </b>
          <div className="job-cust">
            {member.canViewFinance ? 'Can view money' : 'No finance access'}
          </div>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <ErrorBanner message={err} />
        {isOwner ? (
          <span className="faint" style={{ fontSize: 12 }}>
            Always
          </span>
        ) : (
          <button
            className={`btn sm ${member.canViewFinance ? 'primary' : ''}`}
            disabled={busy}
            onClick={() => void toggleFinance()}
          >
            {busy ? '…' : member.canViewFinance ? 'Revoke finance' : 'Grant finance'}
          </button>
        )}
      </div>
    </div>
  );
}
