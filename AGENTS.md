# AGENTS.md — AI agent'lar için rehber

Bu repo, üniversite kulüpleri için açık kaynak bir **canlı quiz sistemi**dir. En sık
gelecek istek şudur:

> "Bu repoyu **[Kulüp Adı]** (**[site]**) için uyarla, AGENTS.md'yi takip et."

Bu isteği aşağıdaki adımlarla, sırayla yerine getir. Kulüp uyarlaması **sadece
yapılandırma ve görsel değişikliğidir**; oyun mantığına dokunulmaz.

## Değiştirebileceğin dosyalar

| Dosya | Ne için |
|---|---|
| `src/club.config.ts` | Kulübe özel **her şey**: ad, site, logo yolu, renkler, fontlar, şık şekilleri, final ekranı, sosyal bağlantılar, oyun ayarları. |
| `public/club/logo.png`, `public/club/favicon.png` | Kulübün logosu ve favicon'u. |

## Dokunma

- `shared/`: istemci, Functions, kurallar ve testler arasındaki sözleşme.
- `rules/`: Firestore ve Realtime Database güvenlik kuralları.
- `functions/src/`: sunucu otoriter oyun mantığı (puanlama, katılım, temizlik).
- `src/game/`: istemci oyun akışı.

Kulüp adı **sadece** `src/club.config.ts` içinde geçer. Başka bir dosyaya yazarsan
`src/brand.guard.test.ts` kırmızıya döner. Kodda, metinlerde ve commit'lerde başka
hiçbir quiz ürününün adı geçmez; aynı test bunu da denetler.

## Adımlar

### 1. Kulüp bilgilerini iste

Kullanıcıdan şunları al. Eksik varsa sor, tahmin etme:

- Kulübün adı (uzun ad ve kısa ad farklıysa ikisi de)
- Web sitesinin adresi
- Logo (dosya ya da adres). Yoksa siteden çıkaracağını söyle.

### 2. Siteden marka dilini çıkar

Kulübün sitesini aç ve şunları topla:

- **Logo:** Sitenin başlığındaki `<img>` ya da `og:image`. Geniş, şeffaf zeminli
  PNG tercih et; gerekirse ~1000 px genişliğe küçült.
- **Favicon:** `<link rel="icon">` etiketindeki dosya (tercihen 192-512 px PNG).
- **Renkler:** WordPress + Elementor sitelerinde global kit CSS'i
  (`/wp-content/uploads/elementor/css/post-<id>.css`) içindeki
  `--e-global-color-*` değişkenleri. Elementor yoksa sitenin ana CSS'indeki
  CSS değişkenleri ya da buton/başlık renkleri. Logodan da renk örnekleyebilirsin.
- **Fontlar:** Sitenin yüklediği Google Fonts bağlantıları ya da
  `--e-global-typography-*` değişkenleri.

Her değerin **kaynağını** `src/club.config.ts` içinde yorum satırı olarak yaz:
dosyanın başındaki "Marka kaynağı" bloğuna adresleri, her rengin yanına hangi
değişkenden geldiğini (ör. `// --e-global-color-accent (post-8.css)`).

Siteye erişemezsen (engel, giriş sayfası, zaman aşımı) **dur ve kullanıcıya sor**:
logoyu ve renkleri doğrudan isteyebilirsin. Uydurma renk ya da font kullanma.

Kontrast: şık butonlarının üzerinde beyaz metin ve şekil var. Her şık rengi beyazla
en az 4.5:1 kontrast vermeli; açık renkleri koyulaştır ve bunu yorumda belirt.

### 3. Yapılandırmayı doldur

- `src/club.config.ts` içindeki `club` nesnesini doldur. Tipler (`ClubConfig`)
  dosyanın başında; her alanın açıklaması orada.
- Logoyu `public/club/logo.png`, favicon'u `public/club/favicon.png` olarak kaydet.
  `logo.width` ve `logo.height` değerlerini gerçek piksel boyutlarıyla güncelle.
- Doğrula:

  ```bash
  npm install && npm --prefix functions install
  npm run test:unit
  npm run typecheck:all
  ```

  İkisi de yeşil olmalı. `npm run dev:all` ile yerelde (emulator'larla, Java 21+
  gerekir) görsel olarak da bakabilirsin.

### 4. Firebase projesini kullanıcıyla birlikte kur

Ayrıntılar [`docs/firebase-kurulum.md`](docs/firebase-kurulum.md) içinde. Özet:

1. Firebase konsolunda proje oluştur (Analytics gerekmez).
2. **Blaze planı:** Kart bilgisi ve fatura onayını **kullanıcı** yapar; sen bu
   adımda dur.
3. **Bütçe uyarısı:** Google Cloud → Faturalandırma → Bütçeler ve uyarılar.
   Fatura hesabının para birimine dikkat et (ör. TL hesabında dolar tutarı
   girilmez); tutarı kullanıcıya sor.
4. Authentication: **Email/Password** ve **Anonymous** sağlayıcılarını aç.
5. Firestore: Production mode, konum `europe-west1` ya da `eur3`.
6. Realtime Database: **Belçika (`europe-west1`)**, Locked mode. Başka bölgede
   oyuncu katılım tetikleyicileri çalışmaz.
7. Web uygulaması ekle, `firebaseConfig` bloğunu `firebase-config.txt` dosyasına
   kaydet. Bu dosya git'e eklenmez.

### 5. Yapılandırmayı aktar

```bash
npm run configure -- firebase-config.txt
```

Uyarı verirse (ör. RTDB yanlış bölgede) dur ve kullanıcıya sor.

### 6. Deploy et

```bash
npx firebase login   # kullanıcının Google hesabıyla; onayı kullanıcı verir
npm run deploy
```

- "Eventarc service agent permissions propagating" hatası ilk deploy'da normaldir:
  birkaç dakika bekle, `npm run deploy:functions` ile tekrarla.
- "Artifact cleanup policy" sorulursa varsayılanı kabul et.
- Sonra Firestore'da `allowedHosts/{küçük harfli e-posta}` belgesini oluştur
  (alan: `addedAt` number = 0). E-postayı kullanıcıya sor.

### 7. Örnek quizle uçtan uca test et

1. `https://<proje>.web.app/host` → **Kayıt ol** (e-posta + şifre; e-posta önce
   `allowedHosts`'ta olmalı) → doğrulama e-postasındaki bağlantı → **Doğruladım,
   devam et**. Doğrulama/sıfırlama e-postaları Firebase'in varsayılan
   göndericisinden gelir, spam klasörüne düşebilir. Şifreyi kullanıcı belirler.
2. `quizzes/ornek.json` dosyasını "JSON'dan quiz içe aktar" ile yükle → oyunu başlat.
3. Oyuncu tarafını ayrı bir oturumda aç (gizli pencere ya da telefon): PIN + takma ad.
4. Lobi → "hazır ol" → cevap → sıralama → oyunu bitir → podyum adımlarının hepsi
   çalışmalı.
5. Hata olursa `npx firebase functions:log` çıktısına ve tarayıcı konsoluna bak.

Bitince kullanıcıya proje kimliğini, Hosting adresini, test sonucunu ve kalan manuel
adımları ([`docs/operasyon.md`](docs/operasyon.md): kota artışı, API anahtarı
kısıtlaması, App Check) raporla.

## Genel kurallar

- Gizli bilgi (service account anahtarı, parola, token) oluşturma, dosyaya ya da
  commit'e yazma. `firebaseConfig` değerleri gizli değildir ama projeye özeldir ve
  git dışında kalır.
- Ödeme, kart girişi, Google hesabı onayları ve proje silme kullanıcının işidir.
- Kod değişikliği gerekirse önce testini yaz; `npm run test:unit` ve
  `npm run typecheck:all` yeşil kalsın.
- Quiz dosyalarının biçimi `quizzes/quiz.schema.json` içinde tanımlı.
