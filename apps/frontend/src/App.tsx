import { type FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';

import './App.css';

type Page = 'home' | 'dashboard' | 'payment' | 'history' | 'admin';
type AuthMode = 'signin' | 'signup';
type PaymentStatus = 'Pending' | 'Paid' | 'Confirmed';

type PaymentLink = {
  fullName: string;
  cashtag: string;
  walletName: string;
  lightningInvoice: string;
  amount: string;
  note: string;
};

type HistoryItem = {
  sender: string;
  amount: string;
  date: string;
  status: PaymentStatus;
};

const initialPayment: PaymentLink = {
  fullName: '',
  cashtag: '',
  walletName: '',
  lightningInvoice: '',
  amount: '',
  note: '',
};

const initialHistory: HistoryItem[] = [];

const adminUsers: { name: string; role: string; access: string }[] = [];

const adminLinks: { owner: string; amount: string; status: string }[] = [];
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const isLocalSite = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = configuredApiBaseUrl || (isLocalSite ? 'http://127.0.0.1:8000' : '');
const authTokenKey = 'cash-app-access-token';

function CashIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="M12 3v18" />
      <path d="M17 7.5c-1.2-1-2.8-1.5-4.7-1.5-2.6 0-4.3 1.1-4.3 2.9 0 1.7 1.2 2.4 4.5 3.1 3.5.8 5.2 1.8 5.2 4.1 0 2.2-2 3.9-5.4 3.9-2.4 0-4.5-.7-6.1-2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <rect height="12" rx="2" width="12" x="8" y="8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function encodePayment(payment: PaymentLink) {
  return new URLSearchParams({
    view: 'pay',
    name: payment.fullName,
    cashtag: payment.cashtag,
    wallet: payment.walletName,
    invoice: payment.lightningInvoice,
  }).toString();
}

function readPaymentFromUrl(): PaymentLink | null {
  const query = new URLSearchParams(window.location.search);

  if (query.get('view') !== 'pay' || !query.has('invoice')) {
    return null;
  }

  return {
    fullName: query.get('name') || '',
    cashtag: query.get('cashtag') || '',
    walletName: query.get('wallet') || '',
    lightningInvoice: query.get('invoice') || '',
    amount: '',
    note: '',
  };
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status.toLowerCase()}`}>{status}</span>;
}

type ApiPaymentLink = {
  cashtag: string;
  full_name: string;
  lightning_invoice: string;
  updated_at?: string | null;
  wallet_name: string;
};

type AuthResponse = {
  access_token: string;
  email: string;
  token_type: string;
};

function toPaymentLink(payload: ApiPaymentLink): PaymentLink {
  return {
    amount: '',
    cashtag: payload.cashtag,
    fullName: payload.full_name,
    lightningInvoice: payload.lightning_invoice,
    note: '',
    walletName: payload.wallet_name,
  };
}

function toApiPaymentLink(paymentLink: PaymentLink): ApiPaymentLink {
  return {
    cashtag: paymentLink.cashtag,
    full_name: paymentLink.fullName,
    lightning_invoice: paymentLink.lightningInvoice,
    wallet_name: paymentLink.walletName,
  };
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  if (!apiBaseUrl) {
    throw new Error('Secure backend is not connected on this public website yet.');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as T;
}

async function authenticatedRequest<T>(path: string, token: string, options: RequestInit = {}) {
  return apiRequest<T>(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function QrCode({ value }: { value: string }) {
  const [qrImage, setQrImage] = useState('');

  useEffect(() => {
    let active = true;

    if (!value.trim()) {
      setQrImage('');
      return;
    }

    void QRCode.toDataURL(value, {
      color: {
        dark: '#111713',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      width: 260,
    }).then((dataUrl) => {
      if (active) {
        setQrImage(dataUrl);
      }
    });

    return () => {
      active = false;
    };
  }, [value]);

  if (!qrImage) {
    return <div aria-label="Empty QR code area" className="qr-code empty" role="img" />;
  }

  return (
    <div aria-label="Lightning invoice QR code" className="qr-code" role="img">
      <img alt="Lightning invoice QR code" src={qrImage} />
    </div>
  );
}

function App() {
  const urlPayment = readPaymentFromUrl();
  const isSenderView = Boolean(urlPayment);
  const [page, setPage] = useState<Page>(urlPayment ? 'payment' : 'home');
  const [payment, setPayment] = useState<PaymentLink>(urlPayment || initialPayment);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [copyMessage, setCopyMessage] = useState('Ready to copy');
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem(authTokenKey) || '');

  const shareUrl = `${window.location.origin}${window.location.pathname}?${encodePayment(payment)}`;
  const protectedPages: Page[] = ['dashboard', 'history', 'admin'];
  const isAuthenticated = Boolean(authToken);

  const updatePayment = (key: keyof PaymentLink, value: string) => {
    setPayment((current) => ({ ...current, [key]: value }));
  };

  const goToPage = (nextPage: Page) => {
    if (!isSenderView && protectedPages.includes(nextPage) && !isAuthenticated) {
      setAuthMode('signin');
      setPage('home');
      setAuthMessage('Sign in to continue.');
      return;
    }

    setPage(nextPage);
  };

  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    setCopyMessage(message);
  };

  const loadSavedPaymentLink = async (token: string) => {
    const savedPayment = await authenticatedRequest<ApiPaymentLink>('/api/payment-link', token);
    setPayment((current) => ({
      ...toPaymentLink(savedPayment),
      amount: current.amount,
      note: current.note,
    }));
  };

  useEffect(() => {
    let active = true;

    if (!authToken || isSenderView) {
      return;
    }

    void authenticatedRequest<{ email: string; id: number }>('/api/auth/me', authToken)
      .then(() => loadSavedPaymentLink(authToken))
      .catch(() => {
        if (!active) {
          return;
        }

        window.localStorage.removeItem(authTokenKey);
        setAuthToken('');
        setAuthMessage('Session expired. Sign in again.');
        setPage('home');
      });

    return () => {
      active = false;
    };
  }, [authToken, isSenderView]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage('');

    const email = authEmail.trim().toLowerCase();

    if (!email || !authPassword) {
      setAuthMessage('Enter your email and password.');
      return;
    }

    if (authMode === 'signup' && authPassword.length < 8) {
      setAuthMessage('Use a password with at least 8 characters.');
      return;
    }

    setAuthLoading(true);

    try {
      const endpoint = authMode === 'signin' ? '/api/auth/signin' : '/api/auth/signup';
      const authResponse = await apiRequest<AuthResponse>(endpoint, {
        body: JSON.stringify({ email, password: authPassword }),
        method: 'POST',
      });

      window.localStorage.setItem(authTokenKey, authResponse.access_token);
      setAuthToken(authResponse.access_token);
      setAuthPassword('');
      setAuthMessage(authMode === 'signin' ? 'Signed in.' : 'Account created.');
      await loadSavedPaymentLink(authResponse.access_token);
      setPage('dashboard');
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect to the backend. Try again.',
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = () => {
    window.localStorage.removeItem(authTokenKey);
    setAuthToken('');
    setAuthPassword('');
    setPage('home');
    setAuthMessage('Signed out.');
  };

  const savePaymentLink = async () => {
    if (!authToken) {
      setCopyMessage('Sign in to save details.');
      return;
    }

    setCopyMessage('Saving...');

    try {
      const savedPayment = await authenticatedRequest<ApiPaymentLink>('/api/payment-link', authToken, {
        body: JSON.stringify(toApiPaymentLink(payment)),
        method: 'PUT',
      });
      setPayment((current) => ({
        ...toPaymentLink(savedPayment),
        amount: current.amount,
        note: current.note,
      }));
      setCopyMessage('Payment details saved.');
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : 'Unable to save details.');
    }
  };

  const markAsPaid = () => {
    if (isSenderView) {
      setCopyMessage('Payment marked as paid');
      return;
    }

    setHistory((current) => [
      {
        sender: 'Payment page visitor',
        amount: `$${payment.amount || '0.00'}`,
        date: new Date().toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        status: 'Paid',
      },
      ...current,
    ]);
    setCopyMessage('Payment recorded as paid');
    setPage('history');
  };

  return (
    <div className="app-shell">
      <header className={`topbar ${isSenderView ? 'sender-topbar' : ''}`}>
        <button
          className="brand"
          disabled={isSenderView}
          onClick={() => goToPage('home')}
          type="button"
        >
          <span>
            <CashIcon />
          </span>
          Cash App
        </button>

        {!isSenderView && (
          <nav aria-label="Main navigation">
            {(['home', 'dashboard', 'payment', 'history', 'admin'] as Page[]).map((item) => (
              <button
                className={page === item ? 'active' : ''}
                key={item}
                onClick={() => goToPage(item)}
                type="button"
              >
                {item}
              </button>
            ))}
            {isAuthenticated && (
              <button onClick={signOut} type="button">
                sign out
              </button>
            )}
          </nav>
        )}
      </header>

      {!isSenderView && page === 'home' && (
        <main className="home-view">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">Fast Bitcoin checkout</p>
              <h1>Cash App</h1>
              <p>
                Create a private payment page, send it to a payer, and receive Bitcoin through a
                Lightning invoice.
              </p>
              <div className="hero-actions">
                <button className="primary-button" onClick={() => goToPage('dashboard')} type="button">
                  <CashIcon />
                  Create Payment Link
                </button>
                <button className="secondary-button" onClick={() => goToPage('payment')} type="button">
                  View Payment Page
                </button>
              </div>
            </div>

            {!isAuthenticated ? (
              <form className="auth-card" onSubmit={submitAuth}>
                <div className="section-heading">
                  <p className="eyebrow">{authMode === 'signin' ? 'Sign in' : 'Sign up'}</p>
                  <h2>{authMode === 'signin' ? 'Welcome back' : 'Create account'}</h2>
                </div>
                <label>
                  Email
                  <input
                    autoComplete="email"
                    onChange={(event) => setAuthEmail(event.target.value)}
                    type="email"
                    value={authEmail}
                  />
                </label>
                <label>
                  Password
                  <input
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    type="password"
                    value={authPassword}
                  />
                </label>
                <button className="primary-button" disabled={authLoading} type="submit">
                  {authLoading ? 'Checking...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
                <button
                  className="secondary-button compact-button"
                  disabled={authLoading}
                  onClick={() => {
                    setAuthMode((current) => (current === 'signin' ? 'signup' : 'signin'));
                    setAuthMessage('');
                  }}
                  type="button"
                >
                  {authMode === 'signin' ? 'Create Account' : 'Use Sign In'}
                </button>
                {authMessage && <p className="helper-text">{authMessage}</p>}
              </form>
            ) : (
              <div className="phone-preview" aria-label="Payment page preview">
                <div className="phone-top">
                  <span />
                  <strong>Cash App Pay</strong>
                </div>
                <QrCode value={payment.lightningInvoice} />
                <div className="preview-amount">$</div>
                <p />
                <div className="mini-flow">
                  <span>Sender</span>
                  <span>Cash App</span>
                  <span>Receiver wallet</span>
                </div>
              </div>
            )}
          </section>

          <section className="flow-grid" aria-label="Payment flow">
            {[
              ['1', 'Create your link', 'Add your receiving wallet and Lightning invoice details.'],
              ['2', 'Sender enters details', 'The sender writes the amount and payment purpose.'],
              ['3', 'Receive Bitcoin', 'The sender pays the Lightning invoice from Cash App.'],
            ].map(([number, title, detail]) => (
              <article className="feature-card" key={title}>
                <strong>{number}</strong>
                <h2>{title}</h2>
                <p>{detail}</p>
              </article>
            ))}
          </section>
        </main>
      )}

      {!isSenderView && isAuthenticated && page === 'dashboard' && (
        <main className="workspace">
          <section className="panel form-panel">
            <div className="section-heading">
              <p className="eyebrow">Receiver dashboard</p>
              <h1>Create payment link</h1>
            </div>

            <div className="form-grid">
              <label>
                Full name
                <input
                  onChange={(event) => updatePayment('fullName', event.target.value)}
                  value={payment.fullName}
                />
              </label>
              <label>
                $Cashtag
                <input
                  onChange={(event) => updatePayment('cashtag', event.target.value)}
                  value={payment.cashtag}
                />
              </label>
              <label>
                Wallet name
                <input
                  onChange={(event) => updatePayment('walletName', event.target.value)}
                  value={payment.walletName}
                />
              </label>
              <label className="wide">
                Lightning invoice
                <textarea
                  onChange={(event) => updatePayment('lightningInvoice', event.target.value)}
                  value={payment.lightningInvoice}
                />
              </label>
            </div>

            <div className="button-row">
              <button className="success-button" onClick={savePaymentLink} type="button">
                <CheckIcon />
                Save Details
              </button>
              <button className="primary-button" onClick={() => goToPage('payment')} type="button">
                Preview Payment Page
              </button>
              <button
                className="secondary-button"
                onClick={() => copyText(shareUrl, 'Payment link copied')}
                type="button"
              >
                <CopyIcon />
                Copy Share Link
              </button>
            </div>
          </section>

          <aside className="panel preview-panel">
            <p className="eyebrow">Private sender link</p>
            <QrCode value={payment.lightningInvoice} />
            <div className="link-preview">{shareUrl}</div>
            <button
              className="secondary-button compact-button"
              onClick={() => copyText(shareUrl, 'Payment link copied')}
              type="button"
            >
              <CopyIcon />
              Copy Link
            </button>
            <p className="helper-text">{copyMessage}</p>
          </aside>
        </main>
      )}

      {page === 'payment' && (
        <main className="payment-view">
          <section className="checkout-card">
            <div className="checkout-header">
              <div>
                <p className="eyebrow">Cash App checkout</p>
                <h1>Pay {payment.fullName}</h1>
              </div>
              <StatusBadge status="Pending" />
            </div>

            <QrCode value={payment.lightningInvoice} />

            <div className="amount-block">
              <span>Payment details</span>
              {isSenderView ? (
                <div className="sender-fields">
                  <label>
                    Amount to send
                    <input
                      inputMode="decimal"
                      onChange={(event) => updatePayment('amount', event.target.value)}
                      value={payment.amount}
                    />
                  </label>
                  <label>
                    Purpose of payment
                    <input
                      onChange={(event) => updatePayment('note', event.target.value)}
                      value={payment.note}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <strong>${payment.amount || '0.00'}</strong>
                  <p>{payment.note || 'Bitcoin Lightning payment'}</p>
                </>
              )}
            </div>

            <div className="receiver-details">
              <span>{payment.cashtag}</span>
              <span>{payment.walletName}</span>
            </div>

            <ol className="instructions">
              <li>Enter your amount and purpose here for the receiver record.</li>
              <li>Scan this QR code or paste the Lightning invoice.</li>
              <li>Confirm payment, then tap Mark as Paid here.</li>
            </ol>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => copyText(payment.lightningInvoice, 'Lightning invoice copied')}
                type="button"
              >
                <CopyIcon />
                Copy Lightning Invoice
              </button>
              {isSenderView && (
                <button
                  className="secondary-button"
                  onClick={() => copyText(window.location.href, 'Payment page link copied')}
                  type="button"
                >
                  <CopyIcon />
                  Copy Link
                </button>
              )}
              <button className="success-button" onClick={markAsPaid} type="button">
                <CheckIcon />
                Mark as Paid
              </button>
            </div>

            <p className="helper-text">
              {copyMessage}. Cash App sends the payment; this page only shows the request.
            </p>
          </section>
        </main>
      )}

      {!isSenderView && isAuthenticated && page === 'history' && (
        <main className="workspace single">
          <section className="panel">
            <div className="section-heading">
              <p className="eyebrow">Payment history</p>
              <h1>Recent payment records</h1>
            </div>
            {history.length > 0 && (
              <div className="table">
                <div className="table-head">
                  <span>Sender</span>
                  <span>Amount</span>
                  <span>Date</span>
                  <span>Status</span>
                </div>
                {history.map((item, index) => (
                  <div className="table-row" key={`${item.sender}-${index}`}>
                    <strong>{item.sender}</strong>
                    <span>{item.amount}</span>
                    <span>{item.date}</span>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {!isSenderView && isAuthenticated && page === 'admin' && (
        <main className="workspace">
          <section className="panel">
            <div className="section-heading">
              <p className="eyebrow">Admin page</p>
              <h1>User access</h1>
            </div>
            <div className="admin-list">
              {adminUsers.map((user) => (
                <div className="admin-row" key={user.name}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.role}</span>
                  </div>
                  <StatusBadge status={user.access} />
                </div>
              ))}
              {adminUsers.length === 0 && <div className="empty-state" />}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <p className="eyebrow">Admin controls</p>
              <h1>Payment links</h1>
            </div>
            <div className="admin-list">
              {adminLinks.map((link) => (
                <div className="admin-row" key={`${link.owner}-${link.amount}`}>
                  <div>
                    <strong>{link.owner}</strong>
                    <span>{link.amount}</span>
                  </div>
                  <div className="admin-actions">
                    <button type="button">Approve</button>
                    <button type="button">Disable</button>
                  </div>
                </div>
              ))}
              {adminLinks.length === 0 && <div className="empty-state" />}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export { App };
