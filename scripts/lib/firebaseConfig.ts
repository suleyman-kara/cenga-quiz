/**
 * Parses the web app config shown in Firebase Console
 * (Project settings → Your apps → SDK setup and configuration → "Config")
 * and builds the local files the app needs. Pure: no file system access.
 */

export interface WebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

const REQUIRED: (keyof WebConfig)[] = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];

export type ParseResult =
  | { ok: true; config: WebConfig; warnings: string[] }
  | { ok: false; errors: string[] };

/** Accepts the JS snippet (`const firebaseConfig = {...}`) or plain JSON. */
export function parseFirebaseConfig(input: string): ParseResult {
  const found: Record<string, string> = {};
  // key: "value"  |  "key": "value"   (single or double quotes)
  const re = /["']?([A-Za-z]+)["']?\s*:\s*(["'])((?:\\.|(?!\2).)*)\2/g;
  for (const m of input.matchAll(re)) {
    if ((REQUIRED as string[]).includes(m[1]) && !(m[1] in found)) found[m[1]] = m[3];
  }

  const errors: string[] = [];
  for (const k of REQUIRED) if (!found[k]) errors.push(`${k}: bulunamadı`);

  // Values end up in .env files: allow only safe characters.
  const SAFE = /^[A-Za-z0-9_.:/\-]+$/;
  for (const [k, v] of Object.entries(found)) {
    if (!SAFE.test(v)) errors.push(`${k}: geçersiz karakter içeriyor`);
  }
  if (found.projectId && !/^[a-z0-9-]{4,40}$/.test(found.projectId)) {
    errors.push("projectId: geçersiz proje kimliği");
  }
  if (found.databaseURL && !/^https:\/\/[a-z0-9-]+\.[a-z0-9.-]+$/.test(found.databaseURL)) {
    errors.push("databaseURL: https:// ile başlayan bir Realtime Database adresi olmalı");
  }
  if (errors.length) return { ok: false, errors };

  const config = Object.fromEntries(REQUIRED.map((k) => [k, found[k]])) as unknown as WebConfig;
  const warnings: string[] = [];
  if (!config.databaseURL.endsWith(".europe-west1.firebasedatabase.app")) {
    warnings.push(
      "DİKKAT: databaseURL europe-west1 bölgesinde değil. Oyuncu katılım tetikleyicileri " +
        "(isim temizleme, lobi dolu) veritabanıyla aynı bölgede çalışmak zorundadır ve europe-west1'e " +
        "deploy edilir; bu haliyle HİÇ tetiklenmezler. Realtime Database'i europe-west1 (Belçika) " +
        "konumunda yeniden oluşturun.",
    );
  }
  if (!config.authDomain.startsWith(config.projectId)) {
    warnings.push("authDomain proje kimliğiyle başlamıyor; özel alan adı kullanıyorsanız sorun değil.");
  }
  return { ok: true, config, warnings };
}

export interface Outputs {
  firebaserc: string;
  webEnvFile: string;
  webEnv: string;
  functionsEnvFile: string;
  functionsEnv: string;
}

export function buildOutputs(cfg: WebConfig, opts: { recaptchaSiteKey?: string } = {}): Outputs {
  const header = "# configure script tarafından üretildi — gizli bilgi içermez, ama projeye özeldir (git'e eklenmez).\n";
  const webEnv =
    header +
    [
      `VITE_FIREBASE_API_KEY=${cfg.apiKey}`,
      `VITE_FIREBASE_AUTH_DOMAIN=${cfg.authDomain}`,
      `VITE_FIREBASE_PROJECT_ID=${cfg.projectId}`,
      `VITE_FIREBASE_DATABASE_URL=${cfg.databaseURL}`,
      `VITE_FIREBASE_APP_ID=${cfg.appId}`,
      `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=${opts.recaptchaSiteKey ?? ""}`,
    ].join("\n") +
    "\n";
  return {
    firebaserc: JSON.stringify({ projects: { default: cfg.projectId } }, null, 2) + "\n",
    webEnvFile: ".env.production.local",
    webEnv,
    functionsEnvFile: `functions/.env.${cfg.projectId}`,
    functionsEnv: header + `DATABASE_URL=${cfg.databaseURL}\n`,
  };
}
