# Dependency Version Checker

Seçtiğin projedeki kurulu kütüphanelerin sürümlerini tek tek denetler; daha güncel sürüm olup olmadığını ve geçişin **major / minor / patch** olduğunu gösterir. Tek tek ya da toplu güncelleyebilir, geçilebilecek tüm sürümleri listeler.

## Desteklenen proje türleri

| Tür | Manifest | Kurulu sürüm | Registry |
|-----|----------|--------------|----------|
| npm | `package.json` | `node_modules` / `package-lock.json` | registry.npmjs.org |
| Python | `requirements.txt`, `pyproject.toml` | sabitlenmiş sürüm | pypi.org |
| Rust | `Cargo.toml` | `Cargo.lock` | crates.io |
| PHP | `composer.json` | `composer.lock` | repo.packagist.org |

## İki arayüz

1. **Yan panel** — Activity Bar'daki "Dependencies" ikonu. Her manifest bir grup, altında bağımlılıklar renkli rozetle (kırmızı=major, sarı=minor, mavi=patch, yeşil=güncel). Satır üstüne gelince **güncelle** ve **sürüm seç** butonları; başlıkta **Tümünü Güncelle** ve **Yenile**.
2. **Inline (CodeLens)** — manifest dosyasını açtığında her bağımlılık satırının üstünde tıklanabilir `↑ 19.1.0 (major)` ve `sürüm seç…` etiketleri.

## Çalıştırma (geliştirme)

```bash
npm install
npm run compile      # ya da: npm run watch
```

Ardından VS Code'da bu klasörü açıp **F5** ile "Run Extension" başlat. Açılan Extension Development Host penceresinde herhangi bir projeyi aç.

### .vsix paketleme

```bash
npx @vscode/vsce package
```

oluşan `.vsix` dosyasını `code --install-extension dep-version-checker-0.1.0.vsix` ile kurabilirsin.

## Ayarlar

- `depChecker.includePrerelease` — alpha/beta/rc sürümlerini de aday say (varsayılan kapalı).
- `depChecker.runInstallAfterUpdate` — güncelleme sonrası paket yöneticisi kurulum komutunu terminalde çalıştır (varsayılan açık).
- `depChecker.requestTimeoutMs` — registry istek zaman aşımı (varsayılan 8000 ms).

## Nasıl çalışır

Güncelleme yapıldığında manifest dosyasındaki sürüm yazısı (aralık öneki — `^`, `~` — korunarak) güncellenir, ardından ayar açıksa ilgili paket yöneticisi komutu (`npm install`, `pip install -U -r ...`, `cargo update`, `composer update`) entegre terminalde çalıştırılır.
