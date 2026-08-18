import { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  copied: boolean;
}

/**
 * Top-level error boundary — the last safety net before a white screen.
 *
 * Design notes (ponytail: inline styles only — CSS/Tailwind may not load in a
 * crash scenario, so every visual must be self-contained in this file):
 *  • Animated gradient glow ring behind the card
 *  • Glassmorphism card with subtle border
 *  • Floating ambient particles for "alive" feel
 *  • Smooth fade-in entrance via CSS @keyframes injected inline
 *  • Collapsible error details with one-click copy
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  handleReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(n => caches.delete(n)));
      }
    } catch (e) {
      console.warn('Cache clear failed:', e);
    }
    window.location.reload();
  };

  handleCopyError = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.message}\n\n${error.stack ?? ''}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, showDetails, copied } = this.state;

    // Inject keyframes once — idempotent because the <style> is inside the
    // error tree which only mounts on crash.
    const keyframes = `
      @keyframes eb-fadein { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes eb-glow { 0%, 100% { transform: translate(-50%, -50%) rotate(0deg); } 50% { transform: translate(-50%, -50%) rotate(180deg); } }
      @keyframes eb-float1 { 0%, 100% { transform: translateY(0) translateX(0); opacity: 0.4; } 50% { transform: translateY(-30px) translateX(12px); opacity: 0.7; } }
      @keyframes eb-float2 { 0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; } 50% { transform: translateY(-20px) translateX(-15px); opacity: 0.6; } }
      @keyframes eb-float3 { 0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; } 50% { transform: translateY(-40px) translateX(8px); opacity: 0.5; } }
      @keyframes eb-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(244, 211, 94, 0.15); } 50% { box-shadow: 0 0 0 12px rgba(244, 211, 94, 0); } }
      @keyframes eb-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    `;

    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0b',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}>
        <style dangerouslySetInnerHTML={{ __html: keyframes }} />

        {/* Ambient background gradient — warm neutral, no blue */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(244,211,94,0.03) 0%, rgba(255,255,255,0.01) 40%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Floating ambient particles */}
        {[
          { top: '20%', left: '15%', size: 4, anim: 'eb-float1 6s ease-in-out infinite', delay: '0s' },
          { top: '70%', left: '75%', size: 3, anim: 'eb-float2 8s ease-in-out infinite', delay: '1s' },
          { top: '30%', left: '80%', size: 5, anim: 'eb-float3 7s ease-in-out infinite', delay: '2s' },
          { top: '65%', left: '20%', size: 3, anim: 'eb-float1 9s ease-in-out infinite', delay: '3s' },
          { top: '15%', left: '60%', size: 4, anim: 'eb-float2 7s ease-in-out infinite', delay: '0.5s' },
          { top: '80%', left: '45%', size: 3, anim: 'eb-float3 8s ease-in-out infinite', delay: '1.5s' },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'rgba(244, 211, 94, 0.5)',
            animation: p.anim,
            animationDelay: p.delay,
            pointerEvents: 'none',
          }} />
        ))}

        {/* Card with glow ring */}
        <div style={{
          position: 'relative',
          maxWidth: 440,
          width: '100%',
          animation: 'eb-fadein 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}>
          {/* Rotating gradient glow behind card */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '120%',
            height: '120%',
            background: 'conic-gradient(from 0deg, rgba(244,211,94,0.10), rgba(255,255,255,0.03), rgba(244,211,94,0.06), rgba(255,255,255,0.03), rgba(244,211,94,0.10))',
            borderRadius: '28px',
            animation: 'eb-glow 8s linear infinite',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }} />

          {/* Glass card */}
          <div style={{
            position: 'relative',
            background: 'linear-gradient(165deg, rgba(16,16,16,0.95) 0%, rgba(10,10,11,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '20px',
            padding: '40px 32px 32px',
            textAlign: 'center',
            backdropFilter: 'blur(20px) saturate(1.2)',
            boxShadow: '0 4px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            {/* Icon — SVG warning triangle with golden gradient */}
            <div style={{
              margin: '0 auto 20px',
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'eb-pulse 3s ease-in-out infinite',
            }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="eb-warn-grad" x1="28" y1="6" x2="28" y2="50" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f4d35e" />
                    <stop offset="1" stopColor="#e6a817" />
                  </linearGradient>
                  <filter id="eb-glow-f" x="-4" y="-4" width="64" height="64">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  d="M25.07 10.54a3.36 3.36 0 0 1 5.86 0l17.83 31.5A3.36 3.36 0 0 1 45.83 47H10.17a3.36 3.36 0 0 1-2.93-5.04l17.83-31.42Z"
                  fill="none"
                  stroke="url(#eb-warn-grad)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  filter="url(#eb-glow-f)"
                />
                <line x1="28" y1="22" x2="28" y2="33" stroke="url(#eb-warn-grad)" strokeWidth="2.8" strokeLinecap="round" />
                <circle cx="28" cy="39" r="1.8" fill="url(#eb-warn-grad)" />
              </svg>
            </div>

            {/* Title */}
            <h1 style={{
              fontSize: 22,
              fontWeight: 700,
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Something went wrong
            </h1>

            {/* Subtitle */}
            <p style={{
              fontSize: 14,
              color: '#64748b',
              margin: '0 0 28px',
              lineHeight: 1.6,
            }}>
              An unexpected error occurred.
              <br />
              Reloading usually fixes it.
            </p>

            {/* Reload button */}
            <button
              onClick={this.handleReload}
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, #f4d35e 0%, #e6a817 100%)',
                color: '#0f1219',
                border: 'none',
                borderRadius: '12px',
                padding: '13px 32px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                width: '100%',
                letterSpacing: '-0.01em',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 2px 16px rgba(244, 211, 94, 0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)';
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(244, 211, 94, 0.35), inset 0 1px 0 rgba(255,255,255,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 16px rgba(244, 211, 94, 0.25), inset 0 1px 0 rgba(255,255,255,0.3)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)';
              }}
            >
              Reload App
            </button>

            {/* Divider */}
            {error && (
              <div style={{ marginTop: 24 }}>
                <div style={{
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
                  marginBottom: 16,
                }} />

                {/* Error details toggle */}
                <button
                  onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 6,
                    transition: 'color 0.15s, background 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
                    transition: 'transform 0.2s',
                    transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}>
                    <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Error details
                </button>

                {showDetails && (
                  <div style={{
                    marginTop: 12,
                    textAlign: 'left',
                    animation: 'eb-fadein 0.25s ease-out both',
                  }}>
                    {/* Error message pill */}
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#f87171',
                      background: 'rgba(248, 113, 113, 0.08)',
                      border: '1px solid rgba(248, 113, 113, 0.12)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      marginBottom: 8,
                      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
                      wordBreak: 'break-word',
                    }}>
                      {error.message}
                    </div>

                    {/* Stack trace */}
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      padding: '12px',
                      borderRadius: '10px',
                      maxHeight: 180,
                      overflow: 'auto',
                      fontSize: 11,
                      lineHeight: 1.6,
                      color: '#475569',
                      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
                      margin: '0 0 8px',
                    }}>
                      {error.stack}
                    </pre>

                    {/* Copy button */}
                    <button
                      onClick={this.handleCopyError}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        color: copied ? '#4ade80' : '#64748b',
                        fontSize: 12,
                        padding: '6px 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => {
                        if (!copied) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                      }}
                    >
                      {copied ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7.5L5.5 10L11 4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <rect x="5" y="5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M9 5V3.5A1.5 1.5 0 0 0 7.5 2h-4A1.5 1.5 0 0 0 2 3.5v4A1.5 1.5 0 0 0 3.5 9H5" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      )}
                      {copied ? 'Copied' : 'Copy error'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Subtle version / brand hint */}
        <p style={{
          position: 'absolute',
          bottom: 24,
          fontSize: 11,
          color: 'rgba(255,255,255,0.06)',
          letterSpacing: '0.05em',
          margin: 0,
        }}>
          SITKU
        </p>
      </div>
    );
  }
}

export default ErrorBoundary;
