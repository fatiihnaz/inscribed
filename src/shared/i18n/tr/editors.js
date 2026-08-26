/**
 * @file Turkish wording for the field editors and the inline page-side affordances.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const editors = Object.freeze({
  "editors.image.replace": "Değiştir",
  "editors.image.remove": "Kaldır",
  "editors.image.empty": "Görsel yok",
  "editors.image.upload": "Görsel yükle",
  "editors.image.uploadHint": "tıkla veya sürükle-bırak",
  "editors.image.drop": "Bırak",
  "editors.image.uploading": "Yükleniyor {percent}%",
  "editors.image.processing": "İşleniyor…",
  "editors.image.dismissError": "Hatayı kapat",
  "editors.image.url": "Görsel URL",
  "editors.image.alt": "Alt metin",
  "editors.image.altPlaceholder": "Görseli tarif et",

  "editors.upload.notImage": "Lütfen bir görsel dosyası seçin.",
  "editors.upload.noUrl": "CDN cevabında url bulunamadı",
  "editors.upload.failed": "Yükleme başarısız.",

  "editors.text.label": "Metin",
  "editors.richText.label": "Zengin metin",
  "editors.link.label": "Etiket",
  "editors.link.url": "URL",
  "editors.number.increment": "Artır",
  "editors.number.decrement": "Azalt",
  "editors.url.suspect": "Bu adres bir bağlantıya benzemiyor. Yine de kaydedilir.",

  "editors.list.noSchema": "Bu liste için {schema} bulunamadı. Sayfada {component} render ediliyor mu?",
  "editors.list.empty": "Liste boş. \"+ Öğe ekle\" butonuyla başlayabilirsin.",
  "editors.list.addItem": "Öğe ekle",
  "editors.list.emptyItem": "Boş öğe",
  "editors.list.moveUp": "Yukarı taşı",
  "editors.list.moveDown": "Aşağı taşı",
  "editors.list.delete": "Sil",
  "editors.list.unsupportedField": "{type} tipi list itemschema'sında desteklenmiyor.",

  "editors.richText.loading": "Editör yükleniyor…",
  "editors.richText.bold": "Kalın",
  "editors.richText.boldTitle": "Kalın (Ctrl+B)",
  "editors.richText.italic": "İtalik",
  "editors.richText.italicTitle": "İtalik (Ctrl+I)",
  "editors.richText.strike": "Üstü çizili",
  "editors.richText.code": "Inline kod",
  "editors.richText.heading2": "Başlık 2",
  "editors.richText.heading3": "Başlık 3",
  "editors.richText.bulletList": "Madde listesi",
  "editors.richText.orderedList": "Numaralı liste",
  "editors.richText.quote": "Alıntı",
  "editors.richText.link": "Link",
  "editors.richText.linkPrompt": "Link URL",
  "editors.richText.undo": "Geri al",
  "editors.richText.undoTitle": "Geri al (Ctrl+Z)",
  "editors.richText.redo": "İleri al",
  "editors.richText.redoTitle": "İleri al (Ctrl+Shift+Z)",

  "editors.date.label": "Tarih ve Saat",
  // Takvimdeki ay ve gün adları Intl'den geliyor, burada sadece çevresindeki
  // kontroller var.
  "editors.date.pick": "Tarih seçin",
  "editors.date.prevMonth": "Önceki ay",
  "editors.date.nextMonth": "Sonraki ay",
  "editors.date.prevYear": "Önceki yıl",
  "editors.date.nextYear": "Sonraki yıl",
  "editors.date.hour": "Saat",
  "editors.date.minute": "Dakika",
  "editors.date.today": "Bugün",
  "editors.date.clear": "Temizle",
  "editors.date.past": "Bu tarih geçmiş.",
  "editors.date.remaining": "{time} kaldı",
  "editors.date.days": "gün",
  "editors.date.hours": "saat",
  "editors.date.minutes": "dk",

  // Listeden seçme: sabit sözlükte de, başka bir koleksiyonun kayıtlarında da
  // aynı kutu kullanılıyor.
  "editors.combobox.choose": "Bir seçenek seçin",
  "editors.combobox.add": "Ekle",
  "editors.combobox.search": "Ara…",
  "editors.combobox.loading": "Aranıyor…",
  "editors.combobox.empty": "Eşleşen bir şey yok",
  "editors.combobox.clear": "Seçimi kaldır",
  "editors.combobox.clearAction": "Temizle",
  "editors.combobox.prevPage": "Önceki sayfa",
  "editors.combobox.nextPage": "Sonraki sayfa",
  "editors.combobox.noSource": "Bu alanın seçenek kaynağı yok. Sayfada bildirildi mi?",
  "editors.combobox.create": "\"{text}\" olarak ekle",
});
