# ไปไหนก็ได้ (painaikordai)

หาเส้นทางเดินทางในไทยด้วยขนส่งสาธารณะ จากตำแหน่ง GPS ไปปลายทางที่พิมพ์

```bash
node build.mjs     # รวมข้อมูลเป็น data/graph.json (ดึง SRT/OSM ให้เองถ้ายังไม่มี)
node check.mjs     # เช็กว่าหาเส้นทางได้
node server.mjs    # http://localhost:3000  (dev: ?from=lat,lon แทน GPS)
```

`.env`: `MAPILLARY_TOKEN=MLY|...` สำหรับรูปจุดขึ้นรถ (ไม่มีก็ใช้ได้ แค่ไม่มีรูป)

## Vercel
- `public/` = หน้าเว็บ, `api/*.mjs` = functions (ใช้ `app.mjs` ร่วมกับ `server.mjs`), region `sin1`
- `data/graph.json` อยู่ใน git เพราะ Vercel ไม่มีไฟล์ GTFS zip ให้ build — แก้ข้อมูลแล้วรัน `node build.mjs` และ commit ใหม่
- ตั้ง env `MAPILLARY_TOKEN` ใน Vercel project

## ข้อมูล
- นำทาง สนข. GTFS (CC BY 4.0): รถไฟฟ้า รถเมล์ เรือ ในกรุงเทพฯ และปริมณฑล
- ตารางเดินรถ รฟท. (data.go.th / MOT, ปี 2023): เวลาจริงของรถไฟทางไกล
- OpenStreetMap (ODbL): พิกัดสถานีรถไฟ, ค้นหาสถานที่ (Nominatim), แผนที่
- Zenodo 10.5281/zenodo.22045852 (CC BY 4.0): รถทัวร์/เรือข้ามจังหวัด
- Mapillary (CC BY-SA): ภาพถนนที่จุดขึ้นรถ

## เวลา
- "ตามตาราง": รถไฟ รฟท. (เลือกขบวนถัดไปตามเวลาตอนนี้) และรถไฟฟ้า
- "~ประมาณ": รถเมล์ เรือ รถทัวร์ คิดจากระยะทาง/ความถี่; สองแถว/Grab คิดจากระยะทางที่ 30 กม./ชม.
