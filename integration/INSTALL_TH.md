# Alphabet Sparklab

1. อัปโหลด `integration/alphabet-tracking.js` ไปที่ `/assets/alphabet-tracking.js`
2. เพิ่มในเว็บไซต์:

```html
<script defer src="/assets/alphabet-tracking.js"></script>
```

| URL | Event |
|---|---|
| https://www.alphabetfacade.com/request-quotation.html | Request Quotation |
| https://www.alphabetfacade.com/project-start.html | Project Start |
| https://www.alphabetfacade.com/facade-care.html | Facade Care |

- โหมดเริ่มต้น: ส่งอัตโนมัติ ไม่มีแบนเนอร์
- Pixel ID: `1038711025904592`
- คัดซ้ำ: ถาวรต่อ Visitor ID + Link
- เคารพ GPC, ตัวเลือกปฏิเสธเดิม และสถานะ CMP ที่ส่งมา
- ไม่มีการบันทึก consent granted จากโหมดอัตโนมัติ
- นำตัวส่ง Custom Event ชื่อเดียวกันที่ซ้ำอยู่ออก และใช้ Pixel init เพียงจุดเดียว
- เว็บไซต์ต้องมีสิทธิ์ใช้และส่งข้อมูลตามข้อกำหนดที่เกี่ยวข้อง การตั้งโหมดนี้ไม่ได้ยืนยันสิทธิ์แทนเว็บไซต์

ถอนสิทธิ์/ปฏิเสธ:

```javascript
window.AlphabetTracking.optOut();
```

กรณีใช้ CMP:

```html
<script defer src="/assets/alphabet-tracking.js" data-consent="cmp"></script>
```

```javascript
window.alphabetMarketingConsent = granted === true;
window.dispatchEvent(new CustomEvent('alphabet:marketing-consent', {detail: granted === true}));
```

ทดสอบหลังติดตั้ง: Visits เพิ่ม, เปิดซ้ำ Unique ไม่เพิ่ม, ทั้งสองช่องทางใช้ event_id เดียวกัน, GPC/ปฏิเสธไม่ส่ง Meta

[Dashboard](https://nonccha-web.github.io/alphabet-sparklab/)
