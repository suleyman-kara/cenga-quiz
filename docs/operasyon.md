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
  adlarınız. (Web API anahtarı gizli değildir; kısıtlama kötüye kullanımı azaltır.)
  _Kaynak: firebase.google.com/docs/projects/api-keys_
- [ ] **Realtime Database konumu `europe-west1`** olmalı (URL
  `*.europe-west1.firebasedatabase.app`). Functions da aynı bölgede.
- [ ] **Sonuç saklama süresi (KVKK):** Firestore → TTL politikaları →
  `gameResults` koleksiyonu, alan `expireAt`. Süre `src/club.config.ts`
  içindeki `game.resultsRetentionDays` ile belirlenir.
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
  Sürekli açık bir örnek boşta da ücretlendirilir.
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
  devam edebilirsiniz.

## 4. Etkinlik günü — lobi

- [ ] PIN'i sadece salondaki ekranda gösterin; sosyal medyada paylaşmayın.
- [ ] Herkes katıldıktan sonra **lobiyi kilitleyin**.
- [ ] Uygunsuz takma adları lobide **oyuncu adına tıklayıp çıkarın**
  (çıkarılan cihaz aynı oyuna geri giremez).
- [ ] Oyunculara: "Ekranı kilitlemeyin; kilitlenirse sayfaya geri dönmeniz
  yeterli, kaldığınız yerden devam edersiniz."

## 5. Kişisel veriler (KVKK) — hukuki tavsiye değildir

- Saklanan veriler: takma ad, cevaplar, puan ve sıralama; anonim bir kullanıcı
  kimliğine bağlıdır. Veriler Google'ın AB'deki (Belçika, `europe-west1`)
  sunucularında tutulur; bu Türkiye'den yurt dışına aktarım sayılabilir.
- Katılım sayfasında kısa bir aydınlatma metni gösterilir; oyunculara gerçek ad
  yerine takma ad kullanmaları önerilir.
- Kulüp, veri sorumlusu olarak yurt dışı aktarım için gerekli işlemleri
  (ör. standart sözleşme bildirimi) üniversitenin hukuk birimiyle teyit etmelidir.
  _Kaynak: 7499 sayılı Kanun ile değişen KVKK m.9 (1 Haziran 2024 itibarıyla)_
