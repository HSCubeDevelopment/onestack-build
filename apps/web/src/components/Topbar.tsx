'use client';

export function Topbar() {
  return (
    <header className="topbar">
      <div className="search">
        <span>🔍</span>
        <input placeholder="Search for anything…" />
      </div>
      <div className="spacer" />
      <button className="icon-btn" title="Messages">
        ✉<span className="badge-dot" />
      </button>
      <button className="icon-btn" title="Notifications">
        🔔<span className="badge-dot" />
      </button>
      <div className="user">
        <div className="avatar">CP</div>
        <div>
          <div className="u-name">Chirag Patel</div>
          <div className="u-role">Owner</div>
        </div>
        <span className="faint" style={{ fontSize: 11 }}>
          ▾
        </span>
      </div>
    </header>
  );
}
