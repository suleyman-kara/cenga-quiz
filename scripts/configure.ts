/**
 * Kulübün Firebase projesine bağlanmak için yerel dosyaları üretir.
 *
 *   npm run configure -- firebase-config.txt
 *   npm run configure -- firebase-config.txt --recaptcha <site-key>
 *   pbpaste | npm run configure          (stdin'den de okur)
 *
 * Girdi: Firebase Console → Proje ayarları → Uygulamalarınız → Web uygulaması →
 * "SDK kurulumu ve yapılandırması" → "Config" bölümündeki firebaseConfig bloğu.
 *
 * Yazılan dosyalar (hepsi .gitignore'da):
 *   .firebaserc               → firebase CLI'nın varsayılan projesi
 *   .env.production.local     → web istemcisinin production yapılandırması
 *   functions/.env.<projeId>  → Cloud Functions parametreleri (DATABASE_URL)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFirebaseConfig, buildOutputs, mergeEnvFile } from "./lib/firebaseConfig";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const rIdx = args.indexOf("--recaptcha");
const recaptchaSiteKey = rIdx >= 0 ? args[rIdx + 1] : undefined;
const file = args.find((a, i) => !a.startsWith("--") && (rIdx < 0 || i !== rIdx + 1));

const input = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const parsed = parseFirebaseConfig(input);
if (!parsed.ok) {
  console.error("✗ Yapılandırma okunamadı:");
  for (const e of parsed.errors) console.error("  - " + e);
  process.exit(1);
}
for (const w of parsed.warnings) console.warn("⚠ " + w);

const out = buildOutputs(parsed.config, { recaptchaSiteKey });
const files: [string, string][] = [
  [".firebaserc", out.firebaserc],
  [out.webEnvFile, out.webEnv],
  [out.functionsEnvFile, out.functionsEnv],
];
for (const [rel, content] of files) {
  const p = join(root, rel);
  console.log(`${existsSync(p) ? "↻ güncellendi" : "+ oluşturuldu"}: ${rel}`);
  const isEnv = rel.includes(".env");
  writeFileSync(p, isEnv && existsSync(p) ? mergeEnvFile(content, readFileSync(p, "utf8")) : content);
}
console.log(`\n✓ Proje: ${parsed.config.projectId}`);
console.log("Sıradaki adımlar: docs/firebase-kurulum.md → 'Deploy' bölümü (npm run deploy).");
