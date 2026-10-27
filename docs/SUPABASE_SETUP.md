# Sdílená knihovna přes Supabase – návod krok za krokem

Bez tohoto nastavení Promítač plně funguje v **lokálním režimu** (vše je jen na jednom počítači).
Supabase je potřeba jen tehdy, když chcete, aby více počítačů / promítačů sboru sdílelo stejné písně,
plány, motivy a média. Free tarif Supabase stačí (500 MB databáze, 1 GB souborů, max. 50 MB na soubor).

Nastavení zabere asi 15 minut a udělá ho jeden člověk (správce). Ostatní pak jen zadají kód pozvánky.

## 1. Založit projekt

1. Jděte na <https://supabase.com> → **Start your project** → zaregistrujte se (e-mail nebo GitHub).
2. **New project**:
   - *Name*: např. `promitac-sbor`
   - *Database Password*: vygenerujte a **uložte si ho** (do správce hesel).
   - *Region*: **Central EU (Frankfurt)** – nejblíž k nám.
   - *Plan*: Free.
3. Klikněte **Create new project** a počkejte asi 2 minuty, než se projekt připraví.

## 2. Vytvořit tabulky (migrace)

1. V levém menu projektu otevřete **SQL Editor** → **New query**.
2. Otevřete soubor [`supabase/migrations/20261027000001_init.sql`](../supabase/migrations/20261027000001_init.sql)
   z tohoto repozitáře (na GitHubu tlačítko **Raw**), vše zkopírujte (Ctrl/Cmd+A, Ctrl/Cmd+C)
   a vložte do SQL editoru.
3. Klikněte **Run**. Dole se má objevit **Success. No rows returned**.
   Skript lze bezpečně spustit i opakovaně (např. po aktualizaci).

Co skript vytvoří: tabulky sborů, členů, písní, plánů, motivů a médií, pravidla zabezpečení (RLS – každý vidí
jen data svého sboru), funkce pro pozvánky a úložiště souborů `media`.

## 3. Zapnout přihlašování e-mailem

1. **Authentication → Sign In / Providers → Email**: musí být zapnuté (výchozí stav).
2. **Confirm email** (potvrzení e-mailem):
   - *Doporučeno pro malý tým*: **vypnout**. Účet pak funguje hned po registraci.
   - Když ho necháte zapnuté, každému po registraci přijde e-mail s odkazem. Po kliknutí se může otevřít
     stránka, která nejde načíst (adresa `localhost`) – to nevadí, účet je potvrzený. Pak se v aplikaci přihlaste.
3. Doporučení: **Authentication → Policies / Password** nastavte minimální délku hesla aspoň 8 znaků.

## 4. Zjistit adresu a klíč

1. **Project Settings → API** (případně **Data API** / **API Keys**).
2. Zkopírujte:
   - **Project URL** – vypadá jako `https://abcdefgh.supabase.co`,
   - **anon public** klíč (u novějších projektů **Publishable key**, začíná `sb_publishable_`).
3. ⚠️ **Nikdy** nepoužívejte klíč `service_role` / **Secret key** – ten do aplikace nepatří.
   Anon/publishable klíč je veřejný a bezpečný, data chrání pravidla RLS.

## 5. Připojit aplikaci (první – správce)

1. V Promítači: **Nastavení → Účet a synchronizace**.
2. Vložte **Supabase URL** a **Anon (public) klíč** → **Připojit Supabase**.
3. **Vytvořit účet** (e-mail + heslo) → přihlaste se.
4. **Založit sbor** – napište název sboru. Stanete se správcem.
5. Zobrazí se **kód pozvánky** (např. `K7QM-3XRP`). Pošlete ho ostatním.
6. Knihovna z tohoto počítače se nahraje do sdílené knihovny. Stav ukazuje ikona mráčku v horní liště
   (Synchronizováno / Offline / Chyba).

## 6. Připojit další počítače a lidi

Každý člověk má vlastní účet:

1. Nainstalujte Promítač ([INSTALL.md](INSTALL.md)).
2. **Nastavení → Účet a synchronizace** → stejná URL a klíč → **Připojit Supabase**.
3. **Vytvořit účet** → přihlásit → **Připojit se ke sboru** → zadat kód pozvánky.
4. Za chvíli se stáhnou písně, plány, motivy a média sboru.

Správce může ve stejné obrazovce měnit role (Správce / Člen), odebírat členy a vygenerovat nový kód
(starý tím přestane platit).

## 7. Aby se projekt neuspal (GitHub keepalive)

Free projekt Supabase se po týdnu bez aktivity uspí. Repozitář obsahuje workflow **Supabase keepalive**,
který databázi jednou denně „probudí". Stačí mu dát adresu a klíč:

1. Na GitHubu v repozitáři: **Settings → Secrets and variables → Actions → New repository secret**.
2. Vytvořte dva secrets:
   - `SUPABASE_URL` = Project URL,
   - `SUPABASE_ANON_KEY` = anon/publishable klíč.
3. Ověření: **Actions → Supabase keepalive → Run workflow**. Běh má skončit zeleně
   (v logu `HTTP 200`). Bez secrets workflow nic nedělá a skončí úspěšně.

Když se projekt přesto uspí: v Supabase dashboardu klikněte **Restore project**.

## 8. (Volitelné) Zapéct připojení do buildu

Aby lidé nemuseli opisovat URL a klíč, lze je vložit přímo do buildu aplikace:

1. **Settings → Secrets and variables → Actions** → secrets `PROMITAC_SUPABASE_URL` a
   `PROMITAC_SUPABASE_ANON_KEY` (stejné hodnoty jako výše).
2. Spusťte **Actions → Build desktop apps → Run workflow**.
3. V nové verzi aplikace se v Nastavení rovnou zobrazí přihlášení.

## Jak synchronizace funguje (pro zvědavé)

- Pracuje se vždy s lokálními daty, synchronizace běží na pozadí (každou minutu a pár sekund po změně).
  **Promítání nikdy nečeká na internet.**
- Bez připojení se změny ukládají lokálně a odešlou se, jakmile je síť zpět.
- Když dva lidé upraví stejnou píseň zároveň, platí novější verze a ta druhá se uloží jako kopie
  „… (konflikt – verze z počítače X)" – nic se neztratí.
- Média větší než 50 MB (limit free tarifu) zůstávají jen na počítači, kde byla přidána
  (označení „Jen na tomto počítači").

## Řešení problémů

| Hláška | Co dělat |
|---|---|
| „Offline" | Zkontrolujte internet. Data se dosynchronizují sama. |
| „Přihlášení vypršelo – přihlaste se znovu." | Nastavení → Účet → přihlásit. |
| „Nesprávný e-mail nebo heslo." | Překontrolujte údaje; heslo lze obnovit v Supabase (Authentication → Users). |
| „Nemáte přístup ke knihovně sboru…" | Nejste členem sboru – připojte se kódem nebo požádejte správce. |
| Chyba hned po připojení | Spustili jste migraci (krok 2)? Je URL ve tvaru `https://….supabase.co`? |
