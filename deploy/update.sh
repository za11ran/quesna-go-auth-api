#!/usr/bin/env bash
# تحديث السيرفر بعد أي push جديد.  الاستخدام:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "==> git pull"
git pull --ff-only
echo "==> تثبيت الحزم"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
echo "==> تحديث قاعدة البيانات (migrations)"
npm run db:setup
echo "==> إعادة تشغيل"
pm2 restart quesna-api --update-env
pm2 save
echo "==> تم ✅"
pm2 status quesna-api
