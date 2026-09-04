#!/usr/bin/env bash
# =============================================================================
#  تجهيز سيرفر Ubuntu 24 لتشغيل Quesna Go API
#  الاستخدام (على السيرفر، جوّه فولدر المشروع):
#     sudo DOMAIN=api.quesnago.com bash deploy/setup-server.sh
#  آمن للتشغيل أكثر من مرة.
# =============================================================================
set -euo pipefail

# ---------------- إعدادات (عدّلها بمتغيرات بيئة عند التشغيل) ----------------
DOMAIN="${DOMAIN:-api.quesnago.com}"
APP_PORT="${APP_PORT:-4000}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-quesnago}"
DB_USER="${DB_USER:-quesnago}"
NODE_MAJOR="${NODE_MAJOR:-20}"
ENV_FILE="$APP_DIR/.env"
DB_PASS_FILE="$APP_DIR/deploy/.db_password"
# --------------------------------------------------------------------------

if [[ $EUID -ne 0 ]]; then echo "شغّله بـ sudo:  sudo bash deploy/setup-server.sh"; exit 1; fi
export DEBIAN_FRONTEND=noninteractive

echo "==> [1/9] تحديث النظام"
apt-get update -y && apt-get upgrade -y

echo "==> [2/9] أدوات أساسية"
apt-get install -y curl git ufw ca-certificates gnupg openssl

echo "==> [3/9] Node.js $NODE_MAJOR"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v) / npm $(npm -v)"

echo "==> [4/9] PostgreSQL + Nginx + Certbot + PM2"
apt-get install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx
npm install -g pm2 >/dev/null

echo "==> [5/9] الجدار الناري"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable
ufw status

echo "==> [6/9] قاعدة البيانات"
if [[ -f "$DB_PASS_FILE" ]]; then
  DB_PASS="$(cat "$DB_PASS_FILE")"
else
  DB_PASS="$(openssl rand -hex 24)"
  mkdir -p "$(dirname "$DB_PASS_FILE")"
  echo "$DB_PASS" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "==> [7/9] تثبيت التطبيق + الجداول + بناء الداش بورد"
cd "$APP_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
if [[ -d "$APP_DIR/dashboard" ]]; then
  ( cd "$APP_DIR/dashboard"
    npm ci 2>/dev/null || npm install
    VITE_API_URL="" npm run build )    # نفس الأصل: /api و /socket.io و /uploads
fi
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
PORT=$APP_PORT
NODE_ENV=production
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=30d
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
UPLOADS_DIR=$APP_DIR/uploads
DELIVERY_OFFER_TIMEOUT_SEC=60
RESEND_API_KEY=
MAIL_FROM=Quesna Go <onboarding@resend.dev>
ADMIN_EMAIL=
EOF
  chmod 600 "$ENV_FILE"
  echo "أنشئ $ENV_FILE"
fi
npm run db:setup

echo "==> [8/9] PM2 (تشغيل دائم + إقلاع تلقائي)"
pm2 start src/server.js --name quesna-api --update-env 2>/dev/null || pm2 restart quesna-api --update-env
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -n 1 | bash || true

echo "==> [9/9] Nginx reverse proxy لـ $DOMAIN"
cat > /etc/nginx/sites-available/quesna-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 12M;

    # الداش بورد (ملفات ثابتة) على الجذر
    root $APP_DIR/dashboard/dist;
    index index.html;
    location / {
        try_files \$uri /index.html;
    }

    # الـ API
    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Socket.IO (WebSocket)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }

    # الصور المرفوعة
    location /uploads/ {
        alias $APP_DIR/uploads/;
        access_log off;
        expires 30d;
        try_files \$uri =404;
    }
}
EOF
mkdir -p "$APP_DIR/uploads" && chown -R www-data:www-data "$APP_DIR/uploads" 2>/dev/null || true
ln -sf /etc/nginx/sites-available/quesna-api /etc/nginx/sites-enabled/quesna-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

IP="$(curl -s https://api.ipify.org || echo 'SERVER_IP')"
cat <<EOF

======================================================================
 ✅ تم! الـ API شغّال:
      http://$IP           (اختبار سريع الآن)
      http://$DOMAIN        (بعد ضبط الـ DNS)

 الخطوة الأخيرة — بعد ما DNS الدومين يشاور على السيرفر:
      sudo certbot --nginx -d $DOMAIN --agree-tos -m EMAIL --redirect

 كلمة سر قاعدة البيانات محفوظة في:
      $DB_PASS_FILE
 إعدادات التطبيق:
      $ENV_FILE
 أوامر مفيدة:
      pm2 logs quesna-api      # اللوجز
      pm2 restart quesna-api   # إعادة تشغيل
======================================================================
EOF
