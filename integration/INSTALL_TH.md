# ติดตั้ง Alphabet Sparklab บนเว็บไซต์เดิม

ส่งคู่มือนี้พร้อมไฟล์ `integration/alphabet-tracking.js` ให้ Dev เว็บไซต์ Alphabet Facade

## สิ่งที่ Dev ต้องทำ

1. อัปโหลด `alphabet-tracking.js` ไปที่ `/assets/alphabet-tracking.js` บน **www.alphabetfacade.com** (ปรับ path ได้ตามโครงสร้างเว็บ)
2. เพิ่ม script tag ด้านล่างก่อน `</head>` ของ 3 หน้า หรือใน template กลางก็ได้ ตัวสคริปต์ทำงานเฉพาะ 3 path ที่กำหนด
3. เชื่อมสิทธิ์ marketing consent ตามกรณี A หรือ B ด้านล่าง
4. ตรวจและนำ Custom Event ซ้ำชื่อเหล่านี้ออกจาก GTM/โค้ดเดิม ตรวจว่ามี Pixel ID นี้ init อยู่แล้วหรือไม่: ให้ Dev รวมการ init ไว้ที่จุดเดียวหลัง consent เพื่อไม่ยิงซ้ำ และคง Event อื่นที่เว็บไซต์ใช้งานไว้ตามเดิม
5. ทดสอบตามรายการท้ายเอกสารก่อนนำไปใช้งานโฆษณา

ไม่ต้องเปลี่ยนลิงก์โฆษณา ไม่ต้องสร้าง redirect ไม่ต้องตั้ง DNS สำหรับ Tracking และไม่ต้องส่ง Meta Token หรือ Supabase Service Key ให้ผู้พัฒนา frontend

| URL ที่ติดตามเท่านั้น | Custom Event (ใช้ตรงตัวรวมช่องว่าง) |
|---|---|
| https://www.alphabetfacade.com/request-quotation.html | Request Quotation |
| https://www.alphabetfacade.com/project-start.html | Project Start |
| https://www.alphabetfacade.com/facade-care.html | Facade Care |

Pixel ID: `1038711025904592`

### A. เว็บไซต์มีแบนเนอร์คุกกี้ / CMP อยู่แล้ว (ใช้แบบนี้ถ้ามี)

```html
<script defer src="/assets/alphabet-tracking.js" data-consent="cmp"></script>
```

หลัง CMP อ่านสิทธิ์เริ่มต้นได้ และทุกครั้งที่ผู้ใช้เปลี่ยนสิทธิ์ ให้เรียกฟังก์ชันนี้ด้วย boolean จาก **หมวด marketing จริง** ไม่ใช่การกดปิดแบนเนอร์หรือยอมรับเฉพาะคุกกี้จำเป็น:

```javascript
function updateAlphabetMarketingConsent(granted) {
  // เก็บสถานะไว้รองรับกรณี CMP ตอบก่อน script โหลด
  window.alphabetMarketingConsent = granted === true;
  window.dispatchEvent(new CustomEvent('alphabet:marketing-consent', {
    detail: granted === true
  }));
}
// ผูก callback กับ API ของ CMP ที่เว็บไซต์ใช้อยู่:
// initial consent resolved / accept marketing => updateAlphabetMarketingConsent(true)
// deny / withdraw marketing => updateAlphabetMarketingConsent(false)
```

หากไม่มีข้อมูลยินยอม ระบบจะยังเก็บ Visit แต่ไม่ส่ง Meta ใด ๆ ห้ามตั้ง true ให้ทุกคนอัตโนมัติ ต้องแจ้งสถานะเริ่มต้นด้วยเสมอ ไม่ใช่เฉพาะตอนกดปุ่ม

### B. เว็บไซต์ยังไม่มีระบบขอสิทธิ์ marketing

```html
<script defer src="/assets/alphabet-tracking.js"></script>
```

สคริปต์แสดงแบนเนอร์ไทย มีปุ่มยินยอมและไม่ยินยอม บันทึกตัวเลือก 180 วัน ให้ Dev เพิ่มปุ่มเปิดการตั้งค่าอีกครั้งใน footer/หน้านโยบายของทั้ง 3 หน้า:

```html
<button type="button" onclick="window.AlphabetTracking && window.AlphabetTracking.openConsent()">
  ตั้งค่าความยินยอมการตลาด
</button>
```

ตรวจข้อความแบนเนอร์/นโยบายให้ตรงกับการใช้ข้อมูลของบริษัท แบนเนอร์นี้ควบคุมเฉพาะ integration นี้ ไม่ได้ปิด third-party tracking ตัวอื่นในเว็บไซต์ หากมี CMP อยู่แล้วให้เลือก A เพื่อใช้สถานะเดียวกันทั้งเว็บ Global Privacy Control (GPC) ทำให้ integration นี้ไม่ส่ง Meta

## การทำงานและขอบเขต

- สคริปต์ส่ง Visit ไป Supabase collector หลังหน้าเริ่มโหลด จากนั้นจึงส่ง Pixel/CAPI เมื่อยินยอม ไม่มี redirect และไม่หน่วงการเปิดหน้า
- วิธีนี้ไม่ใช่การบังคับให้ HTTP request ของหน้าเว็บผ่าน Tracking Server ก่อนเสิร์ฟ HTML หากต้องการเงื่อนไขนั้นแบบเคร่งครัด ต้องให้ Dev ทำ reverse proxy/server middleware ซึ่งไม่ใช่วิธีติดตั้งสคริปต์นี้
- First-party cookie `alphabet_visitor_v2` บน www.alphabetfacade.com อายุที่ขอ 400 วัน ใช้ UUID ไม่ใช้ IP; browser อาจจำกัดอายุ/ล้าง cookie ได้
- Database คัดซ้ำถาวรต่อ UUID + Link ไม่มี reset 30 วัน แต่ล้าง cookie/เปลี่ยนเบราว์เซอร์/อุปกรณ์จะเป็น ID ใหม่ จึงไม่ใช่การระบุตัวคนข้ามอุปกรณ์
- ไม่มีการกรอง iOS/Android ไม่เก็บ query string เช่น fbclid ใน source_url
- Pixel และ CAPI ใช้ event_name และ event_id ตรงกัน; ไม่มี PageView เพิ่มจากสคริปต์นี้
- Visit คือการบันทึกจากสคริปต์ที่ส่งสำเร็จ ไม่ใช่ทุก HTTP request; บล็อก JS/เครือข่าย/analytics จะทำให้ตกหล่น และบอตที่รัน JS อาจมีสถิติ
- Public collector ใช้ Origin/page allowlist และ ticket ลงลายเซ็นสำหรับ consent/ack; Origin ไม่ใช่การยืนยันคนจริง สถิติ public analytics ไม่ควรใช้เป็นหลักฐานธุรกรรมหรือการชำระเงิน
- Dashboard URL แยกจาก URL ลูกค้า ไม่มีการส่งลูกค้าไปยัง chatgpt.site

## CSP ถ้ามีการตั้ง Content-Security-Policy

ให้ Dev รวม origin ต่อไปนี้กับ policy เดิม ไม่แทนที่ทั้ง policy:

- script-src: `'self' https://connect.facebook.net`
- connect-src: `https://hvrclmycmpgmnpwyzznw.supabase.co https://www.facebook.com https://connect.facebook.net`
- img-src: `https://www.facebook.com`
- กรณี B ใช้ inline style ของ banner; ถ้าเว็บไซต์ไม่อนุญาต inline style ให้แยก style ไป stylesheet ของเว็บ หรือใช้ CMP กรณี A
- ปุ่มตัวอย่าง inline onclick สามารถเปลี่ยนเป็น addEventListener ในไฟล์ JS ถ้า CSP บล็อก inline handler

## ทดสอบหลังติดตั้ง (Dev + เจ้าของ Pixel)

1. ก่อนทดสอบ Meta ให้ผู้ดูแลตั้ง `META_TEST_EVENT_CODE` และเพิ่ม UUID ของ browser ทดสอบลง `tracking_test_visitors` ก่อนเปิดหน้า เพื่อไม่ปนรายงาน live (ดูด้านล่าง)
2. หน้าอื่น เช่นหน้าแรก: ไม่มี request ไป website-tracking
3. เปิดแต่ละหน้าใน 3 หน้าเดิม: POST action visit สำเร็จ, เก็บ source_url เป็น URL เดิม, ได้ ticket กลับมา
4. สถานะไม่ทราบ/ปฏิเสธ: Visit เพิ่ม แต่ไม่มี Meta Event และไม่มี fbevents.js ที่โหลดโดยสคริปต์นี้
5. ยินยอม: Event ชื่อตรงตามตาราง, CAPI accepted, Pixel event ID (`eid` ใน Network) เท่ากับ CAPI event_id; ตรวจ Events Manager ว่า deduplicate ถูกต้อง
6. เปิดหน้าเดิมซ้ำด้วย browser เดิม: Visits เพิ่ม Unique และ Meta Event ไม่เพิ่ม; อีก Link นับ Unique ของ Link นั้นอีก 1
7. ถอน consent: ไม่มี Event ใหม่หรือ retry ที่ได้รับสิทธิ์จาก visit นั้นหลังระบบบันทึกการถอน; ข้อมูลที่ Meta รับไปก่อนถอนไม่สามารถเรียกคืนด้วยปุ่มนี้ได้
8. ตรวจหน้าจอมือถือและไม่บล็อกการอ่าน/กรอกฟอร์มเว็บไซต์

เตรียม UUID ทดสอบก่อนโหลดหน้า (บน browser ของ www.alphabetfacade.com):

```javascript
// Dev รันใน Console บนหน้าอื่นที่ไม่ได้ติดตาม เพื่อกำหนด QA ID ล่วงหน้า
const qaId = crypto.randomUUID();
document.cookie = `alphabet_visitor_v2=${qaId}; Path=/; Max-Age=34560000; Secure; SameSite=Lax`;
console.log(qaId); // ให้ผู้ดูแลนำค่านี้ใส่ SQL ด้านล่างก่อนเปิด 3 หน้า
```

```sql
-- ผู้ดูแล Supabase แทนค่า UUID ที่ได้จาก browser; ห้ามส่ง service key ไป frontend
insert into public.tracking_test_visitors(visitor_id, reason)
values ('REPLACE_WITH_QA_UUID', 'Website integration QA')
on conflict (visitor_id) do nothing;
```

`META_TEST_EVENT_CODE` ใช้เฉพาะ visit ที่ติดป้าย is_test; การตั้ง secret อย่างเดียวไม่เปลี่ยน live visit เป็น test. Browser Pixel ยังเป็นการส่งจริงจาก browser — ตรวจผ่าน Meta Test Events ตามขั้นตอนของ Meta. ล้าง DB ไม่สามารถลบข้อมูลที่ส่ง Meta แล้วได้

## สิ่งที่เตรียมให้แล้ว / สิ่งที่ยังรอ

เตรียม SDK, public collector, dashboard ที่แสดง 3 URL เดิม, consent gating, permanent dedup, shared event ID, CAPI retry และคู่มือนี้แล้ว

ยังต้องให้ Dev ติดตั้งบน www.alphabetfacade.com และเชื่อม CMP/ทดสอบการทำงานบนเว็บไซต์จริง จึงยังไม่ควรถือว่าการเข้าหน้าเดิมถูกเก็บแล้วก่อนติดตั้ง

## ชื่อ Dashboard

ส่วน `siraphobice1995` เป็น namespace ของบัญชีเผยแพร่ Sites ไม่ใช่ชื่อฐานข้อมูล/เจ้าของ GitHub และการเปลี่ยน site slug แก้ได้เฉพาะส่วนแรก ไม่สามารถแทน namespace นี้ผ่านเครื่องมือ Sites ที่มีได้

หากต้องการตัดชื่อส่วนตัวออกทั้งหมด ให้เจ้าของเลือก custom domain เช่น `alphabet-sparklab.alphabetfacade.com` จากนั้นผูก custom domain กับระบบและให้ Dev ตั้ง DNS ตาม records ที่ระบบออกให้ ยังไม่มีการเปลี่ยน DNS หรืออ้างว่า hostname ตัวอย่างนี้พร้อมใช้งาน
