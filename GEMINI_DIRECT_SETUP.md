# Google Gemini Direct API Setup

## การตั้งค่าสำหรับใช้งาน Gemini Direct Image Generation

### 1. รับ API Key

1. ไปที่ [Google AI Studio](https://aistudio.google.com/app/apikey)
2. เข้าสู่ระบบด้วย Google Account
3. คลิก "Create API Key"
4. คัดลอก API Key ที่ได้

### 2. ใส่ API Key ในแอปพลิเคชัน

1. เปิด EzyAIAgent Frontend (http://localhost:4301/EzyAIAgent)
2. ไปที่หน้า `/image-gen`
3. เลือก Provider: **Gemini Direct**
4. ใส่ API Key ในช่อง "Gemini API Key"
5. API Key จะถูกเก็บไว้ใน Local Storage (ไม่ส่งไปยัง backend)

### 3. Models ที่รองรับ

Gemini Direct ใช้ Vertex AI Imagen API ซึ่งรองรับ models ต่อไปนี้:

- **imagen-3.0-generate-001** - รุ่นล่าสุดของ Imagen 3.0
- **imagen-3.0-fast-generate-001** - รุ่นเร็วของ Imagen 3.0
- **imagegeneration@006** - Imagen 2 รุ่น 006
- **imagegeneration@005** - Imagen 2 รุ่น 005
- **imagegeneration@002** - Imagen 2 รุ่นเก่า

### 4. Features

- ✅ เรียก Google Gemini Imagen API โดยตรงจาก frontend
- ✅ ไม่ต้องส่ง API Key ผ่าน backend (ปลอดภัยกว่า)
- ✅ รองรับ negative prompt
- ✅ รองรับ seed สำหรับการสร้างภาพแบบ reproducible
- ✅ สร้างภาพได้หลายภาพต่อครั้ง
- ✅ บันทึก history ในฐานข้อมูล

### 5. ข้อจำกัด

- API มีการจำกัดจำนวน requests (rate limit)
- บางรุ่นอาจต้องใช้ Google Cloud Project และ Vertex AI
- ภาพที่สร้างจะถูกส่งกลับเป็น base64 (อาจใหญ่)

### 6. ตัวอย่างการใช้งาน

1. เลือก Provider: `Gemini Direct`
2. ใส่ API Key
3. เลือก Model: `imagen-3.0-generate-001`
4. ใส่ Prompt: `A beautiful sunset over the ocean`
5. (Optional) ใส่ Negative Prompt: `blurry, low quality`
6. กด **Generate**

### 7. Troubleshooting

**ปัญหา: API Key ไม่ valid**
- ตรวจสอบว่า API Key ถูกต้อง และยังไม่หมดอายุ
- ลองสร้าง API Key ใหม่

**ปัญหา: HTTP 403 หรือ 401**
- API Key อาจไม่มีสิทธิ์เข้าถึง Imagen API
- ตรวจสอบว่า API ถูกเปิดใช้งานใน Google Cloud Console

**ปัญหา: HTTP 429 - Too Many Requests**
- คุณใช้งาน API เกินจำนวนที่กำหนด
- รอสักครู่แล้วลองใหม่
- พิจารณาเพิ่ม quota ใน Google Cloud Console

### 8. API Documentation

- [Google Generative AI API](https://ai.google.dev/api)
- [Vertex AI Imagen Documentation](https://cloud.google.com/vertex-ai/docs/generative-ai/image/generate-images)

### 9. Security Note

⚠️ **คำเตือนด้านความปลอดภัย:**
- API Key ถูกเก็บใน Local Storage ของเบราว์เซอร์
- อย่าแชร์ API Key กับผู้อื่น
- อย่าใช้ API Key ใน production environment โดยตรง
- พิจารณาใช้ backend proxy สำหรับ production

---

## สำหรับนักพัฒนา

### การทำงานของ Gemini Direct

1. Frontend เรียก API โดยตรงไปยัง `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateImages`
2. ส่ง API Key ผ่าน query parameter `?key={apiKey}`
3. รับภาพกลับมาเป็น base64
4. แปลงเป็น data URL และแสดงผล
5. บันทึก history ไปยัง backend (ไม่บันทึก API Key)

### Code Location

- Frontend: `EzyAIAgent/frontend/src/pages/ImageGenPage.tsx`
- การจัดการ Gemini Direct อยู่ในฟังก์ชัน `handleGenerate()` (บรรทัดที่ประมาณ 780-850)

### Environment Variables

ไม่ต้องตั้งค่า environment variables เพราะ API Key จะถูกจัดการจาก UI โดยตรง

