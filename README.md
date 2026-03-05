# EzyAIAgent

โปรเจกต์นี้เป็นแอป AI แบบ full-stack ในโฟลเดอร์เดียว:
- `frontend` (React + Vite + TypeScript)
- `backend` (Node.js + Express)

รองรับ base path:
- `/EzyAIAgent/...`

ตัวอย่าง:
- Local: `http://localhost:4301/EzyAIAgent/dashboard`

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

## Deploy (AWS EC2 + Nginx + PM2)

คู่มือนี้เป็นการ deploy แบบ:
- Frontend เป็น static files ผ่าน Nginx
- Backend รันด้วย PM2
- Nginx reverse proxy `/api` ไป backend

### 1) เตรียม EC2
ติดตั้งแพ็กเกจพื้นฐาน:
```bash
sudo dnf update -y
sudo dnf install -y nginx git tar gzip
```

ติดตั้ง Node.js 20:
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

ติดตั้ง PM2:
```bash
sudo npm install -g pm2
pm2 -v
```

### 2) อัปโหลดโค้ดขึ้นเครื่อง
วางโค้ดไว้ที่:
- `/opt/ezyaiagent`

ตัวอย่าง:
```bash
sudo mkdir -p /opt/ezyaiagent
sudo chown -R $USER:$USER /opt/ezyaiagent
```

### 3) ตั้งค่า environment
Backend:
- สร้างไฟล์ `/opt/ezyaiagent/backend/.env`
- อ้างอิงค่าเริ่มต้นจาก `backend/.env.example`

ค่าที่ต้องเช็กให้ถูกต้องอย่างน้อย:
- `PORT` (เช่น `4300`)
- `PUBLIC_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_STORAGE_FOLDER`

### 4) ติดตั้ง dependencies และ build frontend
```bash
cd /opt/ezyaiagent/backend
npm install

cd /opt/ezyaiagent/frontend
npm install
npm run build
```

### 5) รัน backend ด้วย PM2
```bash
pm2 start server.js --name ezyaiagent-backend --cwd /opt/ezyaiagent/backend
pm2 save
pm2 startup
```

รันคำสั่งที่ `pm2 startup` แสดงกลับมา 1 ครั้ง เพื่อเปิด auto-start หลัง reboot

### 6) ตั้งค่า Nginx
สร้างไฟล์:
- `/etc/nginx/conf.d/ezyaiagent.conf`

ตัวอย่าง config:
```nginx
server {
    listen 80;
    server_name _;

    root /opt/ezyaiagent/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4300/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /EzyAIAgent/ {
        try_files $uri $uri/ /index.html;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

ทดสอบและ reload:
```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### 7) เปิด Security Group
ที่ EC2 Security Group ต้องเปิด:
- `80/tcp` (HTTP)
- `22/tcp` (SSH)

### 8) ขั้นตอนอัปเดต deploy รอบถัดไป
1. อัปโหลดโค้ดเวอร์ชันใหม่ไป `/opt/ezyaiagent`
2. ติดตั้ง dependency และ build
```bash
cd /opt/ezyaiagent/backend && npm install
cd /opt/ezyaiagent/frontend && npm install && npm run build
```
3. รีสตาร์ต backend
```bash
pm2 restart ezyaiagent-backend
pm2 save
```
4. reload Nginx (เมื่อมีการแก้ config)
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
