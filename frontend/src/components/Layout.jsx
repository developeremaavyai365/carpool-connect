import { useState, useRef, useEffect } from 'react';

import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

import Avatar from './Avatar';

import { ThemeToggleIcon } from './ThemeToggle';

import './Layout.css';



const PRIMARY_NAV = [

  { to: '/dashboard', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', match: ['/dashboard'] },

  { to: '/publish-commute', label: 'Publish commute', icon: 'M12 5v14M5 12h14', match: ['/publish-commute'] },

  { to: '/my-commutes', label: 'My commutes', icon: 'M9 17H7l-4-4V5a2 2 0 012-2h10a2 2 0 012 2v8l-4 4h-2M9 17v-4h6v4', match: ['/my-commutes'] },

  { to: '/requests', label: 'Requests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', badge: 'pending' },

  { to: '/rides', label: 'Rides', icon: 'M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2' },

  { to: '/notifications', label: 'Inbox', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', badge: 'unread' },

  { to: '/profile', label: 'Profile', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },

];



const SECONDARY_NAV = [

  { to: '/browse-rides', label: 'Browse rides', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7v6l4 2' },

];



function NavIcon({ d }) {

  return (

    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

      <path d={d} />

    </svg>

  );

}



function isNavActive(pathname, item) {

  if (item.match) return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return pathname === item.to || pathname.startsWith(`${item.to}/`);

}



export default function Layout({ children }) {

  const { user, logout, unreadCount, pendingCount } = useAuth();

  const { pathname } = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef(null);



  useEffect(() => {

    function handleClick(e) {

      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);

    }

    document.addEventListener('mousedown', handleClick);

    return () => document.removeEventListener('mousedown', handleClick);

  }, []);



  const handleLogout = () => {
    setMenuOpen(false);
    logout();
  };



  const getBadge = (type) => {

    if (type === 'unread' && unreadCount > 0) return unreadCount > 9 ? '9+' : unreadCount;

    if (type === 'pending' && pendingCount > 0) return pendingCount > 9 ? '9+' : pendingCount;

    return null;

  };



  return (

    <div className="layout">

      <aside className="sidebar">

        <NavLink to="/dashboard" className="sidebar-brand">

          <span className="sidebar-brand-icon">

            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">

              <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2" />

            </svg>

          </span>

          CarPool Connect

        </NavLink>



        <nav className="sidebar-nav">

          {PRIMARY_NAV.map(({ to, label, icon, badge, match }) => (

            <NavLink

              key={to}

              to={to}

              className={() => `sidebar-link ${isNavActive(pathname, { to, match }) ? 'active' : ''}`}

            >

              <NavIcon d={icon} />

              {label}

              {badge && getBadge(badge) && <span className="sidebar-link-badge">{getBadge(badge)}</span>}

            </NavLink>

          ))}



          <div className="sidebar-nav-divider" />



          {SECONDARY_NAV.map(({ to, label, icon, badge }) => (

            <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link sidebar-link-secondary ${isActive ? 'active' : ''}`}>

              <NavIcon d={icon} />

              {label}

              {badge && getBadge(badge) && <span className="sidebar-link-badge">{getBadge(badge)}</span>}

            </NavLink>

          ))}

        </nav>



        <div className="sidebar-footer">

          <div className="sidebar-theme-row">

            <span className="sidebar-theme-label">Appearance</span>

            <ThemeToggleIcon />

          </div>

          <div className="sidebar-user">

            <Avatar name={user?.name} size="md" />

            <div className="sidebar-user-info">

              <div className="sidebar-user-name">{user?.name}</div>

              <div className="sidebar-user-city">{user?.email}</div>

            </div>

          </div>

          <button className="btn btn-secondary btn-sm btn-block logout-btn" onClick={handleLogout}>

            Sign Out

          </button>

        </div>

      </aside>



      <div className="layout-main">

        <header className="topbar">

          <span className="topbar-brand">CarPool Connect</span>

          <div className="topbar-actions">

            <ThemeToggleIcon />

            <div className="user-menu" ref={menuRef}>

              <button className="user-menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Account menu">

                <Avatar name={user?.name} size="sm" />

              </button>

              {menuOpen && (

                <div className="user-menu-dropdown">

                  <div className="user-menu-header">

                    <strong>{user?.name}</strong>

                    <span>{user?.email}</span>

                  </div>

                  <NavLink to="/profile" className="user-menu-item" onClick={() => setMenuOpen(false)}>My Profile</NavLink>

                  <NavLink to="/requests" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                    Requests{pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </NavLink>

                  <button className="user-menu-item user-menu-logout" onClick={handleLogout}>Sign Out</button>

                </div>

              )}

            </div>

          </div>

        </header>



        <main className="main-content">

          <div className="container page-enter">{children}</div>

        </main>

      </div>



      <nav className="mobile-nav" aria-label="Main navigation">

        <div className="mobile-nav-pill">

          {PRIMARY_NAV.map(({ to, label, icon, badge, match }) => {

            const active = isNavActive(pathname, { to, match });

            const count = badge ? getBadge(badge) : null;

            return (

              <NavLink

                key={to}

                to={to}

                className={`mobile-nav-link ${active ? 'active' : ''}`}

                aria-current={active ? 'page' : undefined}

              >

                <span className="mobile-nav-icon-wrap">

                  <NavIcon d={icon} />

                  {count != null && <span className="mobile-nav-badge">{count}</span>}

                </span>

                <span className="mobile-nav-label">{label.split(' ')[0]}</span>

              </NavLink>

            );

          })}

        </div>

      </nav>

    </div>

  );

}


