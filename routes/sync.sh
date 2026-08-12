#!/bin/bash
echo "جاري تجهيز التحديثات..."
git add .

# أخذ التاريخ والوقت الحالي كرسالة للـ commit تلقائياً
git commit -m "Auto-sync update: $(date +'%Y-%m-%d %H:%M:%S')"

echo "جاري الرفع إلى GitHub..."
git push origin main

echo "تم الرفع بنجاح!"
