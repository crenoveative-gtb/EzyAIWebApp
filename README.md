# EzyAIAgent

โปรเจกต์นี้เป็นแอป AI แบบ full-stack ในโฟลเดอร์เดียว:
- `frontend` (React + Vite + TypeScript)
- `backend` (Node.js + Express)

รองรับ base path:
- `/EzyAIAgent/...`

ตัวอย่าง:
- Local: `http://localhost:4301/EzyAIAgent/dashboard`
- Deploy ปัจจุบัน: `http://13.250.144.72/EzyAIAgent/dashboard`

## โครงสร้างปัจจุบัน
- `backend/` API server และ business logic
- `frontend/` web app
- `package.json` (root) สำหรับรัน frontend+backend พร้อมกัน

หมายเหตุ:
- `References` ถูกถอดออกแล้ว
- route/ไฟล์ `v2-v7` ถูกถอดออกแล้ว
- คง `V_main` ไว้
- ยกเลิกไฟล์ local key แล้ว (`backend/data/api-keys.local.json` ถูกลบ)

## ฟีเจอร์หลัก
- Dashboard
- Chat Core (`/ai-core`)
- Image Gen (`/image-gen`)
- Video/Audio Summarize (`/media-summarize`)
- Content Re-purpose (`/content-repurpose`)
- Edu Tutor (`/education-tutor`)
- Compare (`/compare`)
- Agents (`/agents`)
- Prompt Library (`/prompts`)
- API Keys (`/settings/api-keys`)
- History (`/history`)
- Auth (`/auth`)

## การ์ดบน Dashboard
สถิติการ์ดปัจจุบัน:
- `Conversations`: จากข้อมูล conversations จริง
- `Active Providers`: จาก key ที่ตั้งค่าและตรวจพบ
- `Saved Prompts`: รวม `built-in + custom`
- `AI Agents`: รวม `built-in + custom`

## Environment

### Backend (`backend/.env`)
อ้างอิงจาก `backend/.env.example`

ตัวแปรสำคัญ:
- `PORT` (ค่าแนะนำ 4300)
- `PUBLIC_BASE_URL` (ต้องตั้งให้ตรง URL ที่เปิดจากภายนอก)
- `SUPABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (แนะนำ `EzyAIAgent`)
- `SUPABASE_STORAGE_BUCKET` (แนะนำ `Dev_Test`)
- `SUPABASE_STORAGE_FOLDER` (แนะนำ `EzyAIAgent`)

### Frontend (`frontend/.env`)
อ้างอิงจาก `frontend/.env.example`

ตัวแปรสำคัญ:
- `VITE_API_URL` (ถ้าว่างจะใช้ same-origin `/api`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_AUTH_STORAGE_KEY` (optional)

## Run Local

### รันพร้อมกันจาก root
```bash
npm install
npm run install:all
npm run dev
```

### รันแยก
Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

พอร์ต local:
- Frontend: `http://localhost:4301`
- Backend: `http://localhost:4300`

## Build
```bash
cd frontend
npm run build
```

หรือจาก root:
```bash
npm run build:frontend
```

## Deploy (AWS EC2 + Nginx + PM2) [Current]

สภาพปัจจุบัน:
- Instance IP: `13.250.144.72`
- App URL: `http://13.250.144.72/EzyAIAgent/dashboard`
- Health: `http://13.250.144.72/api/health`
- HTTPS: ยังไม่เปิด (ตาม requirement ปัจจุบัน)
- Domain: ยังไม่ผูก

Stack ที่ใช้บนเครื่อง:
- Node.js 20
- PM2 (รัน backend)
- Nginx (serve frontend + reverse proxy `/api`)

ตำแหน่งโค้ดบนเครื่อง:
- `/opt/ezyaiagent`

Nginx config file:
- `/etc/nginx/conf.d/ezyaiagent.conf`

PM2 process name:
- `ezyaiagent-backend`

### คำสั่งตรวจสถานะบนเครื่อง
```bash
pm2 list
pm2 logs ezyaiagent-backend
sudo systemctl status nginx
curl http://127.0.0.1:4300/api/health
```

### ขั้นตอนอัปเดต deploy ครั้งถัดไป (ไม่เปลี่ยนโดเมน/HTTPS)
1. อัปโหลดโค้ดใหม่ไปที่ `/opt/ezyaiagent`
2. ติดตั้งและ build:
```bash
cd /opt/ezyaiagent/backend && npm install
cd /opt/ezyaiagent/frontend && npm install && npm run build
```
3. รีสตาร์ต backend:
```bash
pm2 restart ezyaiagent-backend
pm2 save
```
4. รีโหลด nginx (ถ้ามีแก้ config):
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Backend API (สรุป)
ตัวอย่าง endpoint หลัก:
- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings/api-keys`
- `POST /api/settings/api-keys/reveal`
- `GET /api/settings/ai-test/providers`
- `GET /api/settings/ai-test/:provider/models`
- `POST /api/settings/ai-test/chat`
- `POST /api/agent/run`
- `POST /api/content/repurpose`
- `POST /api/media/transcribe-summarize`
- `GET/POST/PUT/DELETE /api/prompt-library`
- `GET/POST/PUT/DELETE /api/agents`
- `GET/POST/PUT/DELETE /api/conversations`
- `POST /api/messages`
- `POST /api/upload-image`

## หมายเหตุ
- ระบบ key ใช้ฐานข้อมูล (Supabase) เป็นหลักแล้ว
- ห้ามใส่ service role key ใน frontend
