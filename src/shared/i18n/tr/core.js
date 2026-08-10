/**
 * @file Turkish wording for the page-side region and list chrome.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const core = Object.freeze({
  "core.chip.open": "Panelde aç",
  "core.chip.openBlock": "{path} bloğunu panelde aç",
  "core.chip.openList": "{path} listesini panelde aç",

  "core.text.placeholder": "Metin ekle…",

  "core.item.moveUp": "Yukarı taşı",
  "core.item.moveDown": "Aşağı taşı",
  "core.item.remove": "Sil",
  "core.item.add": "Öğe ekle",
  "core.item.addLabel": "Yeni öğe ekle",

  "core.group.hidden": "Gizli",

  "core.session.expired": "Oturumun sona erdi. Düzenlemeye devam etmek için tekrar giriş yap.",
  "core.session.signIn": "Giriş yap",
});
