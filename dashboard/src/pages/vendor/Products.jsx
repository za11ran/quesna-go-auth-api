import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiBase } from '../../api';
import { useAsync, ErrBox, Empty, Pill, Modal, Field, Money } from '../../ui';

const CATS = ['grocery', 'dairyAndCheese', 'cleaning', 'beverages', 'snacks', 'frozen', 'other'];

export default function VendorProducts() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/vendor/products?per_page=100'));
  const { data: vendorData } = useAsync(() => api.get('/api/vendor/profile'));
  const { data: sectionsData } = useAsync(() => api.get('/api/vendor/menu-sections'));
  const [edit, setEdit] = useState(null);      // product for edit modal
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const rows = data?.data || [];
  const isRestaurant = vendorData?.type === 'restaurant';
  const sections = sectionsData?.data || [];
  const colCount = isRestaurant ? 8 : 7;

  const patch = useCallback(async (id, patchBody) => {
    setBusy(id); setMsg(null);
    try { await api.patch(`/api/vendor/products/${id}`, patchBody); reload(); }
    catch (e) { setMsg(e.message); } finally { setBusy(null); }
  }, [reload]);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">المنتجات</h1>
          <p className="page-sub">الكمية والإخفاء فوريّان — السعر/الاسم/الأحجام تروح لمراجعة الإدارة</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ منتج</button>
      </div>
      {isRestaurant && (
        <div className="card" style={{ marginBottom: 12 }}>
          <Link to="/vendor/menu-sections" className="btn sm">إدارة أقسام القائمة (بيتزا، برجر...)</Link>
        </div>
      )}
      <ErrBox error={error} />
      {msg && <div className="err">{msg}</div>}
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>المنتج</th><th>السعر</th><th>القسم</th>{isRestaurant && <th>قسم القائمة</th>}<th>الكمية</th><th>متاح؟</th><th>حالة</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={colCount} className="empty">تحميل…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={colCount}><Empty /></td></tr>
              : rows.map((p) => (
                <tr key={p.id}>
                  <td className="row">
                    {p.image && <img src={apiBase + p.image} alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: 'cover' }} />}
                    {p.name_ar}
                  </td>
                  <td><Money v={p.price} /></td>
                  <td>{p.category || '—'}</td>
                  {isRestaurant && (
                    <td style={{ width: 140 }}>
                      <select value={p.menu_section_id || ''} disabled={busy === p.id}
                        onChange={(e) => patch(p.id, { menu_section_id: e.target.value || null })}>
                        <option value="">بدون قسم</option>
                        {sections.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
                      </select>
                    </td>
                  )}
                  <td style={{ width: 130 }}>
                    <input type="number" defaultValue={p.stock ?? ''} placeholder="∞" style={{ width: 70 }}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        if (v !== (p.stock ?? null)) patch(p.id, { stock: v });
                      }} disabled={busy === p.id} />
                  </td>
                  <td>
                    <input type="checkbox" defaultChecked={p.is_available}
                      onChange={(e) => patch(p.id, { is_available: e.target.checked })} disabled={busy === p.id} />
                  </td>
                  <td>{p.has_pending_change ? <Pill tone="warn">قيد المراجعة</Pill> : <Pill tone="ok">فعّال</Pill>}</td>
                  <td className="row">
                    <button className="btn sm" onClick={() => setEdit(p)}>تعديل</button>
                    <ImgBtn id={p.id} onDone={reload} />
                    <button className="btn sm danger" onClick={async () => {
                      if (!confirm('طلب حذف المنتج؟')) return;
                      await api.del(`/api/vendor/products/${p.id}`); reload();
                    }}>حذف</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <EditProduct p={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      {creating && <CreateProduct onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function ImgBtn({ id, onDone }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn sm" style={{ opacity: busy ? 0.5 : 1 }}>
      {busy ? '…' : 'صورة'}
      <input type="file" accept="image/*" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append('image', file);
          await api.upload(`/api/vendor/products/${id}/image`, fd);
          onDone();
        } finally { setBusy(false); }
      }} />
    </label>
  );
}

function EditProduct({ p, onClose, onDone }) {
  const [f, setF] = useState({ name_ar: p.name_ar, name_en: p.name_en, price: p.price, category: p.category || 'other', description_ar: p.description_ar || '' });
  const [opts, setOpts] = useState(p.options || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, price: Number(f.price) };
      if (opts.length || (p.options || []).length) body.options = opts.map((o) => ({ ...o, price: Number(o.price) }));
      await api.put(`/api/vendor/products/${p.id}`, body);
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <Modal title={`تعديل: ${p.name_ar}`} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={submit}>إرسال للمراجعة</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      </div>
      <div className="grid k2">
        <Field label="السعر"><input type="number" value={f.price} onChange={set('price')} /></Field>
        <Field label="القسم"><select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="الوصف"><textarea rows={2} value={f.description_ar} onChange={set('description_ar')} /></Field>
      <OptionsEditor opts={opts} setOpts={setOpts} />
    </Modal>
  );
}

function CreateProduct({ onClose, onDone }) {
  const [f, setF] = useState({ name_ar: '', name_en: '', price: '', category: 'other', stock: '', description_ar: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post('/api/vendor/products', {
        ...f, price: Number(f.price), stock: f.stock === '' ? null : Number(f.stock),
      });
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title="منتج جديد" onClose={onClose}
      footer={<button className="btn primary" disabled={busy || !f.name_ar || !f.price} onClick={submit}>إرسال للمراجعة</button>}>
      <ErrBox error={error} />
      <div className="grid k2">
        <Field label="الاسم (عربي)"><input value={f.name_ar} onChange={set('name_ar')} /></Field>
        <Field label="الاسم (إنجليزي)"><input value={f.name_en} onChange={set('name_en')} /></Field>
      </div>
      <div className="grid k3">
        <Field label="السعر"><input type="number" value={f.price} onChange={set('price')} /></Field>
        <Field label="الكمية (فاضي = غير محدود)"><input type="number" value={f.stock} onChange={set('stock')} /></Field>
        <Field label="القسم"><select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="الوصف"><textarea rows={2} value={f.description_ar} onChange={set('description_ar')} /></Field>
    </Modal>
  );
}

function OptionsEditor({ opts, setOpts }) {
  const upd = (i, k, v) => setOpts(opts.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontWeight: 700, color: 'var(--muted)' }}>الأحجام / الأنواع (سعر نهائي لكل واحد)</label>
        <button className="btn sm" onClick={() => setOpts([...opts, { id: `o${opts.length + 1}`, name_ar: '', name_en: '', price: 0, is_available: true }])}>+ صف</button>
      </div>
      {opts.map((o, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <input placeholder="المعرّف" value={o.id} onChange={(e) => upd(i, 'id', e.target.value)} style={{ width: 90 }} />
          <input placeholder="الاسم" value={o.name_ar} onChange={(e) => upd(i, 'name_ar', e.target.value)} />
          <input type="number" placeholder="السعر" value={o.price} onChange={(e) => upd(i, 'price', e.target.value)} style={{ width: 90 }} />
          <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={o.is_available !== false} onChange={(e) => upd(i, 'is_available', e.target.checked)} /> متاح</label>
          <button className="btn sm danger" onClick={() => setOpts(opts.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
    </div>
  );
}
