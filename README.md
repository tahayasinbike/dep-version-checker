<div align="center">

# 📦 Dependency Version Checker

### Hangi proje türü olursa olsun — bağımlılıklarını gör, anla, güvenle güncelle.

**npm · Python · Rust · PHP** projelerinde güncel sürümleri tek bakışta görün; `major / minor / patch` ayrımını anında yapın; tek tek ya da toplu güncelleyin — peer çakışmaları sizi şaşırtmadan.

![Open VSX Version](https://img.shields.io/open-vsx/v/tahayasinbike/dep-version-checker?color=2ea043&label=Open%20VSX&style=for-the-badge)
![Open VSX Downloads](https://img.shields.io/open-vsx/dt/tahayasinbike/dep-version-checker?color=8b7bd8&style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-4d8de0?style=for-the-badge)

</div>

---

## ✨ Neden bu eklenti?

Bağımlılıkları güncel tutmak sıkıcı ve risklidir: hangi paket eski? Bu güncelleme **kırıcı (major)** mı, güvenli **patch** mı? Toplu güncellesem peer bağımlılıkları patlar mı? Yanlışlıkla şu hassas paketi güncellersem?

**Dependency Version Checker** bunların hepsini tek panelde, akıllıca çözer:

- 🎯 **Doğru "en son sürüm"** — registry'nin resmî `latest` etiketini esas alır; `1000.0.0` gibi sahte/canary sürümleri ve alpha/beta'ları varsayılan olarak gizler.
- 🌈 **Renkli risk ayrımı** — her güncelleme `major` (kırmızı), `minor` (sarı), `patch` (mavi) olarak işaretlenir.
- ☑️ **Toplu veya tekil** — checkbox'la seç, dropdown'dan istediğin sürümü seç, tek tıkla güncelle.
- 🛡️ **Peer-dependency koruması** — toplu güncelleme öncesi uyumsuzlukları yakalar, otomatik düzeltme önerir.
- 📌 **Sürüm sabitleme** — hassas paketleri kilitle; ekipçe paylaş.

---

## 🌍 Desteklenen ekosistemler

| Ekosistem | Manifest | Kurulu sürüm kaynağı | Registry |
|:--|:--|:--|:--|
| **npm** | `package.json` | `node_modules` · `package-lock.json` | registry.npmjs.org |
| **Python** | `requirements.txt` · `pyproject.toml` | sabitlenmiş sürüm | pypi.org |
| **Rust** | `Cargo.toml` | `Cargo.lock` | crates.io |
| **PHP** | `composer.json` | `composer.lock` | repo.packagist.org |

> Tek bir çalışma alanında **birden çok proje ve dil** aynı anda taranır — her manifest kendi grubunda listelenir.

---

## 🖥️ İki arayüz, tek deneyim

### 1. Yan panel (Activity Bar)

Kendi ikonuna sahip zengin bir panel:

- Her bağımlılık tek satırda: **Paket · Mevcut · Hedef sürüm · Tür**
- Solda **checkbox**, sağda **sürüm dropdown'u** — beklemek, hover etmek yok.
- Üstte **arama**, **Tümünü seç** ve **Seçilenleri Güncelle** butonları.
- Renkli rozetler, hafif zebra satırlar, native tema uyumu (açık/koyu).

```
DEPENDENCIES                                    ⬆ ⟳
┌──────────────────────────────────────────────────┐
│ 🔍 Paket ara…                                      │
│ [ Seçilenleri Güncelle (3) ]   ☐ Tümünü seç        │
├──────────────────────────────────────────────────┤
│ PAKET            MEVCUT      HEDEF SÜRÜM      TÜR   │
│ ☑ react          19.1.0  →  [19.2.7    ▾]   minor  │
│ ☑ axios           1.4.0  →  [1.7.2     ▾]   minor  │
│ ☐ eslint          9.3.9  →  [10.6.0    ▾]   major  │
│ 📌 typescript      5.9.2  →  (sabit)               │
└──────────────────────────────────────────────────┘
```

### 2. Satır içi (CodeLens)

`package.json`, `Cargo.toml`, `requirements.txt`… açtığında her bağımlılık satırının üstünde:

```
  ↑ 19.2.7 (minor)   │   sürüm seç…   │   📌 sabitle
"react": "^19.1.0",
```

Tıkla, güncelle. Pinli paketlerde güncelleme linki yerine **"📌 sabit (kaldır)"** görünür.

---

## 🧠 Akıllı özellikler

### 🔽 Tüm sürümler, anlamlı etiketlerle
Dropdown sadece yükseltmeleri değil, **mevcuttan düşük sürümleri de** listeler — geri dönmen (downgrade) gerektiğinde. Her sürüm etiketli:

| Etiket | Anlamı |
|:--|:--|
| `19.2.7 (major/minor/patch)` | Yükseltme — risk seviyesiyle |
| `19.1.0 (mevcut)` | Şu an kurulu olan |
| `18.3.1 (düşük)` | Mevcuttan eski — geri dönüş |
| `17.0.0 (düşük, deprecated)` | Kullanımdan kaldırılmış — turuncu uyarı |

### 🛡️ Peer-dependency çakışma kontrolü
Toplu güncellemeden önce, seçtiğin hedef sürümlerin **peer gereksinimleri** registry'den çekilir ve projenin geri kalanıyla karşılaştırılır. Çakışma varsa uygulamadan önce uyarır:

> ⚠️ `@react-navigation/native-stack@7.17.6` → `@react-navigation/native "^7.3.4"` gerekiyor (mevcut `7.2.2`)
>
> **[ Otomatik düzelt & güncelle ]** çakışan paketi de uyumlu en düşük sürüme çeker — `ERESOLVE` hataları tarihe karışır.

### 📌 Sürüm sabitleme (pin) — ekipçe paylaşılır
Hassas bir paketi 📌 ile kilitle: **checkbox'ı kapanır, dropdown'u pasifleşir**, "Tümünü seç" ve toplu güncelleme onu **atlar**. Yanlışlıkla güncelleme imkânsız.

Pinler `.vscode/dep-version-checker.json` dosyasına **projeye-göre yollarla** yazılır — git'e commit et, **tüm ekip aynı pinleri görsün**. Bir takım arkadaşın `git pull` yaptığında panel otomatik güncellenir.

### 🔧 Paket yöneticisi otomatik tespiti
Güncelleme sonrası doğru komutu çalıştırır: lock dosyasına bakıp **npm / pnpm / yarn / bun** arasından seçer. Manifest'teki aralık öneki (`^`, `~`) korunur.

### ♻️ Otomatik yeniden tarama
Kurulum bitip lock dosyası (`pnpm-lock.yaml`, `package-lock.json`, `Cargo.lock`…) değiştiğinde panel **kendi kendine** yenilenir ve gerçek kurulu sürümle doğrular.

---

## 🚀 Hızlı başlangıç

1. Activity Bar'daki **Dependencies** ikonuna tıkla.
2. Çalışma alanın otomatik taranır; bağımlılıklar gruplar hâlinde listelenir.
3. Güncellemek istediklerini **işaretle**, dropdown'dan **hedef sürümü** seç.
4. **Seçilenleri Güncelle** → manifest güncellenir + paket yöneticisi entegre terminalde çalışır.

---

## ⚙️ Ayarlar

| Ayar | Varsayılan | Açıklama |
|:--|:--|:--|
| `depChecker.includePrerelease` | `false` | alpha/beta/rc sürümlerini de aday say |
| `depChecker.runInstallAfterUpdate` | `true` | Güncelleme sonrası kurulum komutunu terminalde çalıştır |
| `depChecker.npmPeerConflictStrategy` | `default` | `legacy-peer-deps` / `force` — npm peer çakışmalarında strateji |
| `depChecker.requestTimeoutMs` | `8000` | Registry istek zaman aşımı (ms) |

---

## 🔒 Gizlilik

Eklenti yalnızca **herkese açık paket registry'lerine** (npmjs, PyPI, crates.io, Packagist) sürüm bilgisi için istek atar. Kodun, kimlik bilgilerin veya başka hiçbir veri hiçbir yere gönderilmez.

---

## 💬 Geri bildirim

Öneri ve hataların için memnuniyetle — bağımlılıklarını güncel ve güvende tut! 🌱

<div align="center">

**MIT Lisansı** · Keyifli kodlamalar

</div>
