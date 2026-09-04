#!/usr/bin/env bash
# =============================================================================
#  تجهيز صفحة الهبوط (quesnago.com) على نفس الـ VPS.
#  الاستخدام (على السيرفر، جوّه فولدر المشروع):
#     sudo bash deploy/setup-landing.sh
#  آمن للتشغيل أكثر من مرة. لازم setup-server.sh يكون اتشغّل قبله.
# =============================================================================
set -euo pipefail

ROOT_DOMAIN="${ROOT_DOMAIN:-quesnago.com}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANDING_DIR="$APP_DIR/landing"

if [[ $EUID -ne 0 ]]; then echo "شغّله بـ sudo:  sudo bash deploy/setup-landing.sh"; exit 1; fi
if [[ ! -f "$LANDING_DIR/index.html" ]]; then echo "مش لاقي $LANDING_DIR/index.html — اعمل git pull الأول"; exit 1; fi

echo "==> Nginx server block لـ $ROOT_DOMAIN + www.$ROOT_DOMAIN"
cat > /etc/nginx/sites-available/quesnago-landing <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $ROOT_DOMAIN www.$ROOT_DOMAIN;

    root $LANDING_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?)\$ {
        expires 7d;
        access_log off;
    }
}
EOF

ln -sf /etc/nginx/sites-available/quesnago-landing /etc/nginx/sites-enabled/quesnago-landing
nginx -t && systemctl reload nginx

cat <<EOF

======================================================================
 ✅ صفحة الهبوط شغّالة (HTTP):
      http://$ROOT_DOMAIN

 قبل كده اتأكد إن DNS للدومين بيشاور على السيرفر:
      A   @     -> IP السيرفر
      A   www   -> IP السيرفر   (أو CNAME www -> $ROOT_DOMAIN)

 الخطوة الأخيرة — فعّل HTTPS:
      sudo certbot --nginx -d $ROOT_DOMAIN -d www.$ROOT_DOMAIN \\
        --agree-tos -m m.s.za11ran@gmail.com --redirect

 التحديث بعد أي تعديل على الصفحة:  git pull  (Nginx بيقدّمها مباشرة)
======================================================================
EOF
