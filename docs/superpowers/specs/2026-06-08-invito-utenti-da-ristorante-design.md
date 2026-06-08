# Invito utenti da Ristorante + email custom - Design

Stato: approvato (design). Data: 2026-06-08.

## Problema

Oggi la creazione utente nel pannello admin (`lib/users/actions.ts` -> `inviteUser`) richiede di digitare a mano nome, indirizzo, P.IVA, starty_bp_id, citta, ecc., e manda l'email di invito di default di Supabase: generica ("You have been invited"), senza dettagli account, con link che porta alla pagina admin (URL vecchio). Inutile per i ristoratori che devono installare e usare l'app.

## Obiettivi

1. Creare l'utente **collegandolo a un Ristorante esistente** (`restaurants`), ereditandone nome/indirizzo/P.IVA/starty_bp_id/citta/provincia/telefono/anno.
2. Inviare un'**email custom brandizzata** con: dettagli account, link per impostare la password, link al test interno dell'app.

## Non obiettivi

- Nessuna modifica all'app Flutter (continua a leggere i campi denormalizzati dal profilo).
- Nessuna gestione massiva/bulk invite (un ristorante alla volta).

## Decisioni prese

- Accesso utente: **link "imposta password"** (no password in chiaro).
- Invio email: **Approccio A** = server action del pannello admin + Resend con chiave nelle env Vercel (server-side, non nel binario app).

## Design

### Dati
- `profiles.restaurant_id` (gia esistente) usato come collegamento al ristorante.
- I campi denormalizzati nel profilo (restaurant_name, address, vat, starty_bp_id, member_since_year, city, district, phone) vengono valorizzati dai dati del ristorante alla creazione (snapshot), cosi l'app pubblicata funziona senza modifiche.
- Il trigger `handle_new_user()` popola il profilo dai metadata ma NON copia `restaurant_id`: la server action lo imposta esplicitamente con un update dopo la creazione (nessuna migrazione del trigger).

### UI - Form "Nuovo utente"
- Selettore **Ristorante** ricercabile (lista da `restaurants`, per nome).
- Alla selezione: email account precompilata da `restaurants.email` (modificabile, obbligatoria); riepilogo in sola lettura dei dati che verranno collegati.
- Pulsante "Invita".

### Server action (sostituisce `inviteUser`)
Input: `restaurantId`, `email` (override consentito).
1. Carica il ristorante (admin client, service role).
2. `supabase.auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name, phone, role:'user', status:'invitato', restaurant_name, address, vat, starty_bp_id, member_since_year, city, district }, redirectTo: `${SITE_URL}/auth/set-password` } })` -> ottiene `properties.action_link` (NON invia email Supabase).
3. `update profiles set restaurant_id = restaurantId where id = <nuovo user id>`.
4. Invia email via Resend (vedi sotto) con action_link + testing link.
5. `revalidatePath('/utenti')`.

### Email (Resend, brandizzata)
Stile Vendemmia (come template reset password). Contenuti:
- Wordmark Enopera + "Benvenuto".
- Dettagli account: nome ristorante, email di accesso.
- CTA primaria "Imposta la tua password" -> action_link.
- Sezione "Scarica l'app Enopera" -> pulsante al test interno: `https://play.google.com/apps/internaltest/4701671619788335871`.
- Footer Enopera.
- Mittente: `RESEND_FROM` = `Enopera <noreply@enopera.com>`.

### Pagina `/auth/set-password`
Nuova pagina pubblica con copy di benvenuto che riusa la logica della pagina di reset (token implicit nel fragment -> `setSession` -> `updateUser({password})`). Coperta dall'allowlist Supabase `admin.enopera.com/**`.

### Configurazione / env
- Vercel: aggiungere `RESEND_API_KEY`, `RESEND_FROM`. Verificare `NEXT_PUBLIC_SITE_URL=https://admin.enopera.com`.
- Costante testing link in un solo punto (riusabile).

## Gestione errori
- Ristorante senza email: l'admin deve inserire un'email manuale (campo obbligatorio).
- Email gia esistente (utente gia creato): `generateLink` fallisce -> messaggio chiaro.
- Errore Resend: l'utente e' stato creato ma l'email non e' partita -> messaggio che consente il re-invio (azione "re-invia invito").
- `action_link` mancante: errore esplicito, non inviare email a vuoto.

## Verifica
- Creare un utente di test collegato a un ristorante: profilo creato con restaurant_id + campi corretti.
- Email ricevuta con dettagli, link imposta-password funzionante (atterra su /auth/set-password e salva la password), link testing funzionante.
- Login nell'app con la password impostata: l'header cantina mostra i dati del ristorante.
