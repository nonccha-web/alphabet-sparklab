import {ArrowDown,Globe,Database,Users,ShieldCheck,Send,GitBranch,BarChart3} from 'lucide-react';

function Arrow({label}:{label?:string}){return <div className="route-arrow">{label&&<span>{label}</span>}<ArrowDown size={22} aria-hidden="true"/></div>}
function Box({title,children,kind=''}:{title:string;children:React.ReactNode;kind?:string}){return <div className={'route-box '+kind}><h3>{title}</h3><div>{children}</div></div>}
export default function TrackingFlow(){return <article className="panel tracking-route" aria-label="โฟลว์การเก็บข้อมูล">
 <div className="route-heading"><GitBranch size={23}/><div><h2>เส้นทางการเก็บข้อมูล</h2><p>เว็บไซต์ → Supabase → Meta → Dashboard</p></div></div>
 <div className="route-body">
 <div className="route-stage"><Globe size={20}/><h3>เข้าเว็บไซต์จริง 3 หน้า</h3></div>
 <div className="route-grid three">{[['Request Quotation','request-quotation'],['Project Start','project-start'],['Facade Care','facade-care']].map(([name,path])=><Box key={path} title={name}><a href={'https://www.alphabetfacade.com/'+path+'.html'} target="_blank" rel="noreferrer">/{path}.html</a><p>ชื่อ Event: {name}</p></Box>)}</div>
 <Arrow label="GTM เรียกสคริปต์ของหน้าที่ตรงกัน"/>
 <Box title="Tracking Server" kind="central"><p>รับ Visit พร้อม First-party Visitor ID จากเบราว์เซอร์</p><p>ตรวจว่าเป็นหนึ่งใน 3 หน้าที่กำหนด ก่อนบันทึกข้อมูล</p></Box>
 <Arrow/>
 <div className="route-stage"><Database size={20}/><h3>Supabase เก็บทุก Visit ที่ส่งถึงระบบ</h3></div>
 <Box title="ตรวจ Visitor ID + Link" kind="decision"><p>คัดซ้ำแบบถาวร • ไม่ใช้ IP ระบุตัวคน • ไม่แยก iOS / Android</p></Box>
 <div className="route-grid two branches"><div><Arrow label="ยังไม่เคยเข้าลิงก์นี้"/><Box title="Unique +1" kind="accent"><p>เพิ่ม Visits และ Unique ของลิงก์นั้น</p></Box></div><div><Arrow label="เคยเข้าลิงก์นี้แล้ว"/><Box title="Repeat visit +1"><p>เพิ่ม Visits แต่ไม่เพิ่ม Unique</p></Box></div></div>
 <Arrow label="ทั้งสองกรณีตรวจสิทธิ์ก่อนส่ง Meta"/>
 <div className="route-stage"><ShieldCheck size={20}/><h3>ตรวจสิทธิ์ Marketing จาก CookieWow</h3></div>
 <div className="route-grid two branches"><div><Arrow label="ยังไม่เลือก / ไม่ยินยอม / เบราว์เซอร์ส่ง GPC"/><Box title="เก็บ Visit เท่านั้น" kind="muted"><p>ไม่ส่ง Pixel และ CAPI</p><p>เปลี่ยนสิทธิ์ได้ที่ปุ่ม “ตั้งค่าคุกกี้” บนเว็บไซต์</p></Box></div><div><Arrow label="ยินยอม Marketing และไม่มี GPC"/><Box title="ตรวจ Event ของ Visitor + Link" kind="accent"><p>มี Event แล้ว → ไม่สร้าง Event ใหม่</p><p>ยังไม่มี → สร้าง Event พร้อม event_id เดียวกัน</p></Box></div></div>
 <Arrow label="เฉพาะ Event ที่มีสิทธิ์ส่ง"/>
 <div className="route-stage"><Send size={20}/><h3>ส่ง Event ผ่าน 2 ช่องทาง</h3></div>
 <div className="route-grid two"><Box title="Meta CAPI · Server"><p>Tracking Server ส่งให้ Meta</p><p>บันทึกผลตอบรับ / ส่งซ้ำเมื่อข้อผิดพลาดชั่วคราว</p></Box><Box title="Meta Pixel · Browser"><p>เบราว์เซอร์ส่งชื่อ Event และ event_id ที่ Server คืนมา</p><p>อาจถูกบล็อกโดยเบราว์เซอร์หรือส่วนขยาย</p></Box></div>
 <Arrow label="event_name + event_id ตรงกัน"/>
 <Box title="Meta Deduplication" kind="central"><p>ใช้คีย์เดียวกันเพื่อตัด Event ซ้ำระหว่าง Pixel และ CAPI</p><p>Meta accepted หมายถึง CAPI ตอบรับ ไม่ใช่ผลยืนยันการคัดซ้ำจาก Meta</p></Box>
 <div className="route-report"><BarChart3 size={23}/><div><h3>Dashboard อ่านสถิติจาก Supabase</h3><p>Visits · Unique / Link · Repeat visits · Meta accepted · Failed</p><p>แยกตามวันและ Event • แยกข้อมูลจริงกับข้อมูลทดสอบ</p></div></div>
 <div className="route-note"><Users size={18}/><p>Unique คือ Visitor ID ในเบราว์เซอร์เดียวกัน หากล้างคุกกี้ เปลี่ยนเบราว์เซอร์ หรือเปลี่ยนอุปกรณ์ อาจนับเป็นผู้เยี่ยมชมใหม่</p></div>
 </div></article>}
