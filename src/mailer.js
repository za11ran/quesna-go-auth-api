// إرسال إيميل عبر Resend (best-effort). لو RESEND_API_KEY مش متظبط، بيتسجّل ويكمّل.
async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Quesna Go <onboarding@resend.dev>';
  if (!key) {
    console.log(`[email skipped — لا يوجد RESEND_API_KEY] "${subject}" -> ${to}`);
    return { skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html: html || undefined, text: text || undefined }),
    });
    if (!res.ok) {
      console.error('[email failed]', res.status, await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email error]', e.message);
    return { ok: false };
  }
}

module.exports = { sendEmail };
