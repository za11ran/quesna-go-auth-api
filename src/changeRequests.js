// محرّك طلبات التغيير (Change Requests) — BACKEND_HANDOFF.md §9
const db = require('./db');
const { notify } = require('./notify');
const { sendEmail } = require('./mailer');

// السعر والكمية ومواعيد الفتح/الغلق والعروض فورية دايمًا لكل التجّار (مش موجودين هنا
// أصلًا) — بغض النظر عن القيم تحت أو عن vendors.full_permissions. شوف src/vendor.js.
const DEFAULT_RULES = {
  vendor_fields: ['name_ar', 'name_en', 'delivery_fee', 'min_order', 'logo', 'cover_image', 'description_ar', 'description_en'],
  product_create: true,
  product_update_fields: ['name_ar', 'name_en', 'category', 'description_ar', 'description_en'],
  product_delete: true,
  product_options: true,
  offers: true,
  instant: ['stock', 'is_available', 'is_open'],
};

async function rules() {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'approval_rules'`);
    return rows.length ? { ...DEFAULT_RULES, ...rows[0].value } : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

// هل التعديل ده يحتاج موافقة؟ (بناءً على الحقول اللي اتغيّرت)
async function vendorFieldsNeedApproval(changedKeys) {
  const r = await rules();
  return changedKeys.some((k) => r.vendor_fields.includes(k));
}
async function productFieldsNeedApproval(changedKeys) {
  const r = await rules();
  return changedKeys.some((k) => r.product_update_fields.includes(k));
}

// متجر "موثوق" (full_permissions) — كل تعديلاته فورية، مفيش Change Request خالص.
async function hasFullPermissions(vendorId) {
  const { rows } = await db.query(`SELECT full_permissions FROM vendors WHERE id = $1`, [vendorId]);
  return !!(rows[0] && rows[0].full_permissions);
}

async function nextCrId() {
  const { rows } = await db.query(`SELECT nextval('change_request_seq') AS n`);
  return `cr_${rows[0].n}`;
}

// ينشئ طلب تغيير + يعلّم المورد + يخطر الأدمن (لوحة + إيميل)
async function submitChangeRequest({ vendorId, submittedBy, entityType, entityId, action, currentValues = {}, newValues = {} }) {
  const id = await nextCrId();
  await db.query(
    `INSERT INTO change_requests (id, vendor_id, submitted_by, entity_type, entity_id, action, current_values, new_values, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
    [id, vendorId, submittedBy, entityType, entityId, action, JSON.stringify(currentValues), JSON.stringify(newValues)]
  );
  if (entityType === 'product' && entityId) {
    await db.query(`UPDATE products SET has_pending_change = true WHERE id = $1`, [entityId]);
  } else if (entityType === 'vendor') {
    await db.query(`UPDATE vendors SET has_pending_change = true WHERE id = $1`, [vendorId]);
  }

  // خطر الأدمن
  const admins = await db.query(`SELECT id FROM staff_users WHERE role = 'admin' AND is_active = true`);
  const vend = await db.query(`SELECT name_ar FROM vendors WHERE id = $1`, [vendorId]);
  const vName = vend.rows[0] ? vend.rows[0].name_ar : vendorId;
  for (const a of admins.rows) {
    await notify(a.id, {
      title: 'طلب تغيير جديد',
      body: `${vName} — ${entityType}/${action}`,
      type: 'change_request_submitted',
      data: { change_request_id: id, vendor_id: vendorId },
      recipientType: 'staff',
    });
  }
  if (process.env.ADMIN_EMAIL) {
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `طلب تغيير من ${vName} (${entityType}/${action})`,
      text: `طلب تغيير رقم ${id} من التاجر ${vName}.\nالنوع: ${entityType} — ${action}\nراجعه من لوحة الأدمن.`,
    }).catch(() => {});
  }

  return { status: 'pending_approval', change_request_id: id, message: 'تم إرسال التعديل لمراجعة الإدارة' };
}

// تطبيق طلب تغيير موافَق عليه على المورد الفعلي
async function applyChangeRequest(cr) {
  const nv = cr.new_values || {};
  if (cr.entity_type === 'vendor') {
    const cols = Object.keys(nv);
    if (cols.length) {
      const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await db.query(`UPDATE vendors SET ${set}, updated_at = now() WHERE id = $${cols.length + 1}`, [...cols.map((c) => nv[c]), cr.vendor_id]);
    }
    await db.query(`UPDATE vendors SET has_pending_change = false WHERE id = $1`, [cr.vendor_id]);
  } else if (cr.entity_type === 'product') {
    if (cr.action === 'create') {
      const cols = Object.keys(nv).filter((c) => c !== 'options');
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      await db.query(
        `INSERT INTO products (${cols.join(', ')}) VALUES (${ph})
         ON CONFLICT (id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
        cols.map((c) => nv[c])
      );
      if (Array.isArray(nv.options) && nv.options.length) {
        for (let i = 0; i < nv.options.length; i++) {
          const o = nv.options[i];
          await db.query(
            `INSERT INTO product_options (product_id, id, name_ar, name_en, price, stock, is_available, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [cr.entity_id, o.id, o.name_ar, o.name_en, o.price, o.stock ?? null, o.is_available !== false, i + 1]
          );
        }
      }
    } else if (cr.action === 'delete') {
      await db.query(`UPDATE products SET deleted_at = now(), has_pending_change = false WHERE id = $1`, [cr.entity_id]);
    } else {
      const cols = Object.keys(nv).filter((c) => c !== 'options');
      if (cols.length) {
        const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        await db.query(`UPDATE products SET ${set}, updated_at = now() WHERE id = $${cols.length + 1}`, [...cols.map((c) => nv[c]), cr.entity_id]);
      }
      if (Array.isArray(nv.options)) {
        await db.query(`DELETE FROM product_options WHERE product_id = $1`, [cr.entity_id]);
        for (let i = 0; i < nv.options.length; i++) {
          const o = nv.options[i];
          await db.query(
            `INSERT INTO product_options (product_id, id, name_ar, name_en, price, stock, is_available, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [cr.entity_id, o.id, o.name_ar, o.name_en, o.price, o.stock ?? null, o.is_available !== false, i + 1]
          );
        }
        await db.query(`UPDATE products SET has_options = $2 WHERE id = $1`, [cr.entity_id, nv.options.length > 0]);
      }
    }
    if (cr.entity_id) await db.query(`UPDATE products SET has_pending_change = false WHERE id = $1`, [cr.entity_id]);
  } else if (cr.entity_type === 'offer') {
    if (cr.action === 'delete') {
      await db.query(`DELETE FROM offers WHERE id = $1 AND vendor_id = $2`, [cr.entity_id, cr.vendor_id]);
    } else if (cr.action === 'create') {
      const cols = Object.keys(nv);
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      await db.query(
        `INSERT INTO offers (${cols.join(', ')}) VALUES (${ph})
         ON CONFLICT (id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
        cols.map((c) => nv[c])
      );
    } else {
      const cols = Object.keys(nv);
      if (cols.length) {
        const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        await db.query(`UPDATE offers SET ${set} WHERE id = $${cols.length + 1} AND vendor_id = $${cols.length + 2}`,
          [...cols.map((c) => nv[c]), cr.entity_id, cr.vendor_id]);
      }
    }
  }
}

module.exports = {
  submitChangeRequest, applyChangeRequest, vendorFieldsNeedApproval, productFieldsNeedApproval,
  rules, hasFullPermissions,
};
