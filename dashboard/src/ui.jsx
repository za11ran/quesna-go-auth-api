import { useCallback, useEffect, useState } from 'react';

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export const Money = ({ v }) => <span>{Number(v || 0).toLocaleString('ar-EG')} ج.م</span>;

export function Empty({ children = 'لا توجد بيانات' }) {
  return <div className="empty">{children}</div>;
}

export function ErrBox({ error }) {
  if (!error) return null;
  return <div className="err">{error.message || String(error)}</div>;
}

export function Pill({ tone = '', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const STATUS_TONE = {
  pending: 'warn', approved: 'ok', rejected: 'danger', cancelled: '',
  active: 'ok', suspended: 'danger', delivered: 'ok', on_the_way: 'blue',
  ready_for_pickup: 'blue', assigned: 'blue', preparing: 'warn', accepted: 'ok',
  available: 'ok', busy: 'warn', offline: '',
};
export const statusTone = (s) => STATUS_TONE[s] || '';

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal">
        <div className="card-pad row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <strong>{title}</strong>
          <button className="btn sm" onClick={onClose}>إغلاق</button>
        </div>
        <div className="card-pad">{children}</div>
        {footer && <div className="card-pad row" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Table({ head, children }) {
  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
