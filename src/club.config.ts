/**
 * ============================================================================
 *  KULÜP YAPILANDIRMASI — kulübe özel HER ŞEY bu dosyada.
 *  Başka bir kulüp için uyarlarken (bkz. AGENTS.md) sadece bu dosyayı ve
 *  public/club/ altındaki görselleri değiştirin. Kulüp adı başka hiçbir yerde
 *  geçmemelidir (src/brand.guard.test.ts bunu denetler).
 *
 *  Bu dosya hem web istemcisi hem Cloud Functions tarafından içe aktarılır;
 *  bu yüzden burada SADECE düz veri olmalı (import yok, tarayıcı API'si yok).
 * ============================================================================
 *
 *  Marka kaynağı (2026-11-19 tarihinde https://www.cenga.org adresinden çıkarıldı):
 *  - Logo:    https://www.cenga.org/wp-content/uploads/2023/09/replicate-prediction-6p2rzuzbfxnnodpijbv6rbwyj4-1.png
 *             (1000px genişliğe küçültülüp public/club/logo.png olarak kaydedildi)
 *  - Favicon: https://www.cenga.org/wp-content/uploads/2023/07/cropped-cropped-logo-1-270x270.png
 *             (istenen .../2023/09/cropped-logo-1-270x270.png adresi 404 verdi; sitenin
 *             <link rel="icon"> etiketindeki dosya kullanıldı) → public/club/favicon.png
 *  - Renkler: Elementor global kit CSS'i
 *             https://www.cenga.org/wp-content/uploads/elementor/css/post-8.css
 *             içindeki --e-global-color-* değişkenleri + logodan örneklenen renkler.
 *  - Fontlar: post-8.css içindeki --e-global-typography-* değişkenleri
 *             (Roboto 600 başlık, Roboto 400 metin, Roboto Slab ikincil) ve sitenin
 *             yüklediği Google Fonts bağlantıları.
 */

export type Locale = "tr" | "en";

export interface ChoiceStyle {
  /** Sabit kimlik (CSS sınıfı, test seçici vb. için) */
  id: string;
  /** Erişilebilirlik etiketi; ekran okuyucular için şeklin adı */
  label: Record<Locale, string>;
  /** Butonun arka plan rengi */
  color: string;
  /** Şeklin SVG path verisi (viewBox içinde) */
  svgPath: string;
  viewBox: string;
}

export interface FontSpec {
  family: string;
  /** Yedek font yığını */
  fallback: string;
  weights: number[];
}

export interface ClubConfig {
  name: string;
  shortName: string;
  website: string;
  tagline: Record<Locale, string>;
  logo: { src: string; alt: string; width: number; height: number };
  favicon: string;
  locale: Locale;
  colors: {
    /** Ana marka rengi (butonlar, vurgu) */
    primary: string;
    /** Ana rengin koyu tonu (hover/basılı) */
    primaryDark: string;
    /** Logodaki parlak kırmızı */
    primaryBright: string;
    /** İkincil vurgu (doğru cevap, başarı) */
    accent: string;
    /** Yanlış cevap / hata */
    danger: string;
    /** Açık zemin */
    background: string;
    /** Kart / yüzey */
    surface: string;
    /** Büyük ekran (sunum) için koyu zemin */
    stage: string;
    /** Ana metin */
    text: string;
    /** İkincil metin */
    textMuted: string;
    /** Kenarlık / ayırıcı */
    border: string;
  };
  fonts: { heading: FontSpec; body: FontSpec; display: FontSpec };
  /** Şık butonları: sıra = şık indeksi (0..3). 2-4 şıklı sorular ilk N tanesini kullanır. */
  choices: [ChoiceStyle, ChoiceStyle, ChoiceStyle, ChoiceStyle];
  finalScreen: Record<Locale, { title: string; message: string }>;
  social: { label: string; url: string }[];
  /** Oyun kuralları — Cloud Functions da buradan okur. */
  game: {
    defaultQuestionSeconds: number;
    maxPoints: number;
    streakBonus: { enabled: boolean; perStreak: number; max: number };
    leaderboardSize: number;
    maxPlayers: number;
    /** Bu kadar saat hareketsiz kalan odalar zamanlanmış görevle kapatılır */
    abandonedAfterHours: number;
  };
}

export const club: ClubConfig = {
  // Sitede açık uzun ad yok (<title>Cenga</title>, metinlerde "CENGA") → kısa ad kullanıldı.
  name: "CENGA",
  shortName: "CENGA",
  website: "https://www.cenga.org",
  tagline: {
    tr: "Canlı quiz",
    en: "Live quiz",
  },
  logo: { src: "/club/logo.png", alt: "CENGA logosu", width: 1000, height: 252 },
  favicon: "/club/favicon.png",
  locale: "tr",

  colors: {
    primary: "#C3073E", // --e-global-color-d1b21ca (post-8.css)
    primaryDark: "#AC0033", // sayfa CSS'inde (post-58.css) hover tonu
    primaryBright: "#EC1C24", // logodaki kırmızı (logo.png'den örneklendi)
    accent: "#30BF43", // --e-global-color-accent (post-8.css), logodaki yeşille uyumlu
    danger: "#D90845", // post-58.css'teki vurgu kırmızısı
    background: "#F7FAFC", // --e-global-color-kadence8
    surface: "#FFFFFF", // --e-global-color-kadence9
    stage: "#1A202C", // --e-global-color-kadence3
    text: "#2D3748", // --e-global-color-kadence4
    textMuted: "#54595F", // --e-global-color-secondary
    border: "#E4E0E0", // --e-global-color-0e4672f
  },

  fonts: {
    // --e-global-typography-primary: Roboto 600
    heading: { family: "Roboto", fallback: "system-ui, sans-serif", weights: [500, 600, 700, 900] },
    // --e-global-typography-text: Roboto 400
    body: { family: "Roboto", fallback: "system-ui, sans-serif", weights: [400, 500] },
    // --e-global-typography-secondary: Roboto Slab (PIN, skorlar gibi büyük rakamlar)
    display: { family: "Roboto Slab", fallback: "Georgia, serif", weights: [400, 700, 800] },
  },

  // Kulübe özgü şık seti: altıgen, yıldız, damla, artı — renkler CENGA paletinden.
  choices: [
    {
      id: "hexagon",
      label: { tr: "Altıgen", en: "Hexagon" },
      color: "#C3073E", // marka kırmızısı
      viewBox: "0 0 100 100",
      svgPath: "M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z",
    },
    {
      id: "star",
      label: { tr: "Yıldız", en: "Star" },
      color: "#2B6CB0", // --e-global-color-kadence1
      viewBox: "0 0 100 100",
      svgPath:
        "M50 8 L61.8 37.8 L93.7 39.8 L69 60.2 L77 91.2 L50 74 L23 91.2 L31 60.2 L6.3 39.8 L38.2 37.8 Z",
    },
    {
      id: "drop",
      label: { tr: "Damla", en: "Drop" },
      color: "#24923A", // logodaki yeşilin koyu tonu (beyaz metin kontrastı için)
      viewBox: "0 0 100 100",
      svgPath: "M50 6 C50 6 16 46 16 64 A34 34 0 0 0 84 64 C84 46 50 6 50 6 Z",
    },
    {
      id: "plus",
      label: { tr: "Artı", en: "Plus" },
      color: "#4A5568", // --e-global-color-kadence5
      viewBox: "0 0 100 100",
      svgPath: "M38 8 H62 V38 H92 V62 H62 V92 H38 V62 H8 V38 H38 Z",
    },
  ],

  finalScreen: {
    tr: { title: "Tebrikler!", message: "Katıldığınız için teşekkürler. Bir sonraki etkinlikte görüşmek üzere!" },
    en: { title: "Congratulations!", message: "Thanks for playing. See you at the next event!" },
  },

  // Sitenin alt bilgisindeki sosyal bağlantılar (cenga.org ana sayfası)
  social: [
    { label: "Web", url: "https://www.cenga.org" },
    { label: "Instagram", url: "https://www.instagram.com/cengaorg/" },
    { label: "LinkedIn", url: "https://www.linkedin.com/company/cengaorg" },
    { label: "YouTube", url: "https://www.youtube.com/@Cengaorg" },
    { label: "X", url: "https://x.com/cengaorg" },
    { label: "Facebook", url: "https://www.facebook.com/cengaorg/" },
  ],

  game: {
    defaultQuestionSeconds: 20,
    maxPoints: 1000,
    streakBonus: { enabled: true, perStreak: 100, max: 500 },
    leaderboardSize: 5,
    maxPlayers: 300,
    abandonedAfterHours: 6,
  },
};
