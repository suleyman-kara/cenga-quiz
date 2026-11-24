# Etkinlik operasyon kontrol listesi

Canlı bir etkinlikten önce ve sırasında yapılması gerekenler. Kod tarafındaki
önlemler (sunucu otoriter puanlama, Security Rules, oyuncu atma/oda kilitleme,
yeniden bağlanma vb.) zaten uygulamada; bu liste **kodla çözülemeyen** kısımlar
içindir. Kaynaklar her maddenin altında.

## 1. Kurulumda bir kez

- [ ] **Blaze planı zorunlu.** Spark planında Realtime Database aynı anda en fazla
  100 bağlantıya izin verir; 100 oyuncu + sunum ekranı bunu aşar. Callable
  Functions ve zamanlanmış temizlik de Blaze ister.
  _Kaynak: firebase.google.com/docs/database/usage/limits_
- [ ] **Bütçe uyarısı kur** (ör. $5 / $20 / $50). Uyarılar harcamayı **durdurmaz**,
  sadece e-posta atar. Cloud Functions için "spend cap" seçeneğini açın.
  _Kaynak: firebase.google.com/docs/projects/billing/avoid-surprise-bills_
- [ ] **API anahtarını kısıtla.** Google Cloud Console → APIs & Services →
  Credentials → tarayıcı anahtarı → yalnızca Firebase API'leri ve kendi alan
  adlarınız. Yönlendiren (referrer) listesine **mutlaka**
  `<proje-kimliği>.web.app/*`, `<proje-kimliği>.firebaseapp.com/*` (doğrulama
  ve şifre sıfırlama bağlantılarının açıldığı sayfa buradadır) ve varsa özel alan
  adınızı ekleyin; aksi halde sunucu girişi bozulur. Anahtarın izinli API'leri
  arasında **Identity Toolkit API** ve **Token Service API** bulunmalı
  (e-posta + şifre girişi bunları kullanır). (Web API anahtarı gizli değildir; kısıtlama kötüye
  kullanımı azaltır.)
  _Kaynak: firebase.google.com/docs/projects/api-keys_
- [ ] **Realtime Database konumu `europe-west1`** olmalı (URL
  `*.europe-west1.firebasedatabase.app`). Functions da aynı bölgede.
- [ ] **Sonuç saklama süresi (KVKK):** TTL politikası (`gameResults.expireAt`)
  deploy ile otomatik kurulur; Firestore → TTL sekmesinde göründüğünü kontrol
  edin. Süre `src/club.config.ts` içindeki `game.resultsRetentionDays`.
- [ ] **Anonim hesap temizliği:** Identity Platform'a yükseltilmiş projelerde 30
  günden eski anonim hesaplar otomatik silinir; yükseltme yapılmadıysa hesaplar
  birikir (zararsız ama kota/temizlik açısından not edin).
  _Kaynak: firebase.google.com/docs/auth/web/anonymous-auth_
- [ ] **App Check** (reCAPTCHA Enterprise): önce sadece izleme modunda açın,
  birkaç gün metriklere bakın, sonra Realtime Database, Firestore ve Functions
  için zorunlu kılın (Functions'ta `ENFORCE_APP_CHECK=true`). Zorunlu kılmak 15
  dakikaya kadar sürebilir.
  _Kaynak: firebase.google.com/docs/app-check/enable-enforcement_

## 2. Etkinlikten birkaç gün önce

- [ ] **Hesap oluşturma kotasını geçici olarak artır.** Firebase, IP adresi başına
  saatte **100 yeni hesap** (anonim dahil) sınırı uygular. Kampüs Wi‑Fi'ında tüm
  telefonlar aynı genel IP'den çıktığı için ~100. oyuncudan sonra katılım
  `auth/too-many-requests` ile durabilir.
  Firebase Console → Authentication → Settings → **Sign-up quota** → etkinlik
  saatlerini kapsayan geçici artış planlayın.
  _Kaynak: firebase.google.com/docs/auth/limits_
- [ ] **Mekânın Wi‑Fi'ını test et.** Etkinlik ağına bir telefonla bağlanıp test
  oyununa katılın. Bazı kampüs/otel ağları WebSocket'i engeller veya
  tamponlar; uygulama otomatik olarak yavaş bir yedek yönteme düşer. Sorun
  varsa oyunculara mobil veri kullanmalarını söyleyin. "Captive portal"
  (giriş sayfası) olan ağlarda önce o sayfanın onaylanması gerekir.
  _Kaynak: github.com/firebase/firebase-js-sdk/issues/540_
- [ ] **Soğuk başlangıcı önle (isteğe bağlı):** etkinlik günü
  `MIN_INSTANCES=1` ile deploy edin, etkinlikten sonra `0`'a geri alın.
  Ayar hem sunucu çağrılarını hem katılım/ayrılma tetikleyicilerini kapsar, yani
  boştayken 3 sürekli açık örnek ücretlendirilir.
  _Kaynak: firebase.google.com/docs/functions/manage-functions_

## 3. Etkinlik günü — sunum bilgisayarı

- [ ] Prize takılı, işletim sistemi uykusu kapalı (uygulama ekranı açık tutmayı
  ister, ama işletim sistemi ayarı yine de kapatılmalı).
- [ ] Kablolu ağ ya da yedek olarak telefon hotspot'u.
- [ ] Sunum sekmesi ön planda kalsın: arka plandaki sekmelerde tarayıcı
  zamanlayıcıları yavaşlatır, cevabın otomatik gösterilmesi gecikebilir.
- [ ] Projektör çözünürlüğünde (1920×1080 ve 1024×768) ekranı bir kez kontrol edin.
- [ ] Sunucu bilgisayarı bağlantıyı kaybederse oyun **donar ama veri kaybolmaz**:
  `/host/game/<PIN>` sayfasını aynı hesapla (başka bir cihazdan da olur) açıp
  devam edebilirsiniz. Oyuncuların telefonunda 10 saniye sonra "Sunucunun
  bağlantısı koptu" uyarısı çıkar. Başlamış bir oyun **30 dakika** hiç
  ilerlemezse temizlik işi onu bitirir, sonucu kaydeder ve telefonlarda son
  ekranı gösterir.
- [ ] Klavye ya da sunum kumandasıyla yönetmek için: **Space**, **Enter**,
  **Page Down** ve **→** bir sonraki adıma geçer (başlat → cevabı göster →
  sıralama → sonraki soru). **R** cevabı gösterir, **P** soruyu duraklatır ya da
  devam ettirir. Oyunu bitirmek her zaman fareyle tıklama ister; bir kumanda tuşu
  oyunu yanlışlıkla bitiremez.
- [ ] Soru sırasında: **Duraklat** (süre durur, cevaplar kabul edilmez; devam edince
  verilen cevapların hızı korunur), **+15 sn** ve **Soruyu atla** (hatalı bir soruyu
  puanlamadan geçer; son soru atlanamaz).

## 4. Etkinlik günü — lobi

- [ ] PIN'i sadece salondaki ekranda gösterin; sosyal medyada paylaşmayın.
- [ ] Herkes katıldıktan sonra **lobiyi kilitleyin**.
- [ ] Uygunsuz takma adları lobide **oyuncu adına tıklayıp çıkarın**
  (çıkarılan cihaz aynı oyuna geri giremez).
- [ ] Oyunculara: "Ekranı kilitlemeyin; kilitlenirse sayfaya geri dönmeniz
  yeterli, kaldığınız yerden devam edersiniz."
- [ ] **Geç katılım kapalıdır** (bilinçli karar): oyun başladıktan sonra yeni
  cihaz katılamaz. Aynı tarayıcıdan dönen oyuncu kaldığı yerden devam eder; ama
  farklı bir tarayıcıya/gizli sekmeye geçen ya da çerezlerini silen oyuncu yeni
  bir kimlik alır ve o oyuna geri giremez. Oyunculara uygulama içi tarayıcı
  yerine (Instagram/WhatsApp içinden açılan) normal tarayıcıyı kullanmalarını
  söyleyin.

## 5. Kişisel veriler (KVKK) — hukuki tavsiye değildir

- Saklanan veriler: takma ad, cevaplar, puan ve sıralama; anonim bir kullanıcı
  kimliğine bağlıdır. Veriler Google'ın AB'deki (Belçika, `europe-west1`)
  sunucularında tutulur; bu Türkiye'den yurt dışına aktarım sayılabilir.
- Katılım sayfasında kısa bir aydınlatma metni gösterilir; oyunculara gerçek ad
  yerine takma ad kullanmaları önerilir.
- Kulüp, veri sorumlusu olarak yurt dışı aktarım için gerekli işlemleri
  (ör. standart sözleşme bildirimi) üniversitenin hukuk birimiyle teyit etmelidir.
  _Kaynak: 7499 sayılı Kanun ile değişen KVKK m.9 (1 Haziran 2024 itibarıyla)_

## 6. Loglar ve uyarılar

Her sunucu çağrısı Cloud Logging'e tek satır yazar: `host` mesajı,
`{ action, pin, ms, outcome }` alanlarıyla. `outcome` değeri `ok`, `busy`
(aynı anda iki işlem; istemci kendisi tekrar dener), `refused:<kod>` ya da
`error` olur. Katılım tetikleyicisi `playerJoined` satırına `delayMs` yazar:
katılımla lobideki isim düzeltmesi arasında geçen süre.

İsteğe bağlı alarmlar (Google Cloud → Logging → Log-based metrics → Alerting):

- `jsonPayload.outcome="error"` sayısı 5 dakikada 1'i geçerse.
- `jsonPayload.message="playerJoined"` için `delayMs` 5 saniyeyi geçerse
  (kalabalık katılımda gecikme).

