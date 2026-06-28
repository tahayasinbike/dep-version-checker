# Changelog

## 0.1.0

İlk sürüm.

- npm, Python (pip/poetry), Rust (Cargo), PHP (Composer) projelerinde bağımlılık sürüm denetimi.
- major / minor / patch ayrımı; registry'nin `latest` etiketini esas alır, junk/önsürümleri gizler.
- Activity Bar yan paneli: checkbox + sürüm dropdown'u (tüm sürümler, düşük + deprecated etiketli) + toplu/tekil güncelleme + arama.
- Inline CodeLens: manifest satırında güncelle / sürüm seç / sabitle.
- Kurulu sürüm çözümü manifest aralığını dikkate alır; lock dosyası değişince otomatik yeniden tarama.
- Paket yöneticisi otomatik tespiti (npm/pnpm/yarn/bun) ve npm peer çakışma stratejisi ayarı.
- Sürüm sabitleme (pin); `.vscode/dep-version-checker.json` ile ekipçe paylaşılır.
- Toplu güncelleme öncesi peer-dependency çakışma kontrolü ve otomatik düzeltme önerisi.
