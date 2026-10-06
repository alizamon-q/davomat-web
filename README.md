# Davomat tizimi — admin tasdiqlashli versiya

Asosiy o‘zgarishlar:
- Xodim yuborgan yozuv darhol **Kutilmoqda** holatiga tushadi.
- `Tasdiqlangan vaqt` faqat admin **Tasdiqlash** yoki **Rad etish** tugmasini bosganda yoziladi.
- Admin tasdiqlash/rad etishda ixtiyoriy izoh yozishi mumkin.
- Xodim o‘z statistikasida holat va admin izohini ko‘radi.
- 09:00 bo‘yicha `Vaqtida/Kech` mantiqi olib tashlandi; bir kunda bir necha marta ma’lumot yuborish mumkin.
- Google Sheet yozuvi avval `Kutilmoqda` sifatida qo‘shiladi, keyin admin qarorida shu qator yangilanadi.

## Ishga tushirish
1. `pip install -r requirements.txt`
2. `python app.py`
3. Brauzer: `http://127.0.0.1:5000`

Test admin: `admin / admin123`
Test xodim: `BTB152 / 123456`

## Google Sheets
`google_apps_script.gs` dagi kodni Apps Script'ga to‘liq almashtirib qo‘ying, Ctrl+S bosing va deployment'ni yangi versiyaga yangilang. Web app `/exec` URL o‘zgarmasa `.env` ni almashtirish shart emas.
