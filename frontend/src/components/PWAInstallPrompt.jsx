import React, { useState, useEffect } from 'react';

/**
 * PWA Install Prompt - Shows a smart banner when the app is installable
 * Uses the beforeinstallprompt event to trigger native install dialog
 */
const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa_install_dismissed', String(Date.now()));
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.icon}>📱</div>
        <div style={styles.text}>
          <div style={styles.title}>Add Elizian to Home Screen</div>
          <div style={styles.sub}>Quick access, offline support & notifications</div>
        </div>
      </div>
      <div style={styles.actions}>
        <button onClick={handleDismiss} style={styles.dismissBtn}>Later</button>
        <button onClick={handleInstall} style={styles.installBtn}>Install</button>
      </div>
    </div>
  );
};

const styles = {
  banner: {
    position: 'fixed',
    bottom: '60px',
    left: 0,
    right: 0,
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    padding: '0.75rem 1rem',
    zIndex: 9991,
    boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  content: { display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 },
  icon: { fontSize: '1.5rem' },
  text: { flex: 1 },
  title: { fontWeight: 700, fontSize: '0.85rem', color: '#1f2937' },
  sub: { fontSize: '0.7rem', color: '#6b7280' },
  actions: { display: 'flex', gap: '0.5rem', flexShrink: 0 },
  dismissBtn: { padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer' },
  installBtn: { padding: '6px 16px', border: 'none', borderRadius: '8px', background: '#004f4a', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
};

export default PWAInstallPrompt;
