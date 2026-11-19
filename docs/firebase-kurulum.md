# Firebase kurulumu (gerçek projeye bağlama)

Yerel geliştirme için Firebase hesabı gerekmez (`npm run dev:all` emulator'larla
çalışır). Bu rehber, uygulamayı kulübün **gerçek** Firebase projesine bağlayıp
yayına almak içindir. Toplam süre: ~30 dakika (ilk Functions deploy'u 5-10 dk).

> Etkinlik öncesi/günü yapılacaklar (kota artışı, ağ testi, lobi kilidi…) ayrıca
> [`docs/operasyon.md`](operasyon.md) içinde.

## 1. Projeyi oluştur

1. <https://console.firebase.google.com> → **Proje ekle**. Proje kimliğini not et
   (ör. `kulup-quiz`). Google Analytics gerekmez.
2. **Blaze planına geç** (sol alt → Yükselt). Zorunlu: Cloud Functions, zamanlanmış
   temizlik ve 100'den fazla eşzamanlı bağlantı Blaze ister. Kulüp ölçeğinde
   (ayda birkaç oyun, oyun başına ~100 kişi) ücretsiz kotaların altında kalınır.
3. **Bütçe uyarısı** kur: Google Cloud Console → Faturalandırma → Bütçeler ve
   uyarılar → ör. $5 ve $20. (Uyarılar harcamayı durdurmaz, e-posta gönderir.)

## 2. Ürünleri aç

| Ürün | Ayar |
|---|---|
| **Authentication** → Sign-in method | **Google**'ı etkinleştir (destek e-postası seç) ve **Anonymous**'u etkinleştir. |
| **Firestore Database** | Oluştur → *Production mode* → konum: `eur3 (Europe)` veya `europe-west1`. Kurallar deploy ile gelir. |
| **Realtime Database** | Oluştur → konum: **Belçika (`europe-west1`)** → *Locked mode*. Kurallar deploy ile gelir. |
| **Hosting** | Ayrıca bir şey yapmaya gerek yok; ilk deploy açar. |

> Realtime Database **mutlaka** `europe-west1`'de olmalı: oyuncu katılım
> tetikleyicileri (isim temizleme, lobi dolu sayacı) veritabanıyla aynı bölgede
> çalışmak zorundadır ve Functions `europe-west1`'e deploy edilir. Başka bölgede
> oluşturulan veritabanında tetikleyiciler hiç çalışmaz. Varsayılan örneğin adı
> `<proje-kimliği>-default-rtdb` olmalı (yeni projelerde zaten böyledir).

## 3. Web uygulamasını ekle ve yapılandırmayı aktar

1. Proje ayarları (⚙) → **Uygulamalarınız** → Web (`</>`) → bir takma ad ver
   (Hosting kutusunu işaretlemeye gerek yok) → **Uygulamayı kaydet**.
2. Gösterilen `const firebaseConfig = { ... }` bloğunu kopyalayıp bir dosyaya
   kaydet (ör. `firebase-config.txt`). Bu değerler gizli değildir; tarayıcıya
   zaten gönderilirler.
3. Repo kökünde:

   ```bash
   npm install && npm --prefix functions install
   npm run configure -- firebase-config.txt
   ```

   Bu komut şu dosyaları üretir (hepsi git dışı):
   `.firebaserc`, `.env.production.local`, `functions/.env.<proje-kimliği>`.
   Realtime Database `europe-west1`'de değilse uyarı verir.

## 4. Deploy

```bash
npx firebase login          # tarayıcıda Google hesabınla giriş
npm run deploy              # web build + kurallar + Functions + Hosting
```

- İlk Functions deploy'unda CLI gerekli Google Cloud API'lerini (Cloud Build,
  Artifact Registry, Cloud Run, Cloud Scheduler, Eventarc, Pub/Sub) açar; birkaç
  dakika sürebilir. "Artifact cleanup policy" sorulursa varsayılanı kabul et.
- İlk deploy **"Eventarc service agent permissions propagating"** hatasıyla
  durabilir: birkaç dakika bekleyip `npm run deploy:functions` ile tekrarla.
- Functions deploy'u önce tip kontrolü yapar; bu yüzden `npm --prefix functions install`
  çalıştırılmış olmalı.
- Firestore TTL politikası (`gameResults.expireAt`, KVKK saklama süresi) deploy ile
  **otomatik** kurulur; ayrıca bir şey yapmaya gerek yok.
- Sadece bir parçayı güncellemek için: `npm run deploy:rules`,
  `npm run deploy:functions`, `npm run deploy:hosting`.
- Deploy bitince CLI, Hosting adresini yazar:
  `https://<proje-kimliği>.web.app`.

## 5. Kendini sunucu (host) olarak ekle

Sunucu paneline sadece izin listesindeki Google hesapları girebilir.

**Konsoldan (en kolay):** Firestore Database → **Koleksiyon başlat** →
koleksiyon kimliği `allowedHosts` → belge kimliği: e-posta adresin, **küçük
harflerle** (ör. `ad.soyad@gmail.com`) → bir alan ekle: `addedAt` (number) =
`0` → Kaydet. Başka sunucular için aynı koleksiyona yeni belge ekle.

**Komut satırından (isteğe bağlı):** `gcloud auth application-default login`
yaptıktan sonra `npm run add-host -- ad.soyad@gmail.com`.

## 6. Uçtan uca dene

1. `https://<proje-kimliği>.web.app/host` → Google ile giriş.
2. **JSON'dan quiz içe aktar** → `quizzes/ornek.json` dosyasını seç → kaydet.
3. **Oyunu başlat** → büyük ekranda PIN görünür.
4. Telefondan `https://<proje-kimliği>.web.app` → PIN + takma ad → katıl.
5. Başlat → cevapla → sıralama → oyunu bitir. Podyum görünmeli.

## 7. İsteğe bağlı (önerilen) ayarlar

- **Sonuç saklama süresi:** `src/club.config.ts` → `game.resultsRetentionDays`
  (varsayılan 365 gün). TTL politikası deploy ile kurulur; Firestore → *TTL*
  sekmesinden görebilirsin.
- **Sunucu listesi değişiklikleri** (`allowedHosts`) Functions önbelleği yüzünden
  en geç 60 saniyede etkinleşir.
- **App Check (bot koruması):** App Check → Web uygulaması → reCAPTCHA
  Enterprise → site anahtarını al →
  `npm run configure -- firebase-config.txt --recaptcha <site-anahtarı>` →
  `npm run deploy:hosting`. Birkaç gün metrikleri izledikten sonra
  Realtime Database / Firestore için **Enforce**'a bas ve Functions'ı
  `ENFORCE_APP_CHECK=true` ile deploy et (`functions/.env.<proje-kimliği>`
  dosyasına satır olarak ekle).
- **Etkinlik günü soğuk başlangıcı önleme:** `functions/.env.<proje-kimliği>`
  dosyasına `MIN_INSTANCES=1` ekle → `npm run deploy:functions`; etkinlikten
  sonra `0` yapıp tekrar deploy et.
- **Özel alan adı:** Hosting → Özel alan adı ekle. Sonra Authentication →
  Settings → **Authorized domains** listesine o alan adını ekle.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Sunucu panelinde "yetkin yok" | `allowedHosts` belge kimliği e-postanla birebir (küçük harf) aynı mı? |
| Google girişi açılır pencerede `auth/unauthorized-domain` | Authentication → Settings → Authorized domains'e alan adını ekle. |
| Oyuncular katılamıyor, `auth/too-many-requests` | Aynı ağdan çok kişi: Authentication → Settings → Sign-up quota'yı geçici olarak artır (bkz. operasyon.md). |
| Functions deploy'u "billing account" hatası | Proje Blaze planında değil. |
| Sayfa boş / "yapılandırma eksik" ekranı | `npm run configure` çalıştırılmadan build alınmış. Çalıştırıp `npm run deploy:hosting`. |
| Functions logları | `npx firebase functions:log` veya Google Cloud Console → Logging. |
