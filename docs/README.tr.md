# Pamukkale Üniversitesi Yoklama Platformu

**Diller:** [Türkçe](README.tr.md) · [English](README.en.md) · [Български](../README.md)

Üniversite derslerinde yoklamayı kayıt altına alan bir web platformu. Öğrenci, telefonunun
kamerasıyla bir QR kod okutarak derse katılır; ardından projeksiyonda gösterilen ve sunucu
saatine göre **her 10 saniyede bir değişen** kare işareti — **Check-In Tag** — tarayıcı
kamerasına göstererek sınıfta olduğunu kanıtlar.

---

## İçindekiler

- [Platform ne yapar](#platform-ne-yapar)
- [Neyi garanti etmez](#neyi-garanti-etmez)
- [Çalıştırma](#çalıştırma)
- [Demo hesaplar](#demo-hesaplar)
- [Roller](#roller)
- [Yoklama nasıl işler](#yoklama-nasıl-işler)
- [İş kuralları](#iş-kuralları)
- [Cihaz bağlama](#cihaz-bağlama)
- [Öğrenci içe aktarma](#öğrenci-içe-aktarma)
- [Raporlar](#raporlar)
- [Mimari](#mimari)
- [Ayarlar](#ayarlar)
- [Güvenlik ve gizlilik](#güvenlik-ve-gizlilik)
- [Testler](#testler)

---

## Platform ne yapar

| | |
|---|---|
| **Amaç** | Üniversite dersleri için güvenilir yoklama kaydı |
| **Roller** | Yönetici, öğretim elemanı, öğrenci |
| **Doğrulama** | 1. adım: telefonun kendi kamerasıyla QR → 2. adım: tarayıcı kamerasıyla Check-In Tag |
| **Değişim** | İşaret **10 saniyede bir** değişir; zamanlama sunucuda |
| **Geç kalma** | `verified_at ≤ başlangıç + 10:00` → **VAR**, aksi halde **GEÇ** |
| **Cihazlar** | Öğrencinin hesabı tek bir cihaza bağlıdır; değişiklik onay gerektirir |
| **Gizlilik** | Fotoğraf, video veya biyometrik veri saklanmaz. Tanıma tarayıcıda yapılır |
| **Raporlar** | Ders, hafta ve tek oturum bazında Excel (.xlsx) |
| **Diller** | Türkçe, İngilizce, Bulgarca |

## Neyi garanti etmez

Sistemi değerlendiren herkese bunu açıkça söyleyin.

QR kod tek başına katılımı kanıtlamaz. Check-In Tag kimliği bir sır değildir ve kriptografik bir
imza değildir. 10 saniyelik değişim eski bir fotoğrafı işe yaramaz hale getirir, ancak canlı bir
aktarımı (birinin arkadaşı için projeksiyona ikinci bir telefon tutması), sanal kamerayı veya
değiştirilmiş bir istemciyi **engellemez**.

Platformun verdiği şey şudur: kimin, ne zaman, hangi cihazdan giriş yaptığının ve sonradan kimin
neyi neden değiştirdiğinin eksiksiz, denetlenebilir kaydı.

---

## Çalıştırma

### Docker ile

```bash
cp .env.example .env            # JWT_ACCESS_SECRET belirleyin (openssl rand -base64 48)
docker compose up --build
docker compose exec api npx ts-node --transpile-only prisma/seed.ts   # demo veri, isteğe bağlı
```

<https://localhost:8443> adresini açın ve Caddy'nin yerel sertifikasını bir kez kabul edin. Giden
e-postalar <http://localhost:8025> adresindeki Mailpit'te görünür.

### Docker olmadan

Node 22 ve PostgreSQL 16 gerekir. Redis isteğe bağlıdır.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL değerini kontrol edin
npm run db:migrate && npm run db:seed
npm run dev                                  # API :4000, web :3000
```

`REDIS_URL` boşsa API bellek içi hız sınırlayıcı kullanır ve e-posta kuyruğunu atlar. `SMTP_URL`
boşsa e-postalar gönderilmek yerine `apps/api/.outbox` klasörüne yazılır.

### Gerçek telefonda deneme

Kamera güvenli bağlam ister. `localhost` güvenli sayılır, yerel ağ adresi sayılmaz; bu yüzden
sertifika gerekir:

```bash
brew install mkcert && mkcert -install
cd apps/web/certificates
mkcert -cert-file localhost.pem -key-file localhost-key.pem "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost 127.0.0.1 ::1
npm run dev:lan                              # :3000 üzerinde HTTPS
```

`PUBLIC_WEB_URL` değerini IP yerine `.local` ana bilgisayar adına yöneltin — ad, DHCP değişimini
atlatır, IP atlatmaz. Telefonda CA sertifikasını
`https://<ad>.local:3000/rootCA.crt` adresinden kurun; iOS'ta ayrıca
*Ayarlar → Genel → Hakkında → Sertifika Güven Ayarları* bölümünden etkinleştirin.

---

## Demo hesaplar

Hepsinin şifresi: `Demo!Pass2026`

| Rol | E-posta |
|-----|---------|
| Yönetici | `admin@pau.edu.tr` |
| Öğretim elemanı | `teacher@pau.edu.tr`, `teacher2@pau.edu.tr` |
| Öğrenci | `student@pau.edu.tr`, `student02@pau.edu.tr` … `student30@pau.edu.tr` |

---

## Roller

**Öğrenci** — kendi yoklama geçmişini ve katılım oranını görür, giriş için tarama yapar, kamera
çalışmazsa düzeltme veya elle giriş talep edebilir. Kendi adını değiştiremez.

**Öğretim elemanı** — kendi derslerini oluşturur ve yönetir, merkezi listeden öğrenci ekler,
dersi başlatır ve bitirir, yoklamanın canlı dolmasını izler, gerekçeyle düzeltme yapar, Excel
raporu alır, öğrenci taleplerini ve cihaz değişikliklerini onaylar veya reddeder.

**Yönetici** — tüm derslerde öğretim elemanının yapabildiği her şeyi yapar; ayrıca kullanıcı
yönetimi, tablo ile içe aktarma, platform ayarları ve denetim kaydı.

---

## Yoklama nasıl işler

İki tarama bilinçli olarak farklıdır:

| Adım | Kamera | Ne yapar | Asla ne yapmaz |
|------|--------|----------|----------------|
| **1. QR** | Telefonun kendi kamera uygulaması | Ders bağlantısını açar | — |
| **2. Check-In Tag** | Tarayıcı kamerası (`getUserMedia`, HTTPS) | Canlı görüntüden geçerli işareti yerel olarak tanır | Dosya yüklemez, fotoğraf çekmez, kare saklamaz |

Akış:

1. Öğretim elemanı dersi başlatır ve projeksiyon ekranını açar.
2. Projeksiyonda QR kod ve geri sayımlı Check-In Tag görünür.
3. Öğrenci QR'ı telefon kamerasıyla okutur, istenirse giriş yapar.
4. **Check-In Tag tara**'ya dokunur ve projeksiyona doğrultur.
5. Tarayıcı işareti tanır ve sunucuya yalnızca **kimliğini** gönderir.
6. Sunucu, o anda geçerli olan dilimle karşılaştırır ve sonucu kaydeder.

Kameradan hiçbir şey telefondan çıkmaz. Yalnızca bir sayı çıkar.

---

## İş kuralları

### Ders yaşam döngüsü

```
DRAFT ──başlat──▶ ACTIVE ──bitir──▶ ENDED ──kilitle──▶ LOCKED
  └───────────────── iptal ─────────────────▶ CANCELLED
```

- Ders ileri bir tarihe planlanabilir veya hemen başlatılabilir.
- Başlatma, tarih ve saat aralığını sorar; geç kalma bu sınırlara göre belirlenir.
- Ders bittiğinde giriş yapmayan herkes **YOK** olarak kaydedilir.
- Kilitli bir ders, kural aksini söylemedikçe yalnızca yönetici tarafından düzeltilebilir.

### Yoklama durumları

| Durum | Anlamı |
|-------|--------|
| `PRESENT` | Geç kalma eşiği içinde doğrulandı |
| `LATE` | Eşikten sonra doğrulandı |
| `ABSENT` | Hiç doğrulanmadı; ders bitince yazılır |
| `MANUAL_PRESENT` / `MANUAL_LATE` | Öğretim elemanı tarafından, her zaman gerekçeyle |
| `EXCUSED` | Mazeretli |
| `REMOVED_FROM_SESSION` | Bu dersten çıkarıldı; geçmiş korunur |

### İşaret penceresi

İşaret 10 saniyede bir değişir. Sınırdan **önce başlamış** bir tarama, değişimden sonra 2 saniye
daha kabul edilir; böylece tam değişim anında taramaya başlayan öğrenci cezalandırılmaz. Sınırdan
sonra başlayan tarama bu toleransı almaz.

Tüm zamanlama sunucu saatiyledir. Telefonun saatine asla güvenilmez.

### Kimler sayılır

Yalnızca derse kayıtlı öğrenciler giriş yapabilir. Kaydı silinen öğrencinin geçmiş yoklaması
korunur, sonraki derslere girişi engellenir.

---

## Cihaz bağlama

Öğrencinin hesabı tek bir cihaza bağlıdır; böylece bir telefon birkaç kişi adına giriş yapamaz.

**Nasıl kanıtlanır.** Uzun ömürlü bir `httpOnly` çerez tarayıcıyı tanımlar. Yanında kaba bir
parmak izi (tarayıcı bilgisi, ekran, saat dilimi) saklanır; ancak bu yalnızca silinmiş bir çerezi
geri getirmek için ve yalnızca doğru şifreyi zaten girmiş biri için kullanılır. Tek başına asla
bir kimlik bilgisi değildir.

**İlk girişte** bağlama yapılmadan önce *"Bu sizin telefonunuz mu?"* diye sorulur. Hiçbir şey
sessizce bağlanmaz.

**Farklı bir cihaz** reddedilir ve öğrenciye gerekçeli değişiklik talebi için bağlantı sunulur.
Bir öğretim elemanı veya yönetici inceler; onay hesabı yeni cihaza taşır ve eskisini çıkarır.

**Aynı cihazda ikinci bir hesap** doğrudan reddedilir.

**Öğretim elemanları ve yöneticiler muaftır.** Derslik bilgisayarlarından, dizüstülerden ve kendi
telefonlarından çalışırlar; onları tek tarayıcıya kilitlemek, onaylayacak kimsenin kalmadığı
talepler yaratırdı.

> **Bilinen sınır.** Tarayıcılar depolamayı paylaşmaz; bu yüzden aynı telefondaki farklı bir
> tarayıcı farklı bir cihaz sayılır. Tarayıcıdan bağımsız gerçek cihaz kimliği bir web
> uygulamasında mümkün değildir; nativ uygulama gerektirir. Pratikte bu kuralı zayıflatmaz,
> sıkılaştırır.

---

## Öğrenci içe aktarma

Yöneticiler, öğrenci işlerinin kendi tablosundan (`.xlsx` veya `.csv`) toplu hesap oluşturabilir.

Sütun başlıkları Türkçe, İngilizce ve Bulgarca tanınır:

| Alan | Kabul edilen başlıklar |
|------|------------------------|
| Ad *(zorunlu)* | `Ad Soyad`, `Name`, `Име` |
| E-posta *(zorunlu)* | `E-posta`, `E-mail`, `Имейл` |
| Öğrenci numarası | `Öğrenci No`, `Faculty number`, `Факултетен номер` |
| Bölüm | `Bölüm`, `Programme`, `Специалност` |
| Sınıf | `Sınıf`, `Year`, `Курс` |
| Grup | `Grup`, `Group`, `Група` |

İçe aktarma iki adımlıdır. **Önizleme** dosyayı ayrıştırır ve her sorunu işaretler — geçersiz
e-posta, dosya içinde yinelenen kayıt, zaten var olan hesap — hiçbir şey yazmadan. Yalnızca
yönetici onayladıktan sonra hesaplar satır satır oluşturulur; böylece tek bir hatalı satır, iki
yüz satırlık başarılı bir aktarımı çöpe atamaz. Rapor her satıra ne olduğunu tek tek söyler.

Hazır bir örnek: [`students-template.xlsx`](students-template.xlsx).

Her yeni hesap, ilk girişte değiştirilmesi zorunlu, üretilmiş bir şifre alır.

---

## Raporlar

| Rapor | Nerede |
|-------|--------|
| Ders bazında | Ders → Yoklama ve raporlar |
| Hafta bazında | Raporlar (öğretim elemanı kendi derslerini, yönetici hepsini görür) |
| Tek ders | Ders → Ders saatleri → indirme simgesi |

Tüm dışa aktarımlar `.xlsx` biçimindedir ve formül enjeksiyonuna karşı korumalıdır. Her dışa
aktarım denetim kaydına yazılır.

---

## Mimari

```
apps/
  api/   NestJS + Prisma + PostgreSQL + Socket.IO
  web/   Next.js (App Router) + React Query + Tailwind
```

| Katman | Seçim | Neden |
|--------|-------|-------|
| API | NestJS 11 | Modüller alan modeliyle birebir örtüşür |
| Veritabanı | Prisma üzerinden PostgreSQL 16 | İlişkisel geçmiş, depoda tutulan göçler |
| Canlı güncelleme | Socket.IO | Liste yoklama yapmadan dolar; oturumlar anında iptal edilir |
| Şifreler | Argon2id | Bellek yoğun |
| Oturumlar | httpOnly çerezler, yeniden kullanım tespitli dönen yenileme belirteçleri | JavaScript'ten okunamaz |
| İşaret | AprilTag 36h11, dilim başına HMAC ile türetilir | Ders sırrı olmadan kimlikler tahmin edilemez |
| Tanıma | Web Worker içinde `js-aruco2` | Telefonda çalışır; kareler telefondan çıkmaz |
| Raporlar | ExcelJS | Formül enjeksiyonuna karşı güvenli |

İşaretleri türetmek için kullanılan ders sırrı hiçbir istemciye gönderilmez. Projeksiyon yalnızca
geçerli işaret kimliğini alır.

---

## Ayarlar

Yönetici, kodu değiştirmeden platform davranışını çalışma anında değiştirebilir:

- Geç kalma eşiği, girişin kapanma süresi, otomatik bitirme
- İşaret toleransı, tarama geçerliliği, tarama başına en fazla deneme
- Hesap açılışı: üretilmiş şifre veya etkinleştirme bağlantısı
- Öğrenci başına tek oturum, öğretim elemanı başına en fazla oturum
- Öğrencinin düzenleyebileceği alanlar
- Derslerin otomatik kilitlenmesi, düzeltmelerin onay gerektirip gerektirmediği
- Kategori bazında veri saklama süreleri

Bir kuralın değişmesi, geçmiş bir dersi asla yeniden değerlendirmez: her ders, yapıldığı andaki
kuralların bir anlık görüntüsünü saklar.

---

## Güvenlik ve gizlilik

- Hiçbir fotoğraf, video veya biyometrik veri saklanmaz. Tanıma tarayıcıda yapılır ve yalnızca
  bir işaret kimliği iletilir.
- Şifreler Argon2id ile özetlenir. Belirteçler CSRF korumalı `httpOnly` çerezlerde tutulur.
- Yeniden kullanılan bir yenileme belirteci tüm aileyi geçersiz kılar — çalınan belirteç fark
  edilebilir.
- Veriyi değiştiren her işlem; öznesi, hedefi ve önemli olduğu yerde gerekçesiyle denetim
  kaydına yazılır.
- Saklama süreleri kategori bazında ayarlanır ve zamanlanmış bir görevle uygulanır.

---

## Testler

```bash
createdb attendance_test
(cd apps/api && DATABASE_URL=postgresql://…/attendance_test npx prisma migrate deploy)
npm test
```

Uçtan uca testler, yanlış yapılması kolay noktaları kapsar: tam 10:00 sınırı (10:00 var,
10:00.001 geç), 2 saniyelik işaret toleransı, tekrarlanan ve eşzamanlı taramalar, iptal edilmiş
eski telefon, kaydı silinmiş ve dersten çıkarılmış öğrenci, tarama sırasında biten ders, cihaz
bağlama retleri ve başka bir öğretim elemanının dersine uzanan isteğe 403.
