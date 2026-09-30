
const BM_TO_EN_DICTIONARY: Record<string, string> = {
  "pengumuman": "announcement",
  "syarikat": "company",
  "kakitangan": "staff",
  "portal": "portal",
  "selamat datang": "welcome",
  "hari ini": "today",
  "sejarah": "history",
  "batal": "cancel",
  "penting": "important",
  "segera": "urgent",
  "notis": "notice",
  "sila ambil perhatian": "please take note",
  "mesyuarat": "meeting",
  "sumber manusia": "human resources",
  "klien": "client",
  "laporan": "report",
  "kewangan": "finance",
  "gaji": "salary",
  "jabatan": "department",
  "jawatan": "role",
  "status": "status",
  "aktif": "active",
  "cuti": "on leave",
  "berhenti": "resigned",
  "ditamatkan": "terminated",
  "papan pemuka": "dashboard",
  "kemas kini": "update",
  "maklumat": "information",
  "perhatian": "attention",
  "kerja": "work",
  "tindakan": "action",
  "sila": "please",
  "log masuk": "login",
  "kata laluan": "password",
  "e-mel": "email"
};

const EN_TO_BM_DICTIONARY: Record<string, string> = {};
Object.entries(BM_TO_EN_DICTIONARY).forEach(([bm, en]) => {
  EN_TO_BM_DICTIONARY[en] = bm;
});

function cleanTags(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, "");
}

export async function translateText(
  text: string,
  targetLang: 'en' | 'bm'
): Promise<string> {
  const cleanText = cleanTags(text).trim();
  if (!cleanText) return "";

  const sourceLang = targetLang === 'en' ? 'ms' : 'en';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang === 'bm' ? 'ms' : 'en'}&dt=t&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Translation API request failed");

    const data = await response.json();

    if (data && data[0]) {
      const translatedParts = data[0].map((part: any) => part[0] || "");
      return translatedParts.join(" ");
    }
    throw new Error("Invalid response format");
  } catch (error) {
    console.warn("Google Translate API failed, using dictionary fallback:", error);

    let translated = cleanText;
    const dictionary = targetLang === 'en' ? BM_TO_EN_DICTIONARY : EN_TO_BM_DICTIONARY;

    const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      translated = translated.replace(regex, (match) => {
        const replacement = dictionary[key];
        if (match === match.toUpperCase()) return replacement.toUpperCase();
        if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
        return replacement;
      });
    }

    return translated + ` (Fallback translation)`;
  }
}
