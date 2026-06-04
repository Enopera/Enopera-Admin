// Pagina pubblica: Informativa sulla privacy dell'app Enopera (Play Store).
// Route pubblica (fuori dal gruppo (admin), non passa per requireAdmin).
//
// TODO prima del go-live: completare i campi tra parentesi quadre
//   [ragione sociale], [indirizzo legale], [P.IVA], [email privacy], [data].
// Sono evidenziati in pagina per essere trovati e sostituiti facilmente.

import type { Metadata } from "next";
import { ADM } from "@/lib/admin/tokens";

export const metadata: Metadata = {
  title: "Informativa privacy · Enopera",
  description: "Informativa sulla privacy dell'app Enopera per i partner.",
};

// Segnaposto evidenziato: sostituire prima della pubblicazione.
function Todo({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: ADM.amberWash, color: ADM.ink, padding: "0 4px", borderRadius: 3 }}>
      {children}
    </span>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: ADM.serif, fontSize: 22, fontWeight: 600, color: ADM.ink, margin: "28px 0 8px" }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 10px", lineHeight: 1.6, color: ADM.inkSoft }}>{children}</p>;
}

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: ADM.bg, padding: "48px 20px", fontFamily: ADM.sans, color: ADM.ink }}>
      <main style={{ maxWidth: 760, margin: "0 auto", background: ADM.panel, border: `1px solid ${ADM.line}`, borderRadius: 16, padding: "40px 36px" }}>
        <div style={{ fontFamily: ADM.sans, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: ADM.inkMuted }}>
          Enopera
        </div>
        <h1 style={{ fontFamily: ADM.serif, fontSize: 34, fontWeight: 600, color: ADM.ink, margin: "6px 0 4px", lineHeight: 1.1 }}>
          Informativa sulla privacy
        </h1>
        <P>Ultimo aggiornamento: 01/06/2026</P>

        <H2>1. Titolare del trattamento</H2>
        <P>
          <Todo>[ragione sociale]</Todo>, con sede in Via del Tintoretto 18, 37010 Affi (VR),
          P.IVA 02612400818. Contatti: info@enopera.com, tel. +39 376 1255071.
        </P>

        <H2>2. Cosa è l&apos;app</H2>
        <P>
          &quot;Enopera&quot; è un&apos;applicazione B2B riservata ai partner Enopera (ristoranti, bar,
          enoteche). Consente di consultare la propria cantina, sfogliare il catalogo vini e
          inviare ordini. L&apos;accesso richiede credenziali fornite da Enopera.
        </P>

        <H2>3. Dati che raccogliamo</H2>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.6, color: ADM.inkSoft }}>
          <li><strong>Dati di account</strong>: indirizzo email (autenticazione e accesso).</li>
          <li><strong>Dati anagrafici e del locale</strong>: nome e cognome del referente, nome del locale, indirizzo, città, P.IVA, telefono.</li>
          <li><strong>Attività nell&apos;app</strong>: ordini effettuati e relativo storico.</li>
          <li><strong>Dati tecnici minimi</strong>: token di sessione conservati localmente sul dispositivo.</li>
        </ul>
        <P>
          Non raccogliamo posizione geografica del dispositivo, contatti, foto né dati sanitari.
          L&apos;app richiede solo il permesso INTERNET.
        </P>

        <H2>4. Finalità e basi giuridiche (GDPR)</H2>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.6, color: ADM.inkSoft }}>
          <li>Fornire il servizio (cantina, catalogo, ordini): esecuzione del contratto.</li>
          <li>Autenticazione e sicurezza dell&apos;accesso: legittimo interesse / contratto.</li>
          <li>Evasione degli ordini tramite il gestionale: esecuzione del contratto.</li>
          <li>Invio di richieste di partnership (modulo &quot;Unisciti a Enopera&quot;): richiesta dell&apos;interessato.</li>
        </ul>

        <H2>5. Fornitori e destinatari</H2>
        <P>
          I dati sono trattati tramite fornitori che agiscono come responsabili: Supabase
          (database e autenticazione), StartyERP (gestionale ordini), Resend (email transazionali).
          Non vendiamo i dati personali a terzi.
        </P>

        <H2>6. Trasferimenti e conservazione</H2>
        <P>
          I dati possono essere trattati sui server dei fornitori indicati. Conserviamo i dati per
          il tempo necessario alla fornitura del servizio e agli obblighi di legge (es. fiscali per
          gli ordini).
        </P>

        <H2>7. Sicurezza</H2>
        <P>
          Tutte le comunicazioni con i nostri server avvengono cifrate in transito (HTTPS/TLS).
          L&apos;accesso è protetto da credenziali individuali.
        </P>

        <H2>8. Diritti dell&apos;utente</H2>
        <P>
          Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità
          dei dati. Per esercitarli scrivi a info@enopera.com.
        </P>

        <H2>9. Cancellazione dell&apos;account e dei dati</H2>
        <P>
          Per richiedere la cancellazione dell&apos;account e dei dati associati, contatta{" "}
          info@enopera.com. In alternativa, la richiesta può essere inoltrata
          all&apos;amministrazione Enopera.
        </P>

        <H2>10. Modifiche</H2>
        <P>
          Eventuali aggiornamenti saranno pubblicati a questo indirizzo con data di revisione
          aggiornata.
        </P>
      </main>
    </div>
  );
}
