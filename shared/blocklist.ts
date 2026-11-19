/**
 * Display-name blocklist (Turkish + English), kept deliberately small.
 * Clubs can extend both lists. Entries are written naturally (Turkish letters, any case):
 * they go through the same normalization as names (see profanity.ts), so "piç" matches
 * "PIC", "p1ç", "p.i.ç" …
 *
 * - SUBSTRINGS: distinctive enough to be matched anywhere in the name (spaces and
 *   punctuation removed), e.g. "Ali_s1kt1r" is caught.
 * - WORDS: short or ambiguous entries, matched only as a whole word or as the whole
 *   name — so "Işık" (contains "sik") or "Scunthorpe" stay allowed.
 */

export const BLOCKED_SUBSTRINGS: readonly string[] = [
  // Türkçe
  "orospu",
  "siktir",
  "sikerim",
  "sikeyim",
  "yarrak",
  "pezevenk",
  "amcık",
  "amınako",
  "amınıso",
  "şerefsiz",
  "kahpe",
  "yavşak",
  "gerizekalı",
  // English
  "fuck",
  "bitch",
  "asshole",
  "whore",
  "motherf",
  "nigger",
  "faggot",
];

export const BLOCKED_WORDS: readonly string[] = [
  // Türkçe
  "amk",
  "aq",
  "mk",
  "oç",
  "piç",
  "sik",
  "sikiş",
  "ibne",
  "puşt",
  "gavat",
  "kaltak",
  "dalyarak",
  // English
  "shit",
  "cunt",
  "dick",
  "slut",
  "bastard",
  "wanker",
];
