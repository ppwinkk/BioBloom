# BioBloom — Smart Compost Lab

โค้ดหน้าเว็บเวอร์ชันล่าสุดสำหรับ GitHub Pages

## ไฟล์ในชุดนี้

- index.html — โครงหน้าเว็บและองค์ประกอบ Dashboard
- style.css — CSS ทั้งหมด รวมธีมดีไซน์ล่าสุด
- app.js — JavaScript จำลองค่า pH, บันทึกข้อมูล, กราฟ, CSV และอ่านข้อมูล Supabase

## วิธีนำขึ้น GitHub Pages

1. สร้าง Repository ใหม่ หรือเปิด Repository ที่ต้องการ
2. อัปโหลดไฟล์ index.html, style.css และ app.js ลงที่ root ของ Repository **พร้อมกันทั้งสามไฟล์**
3. ไปที่ **Settings → Pages → Build and deployment**
4. เลือก **Deploy from a branch**, เลือก main และโฟลเดอร์ /(root) แล้วกด Save
5. รอ GitHub Pages แสดงลิงก์เว็บไซต์ จากนั้นเปิดลิงก์เพื่อทดสอบ

หากเปลี่ยนชื่อไฟล์หรือย้ายตำแหน่ง ต้องแก้พาธของ style.css และ app.js ใน index.html ให้ตรงกัน

## ข้อมูลจากบอร์ด IoT และฐานข้อมูล

- โหมด **ทดลอง** มีข้อมูลจำลองสามถัง: น้ำธรรมดา หมักหนึ่งวัน และหมักสุก
- โหมด **บอร์ดจริง** อ่านข้อมูลจาก Supabase โดยไม่ส่งคำสั่ง INSERT, UPDATE หรือ DELETE
- โปรแกรมหน้าเว็บ **ไม่สร้าง ไม่แก้ไข และไม่ลบ** ตารางฐานข้อมูล
- ต้องมีตาราง bins และ sensor_readings ตามโครงสร้างในหน้าเชื่อมต่อ IoT ซึ่งมีคอลัมน์ ph จึงจะอ่านค่า pH ได้
- ต้องตั้งค่า **Project URL**, **publishable / anon key** และรหัส device_code ของสามถังในหน้าเว็บเอง
- **ห้ามใส่ service_role หรือ secret key** ใน JavaScript, HTML, GitHub Repository หรือช่องตั้งค่าหน้าเว็บ
- ตรวจสอบ Row Level Security (RLS) ก่อนเปิดใช้งานบน GitHub Pages ซึ่งเป็นหน้าเว็บสาธารณะ
- หากยังไม่มีข้อมูลบอร์ดจริง ระบบจะแสดง -- และจะไม่ใช้ค่าจำลองแทน

## หมายเหตุ

ค่า pH ของสามถังในโหมดทดลองเป็นเพียงตัวอย่างเพื่อการศึกษา ไม่ใช่ค่าจากอุปกรณ์จริง และไม่สามารถใช้ค่า pH อย่างเดียวเพื่อยืนยันว่าหมักสุกแล้ว

แหล่งอ้างอิง: https://www.compost.css.cornell.edu/monitor/monitorph.html
