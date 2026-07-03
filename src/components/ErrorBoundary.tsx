import { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
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

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0f1e',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>
            The app encountered an unexpected error. Tap reload to try again.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 32px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
              width: '100%',
            }}
          >
            Reload App
          </button>
          {this.state.error && (
            <details style={{ textAlign: 'left', fontSize: '12px', color: '#64748b' }}>
              <summary
                style={{ cursor: 'pointer', marginBottom: '8px' }}
              >
                Error details
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'rgba(0,0,0,0.3)',
                padding: '12px',
                borderRadius: '8px',
                maxHeight: '200px',
                overflow: 'auto',
              }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
