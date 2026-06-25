# WellSale — uživatelská příručka

Pokladní systém pro prodejny s regulovaným zbožím (PML / kratom dle vyhl. 147/2025 Sb.).
Tato příručka vás provede od prvního spuštění až po každodenní práci.

---

## 1. První spuštění a nastavení

Při prvním spuštění se otevře **průvodce nastavením**. Projdete těmito kroky (některé lze přeskočit):

1. **Licenční podmínky (EULA)** — odsouhlasení.
2. **Licenční klíč** — zadejte klíč ve tvaru `XXXX-XXXX-XXXX-XXX`, který jste obdrželi od dodavatele. Systém klíč ověří online.
3. **Pobočka** — název (např. „Brno – Hlavní") a kódové označení (např. `brno1`). Pokud licence už nějaké pobočky má, vyberete ze seznamu.
4. **Údaje o podniku** — název, adresa, IČO, DIČ a (volitelně) číslo povolení k nakládání s PML. IČO/DIČ/povolení jsou nepovinné, lze doplnit později.
5. **Logo na účtenku** (volitelné).
6. **Tiskárna účtenek** (volitelné) — výběr tiskárny.
7. **Elektronický podpis** (volitelné) — typ certifikátu a kde ho hledat.
8. **Město** (počasí), **Produkty**, **Sklad/pokladní pohyby**, **Oznámení (NTFY)**.
9. **Cloudové zálohy** — zda chcete data zálohovat na zabezpečené servery.
10. **Administrativní účet** — jméno + 5místný PIN. Tímto účtem se přihlašujete.
11. Volitelně další uživatelé, DPH a dokončení.

> Po dokončení se aplikace spustí a přihlásíte se PINem (pokud je PIN zapnutý). PIN píšete **rovnou** — první účet je předvybraný, takže nemusíte nejdřív klikat na uživatele. Při více účtech jdou ostatní vybrat dole.

---

## 2. Orientace v aplikaci

Nahoře je **lišta s kartami**: **Prodej · Věk 18+ · Sklad · Historie · Analýza · Uzávěrka**. Úplně vpravo je **ozubené kolo** (Nastavení) a stavové ikony (Wi-Fi, tiskárna, e-podpis) — kliknutím na ně otevřete **Přehled stavu (Health)**.

Vlevo nahoře je logo. Okno má vlastní horní lištu s minimalizací / maximalizací / zavřením.

---

## 3. Prodej (denní práce)

1. Klikněte na produkty — přidají se do košíku vpravo.
2. Množství upravíte tlačítky **+ / −**, položku odeberete křížkem.
3. Dole vidíte **mezisoučet, DPH a celkem**.
4. **Zaplatit** → vyberte **Hotově** nebo **QR**.
   - U hotovosti zadejte přijatou částku (nebo nechte prázdné) a stiskněte **Enter** — potvrdí prodej a ukáže částku k vrácení. Myš není potřeba.
5. Pokud je zboží věkově omezené, potvrďte ověření věku.
6. Po prodeji se (je-li zapnuto) automaticky vytiskne účtenka.

**Sleva na produkt:** v Nastavení → Produkty u produktu tlačítko „Sleva". Slevněná cena platí do zadaného data a v košíku se zobrazí přeškrtnutá původní cena.

---

## 4. Sklad

- **Příjem** — naskladnění. Zadáte množství, doklad a datum. **Šarži nezadáváte** — bere se ze šarže nastavené u produktu. Dodavatel se předvyplní z produktu (lze změnit).
- **Odběr** — ruční výdej (ztráta, vlastní spotřeba) s důvodem.
- Při prodeji se sklad odečítá automaticky.
- **Upozornění nízkého stavu** nastavíte u produktu v Nastavení.

### Inventura
V sekci **Sklad** → „Provést inventuru": zadáte skutečně napočítané množství u každého produktu, systém ukáže rozdíl. Volbou „Srovnat" se evidence dorovná. Inventura se uchová pro kontrolu a objeví se v seznamu pohybů. Doporučená je **čtvrtletně** (systém upozorní po termínu).

### Roční hlášení o činnosti s PML (Příloha č. 7)
V sekci Sklad → „Generovat hlášení (PDF)" + výběr roku. Podává se na MZd do konce února za předchozí rok.

---

## 5. Historie a Uzávěrka

- **Historie** — seznam transakcí. Lze **upravit** položku, **vytisknout** znovu, vygenerovat **fakturu (PDF)** a exportovat do Excelu.
- **Uzávěrka** — souhrn dne. Tlačítkem **Uzavřít dnešní den** vytvoříte uzávěrku (a nahraje se na cloud, pokud je zapnutý). Můžete exportovat **evidenční knihu PML (PDF)**.
- **Pokladní pohyby** (vklad/výdaj hotovosti) — pokud jsou zapnuté.

---

## 6. Analýza

KPI (tržba, transakce, kusy, největší nákup), srovnání s předchozím obdobím, nejaktivnější dny/hodiny, top produkty, týdenní průběh. Filtr: týden / měsíc / vše / vlastní rozsah. Export do Excelu.

**Zisk:** v Nastavení → „Sledování zisku" zapněte funkci a u produktů vyplňte **nákupní cenu**. Analýza pak ukáže **zisk** (obrat − nákupní ceny) vedle obratu.

---

## 7. Nastavení (přehled sekcí)

Nastavení otevřete **ozubeným kolem** vpravo nahoře. Sekce jsou seskupené (vlevo navigace):

- **Účet a vzhled:** Soukromí („Skrýt částky" — rozostří částky; vyberete oblasti), Vzhled (světlý/tmavý/systém), Uživatelé.
- **Prodejna:** Produkty (vč. nákupní ceny, šarže, dodavatele), Sledování zisku, Dodavatelé, DPH, Sklad.
- **Komunikace:** NTFY oznámení, Tiskárna, Provozovna (IČO/DIČ/povolení PML), Počasí.
- **Systém:** Aktualizace, Automatické uzamčení (PIN po nečinnosti), Kurz EUR/CZK, PML export XML, Audit log, Diagnostika.
- **Elektronický podpis** + **Cloudové zálohy** + **Zálohy** (lokální/cloud/Drive).
- Dole **Poděkování** (open-source knihovny) a **Přehled stavu (Health)**.

> Sekce, na které nemá přihlášený uživatel oprávnění, se nezobrazí.

### Uživatelé a oprávnění
Admin může vytvářet uživatele s vlastním PINem a sadou oprávnění (tlačítka **Prodavač** / **Administrace** nastaví výchozí sady). Každé oprávnění lze zapnout/vypnout zvlášť.

### Skrýt částky
Tlačítko „Skrýt částky" rozostří peněžní hodnoty (vhodné při sdílení obrazovky). Hodnoty se nemažou — po vypnutí jsou hned čitelné. Checkboxy určují oblasti (Analýza / Historie / Uzávěrky) a jsou aktivní, **jen když je „Skrýt částky" zapnuté**.

### Automatické uzamčení
Po zadaném počtu minut nečinnosti aplikace znovu vyžádá PIN (jen když je PIN zapnutý).

---

## 8. Zálohy a obnova

### Vytvoření zálohy
- **Zálohovat DB** — uloží šifrovaný soubor `.wsbak` (kamkoli zvolíte).
- **Cloud** (je-li zapnutý) — uzávěrky a zálohy se nahrávají automaticky; seznam je v Nastavení → Zálohy.
- **Google Drive** (volitelné).

> Zálohy `.wsbak` jsou šifrované vaším licenčním klíčem.

### Obnova ze zálohy — dvě možnosti
Při obnově (z cloudu nebo přetažením souboru do okna) se otevře náhled obsahu a máte na výběr:

1. **Přepsat ze zálohy** — nahradí aktuální data obsahem zálohy. *(Aplikace se restartuje.)*
2. **Sloučit (přidat)** — **nic se nemaže**. Data ze zálohy se **přidají** k vašim. U položek, které se překrývají (nastavení, produkty, dodavatelé, uživatelé, uzávěrky), si vyberete, co nechat — **svoje**, nebo **ze zálohy**. Historie (transakce, pohyby skladu…) se přidá bez duplicit.

> Při obnově z **jiné licence** se identita (licence, pobočka) automaticky ponechá vaše — nedojde k odhlášení ani neshodě.

### Přidání uzávěrky ze zálohy
Přetáhněte soubor uzávěrky (`.wsbak`/`.db`) do okna → „Přidat do uzávěrek". Pokud z toho data uzávěrku ještě nemáte, přidá se do seznamu (netiskne se, neposílá oznámení). Spolu s uzávěrkou se přidají i **prodeje a skladové pohyby toho dne**, takže k ní funguje i **evidenční kniha PML**.

---

## 9. Co dělat v různých situacích

| Situace | Co udělat |
|---|---|
| Zapomenutý PIN | Jiný admin ho změní v Nastavení → Uživatelé. |
| „Aplikace uzamčena" | Zkontrolujte internet, klikněte „Zkontrolovat stav znovu". Při problému kontaktujte podporu (na obrazovce je ID počítače). |
| „Licence svázána s jiným počítačem" | Data nelze přenést jen zkopírováním složky. Pro převod na nové PC kontaktujte podporu. |
| Tiskárna netiskne | Otevřete Přehled stavu (Health) — stav tiskárny. Zkontrolujte připojení a v Nastavení → Tiskárna proveďte testovací tisk. |
| Chci skrýt tržby při sdílení obrazovky | Nastavení → Soukromí → „Skrýt částky". |
| Potřebuju poslat log podpoře | Nastavení → Diagnostika → „Stáhnout log". |
| Červené upozornění „omezený režim" | Nastala chyba databáze. Aplikace běží dál; kontaktujte podporu a pošlete log. |
| Přechod na nový počítač | Vytvořte zálohu, kontaktujte podporu kvůli převodu licence, na novém PC obnovte ze zálohy. |

---

## 10. Bezpečnostní doporučení

- **Pravidelně zálohujte** (ideálně zapněte cloud zálohy) — záloha `.wsbak` je jediná spolehlivá cesta k obnově dat.
- **Nemažte pobočku ani licenci** bez předchozí zálohy.
- Pro elektronický podpis používejte **kvalifikovaný (QES)** certifikát.
- Zapněte **PIN** a **automatické uzamčení** na pokladně přístupné více lidem.
- Uchovávejte evidenci a zálohy **5 let** (PML požadavek).

---

*V případě dotazů kontaktujte dodavatele aplikace.*
