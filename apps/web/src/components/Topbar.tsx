'use client';
import { Search, MessageSquare, Bell, ChevronDown } from 'lucide-react';

export function Topbar() {
  return (
    <header className="topbar">
      <div className="search">
        <Search size={16} />
        <input placeholder="Search for anything…" />
      </div>
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
        <div className="avatar">CP</div>
        <div>
          <div className="u-name">Chirag Patel</div>
          <div className="u-role">Owner</div>
        </div>
        <ChevronDown size={14} color="var(--text-faint)" />
      </div>
    </header>
  );
}
