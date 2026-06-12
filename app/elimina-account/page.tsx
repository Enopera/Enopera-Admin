// Pagina pubblica: richiesta di eliminazione account e dati dell'app Enopera.
// Route pubblica (fuori dal gruppo (admin), non passa per requireAdmin).
// L'URL di questa pagina va indicato nel form Data Safety del Play Store
// (sezione "Eliminazione dell'account"): https://admin.enopera.com/elimina-account

import type { Metadata } from "next";
import { ADM } from "@/lib/admin/tokens";

export const metadata: Metadata = {
	title: "Eliminazione account · Enopera",
	description:
		"Come richiedere la cancellazione del tuo account Enopera e dei dati associati.",
};

function H2({ children }: { children: React.ReactNode }) {
	return (
		<h2
			style={{
				fontFamily: ADM.serif,
				fontSize: 22,
				fontWeight: 600,
				color: ADM.ink,
				margin: "28px 0 8px",
			}}
		>
			{children}
		</h2>
	);
}

function P({ children }: { children: React.ReactNode }) {
	return (
		<p style={{ margin: "0 0 10px", lineHeight: 1.6, color: ADM.inkSoft }}>
			{children}
		</p>
	);
}

export default function EliminaAccountPage() {
	return (
		<div
			style={{
				minHeight: "100vh",
				background: ADM.bg,
				padding: "48px 20px",
				fontFamily: ADM.sans,
				color: ADM.ink,
			}}
		>
			<main
				style={{
					maxWidth: 760,
					margin: "0 auto",
					background: ADM.panel,
					border: `1px solid ${ADM.line}`,
					borderRadius: 16,
					padding: "40px 36px",
				}}
			>
				<div
					style={{
						fontFamily: ADM.sans,
						fontSize: 11,
						letterSpacing: 2,
						textTransform: "uppercase",
						color: ADM.inkMuted,
					}}
				>
					Enopera
				</div>
				<h1
					style={{
						fontFamily: ADM.serif,
						fontSize: 34,
						fontWeight: 600,
						color: ADM.ink,
						margin: "6px 0 4px",
						lineHeight: 1.1,
					}}
				>
					Eliminazione dell&apos;account
				</h1>
				<P>Ultimo aggiornamento: 12/06/2026</P>

				<P>
					&quot;Enopera&quot; è un&apos;applicazione B2B riservata ai partner
					Enopera (ristoranti, bar, enoteche). Questa pagina spiega come
					richiedere la cancellazione del tuo account e dei dati associati.
				</P>

				<H2>Come richiedere la cancellazione</H2>
				<P>
					Invia una richiesta via email a{" "}
					<a href="mailto:info@enopera.com?subject=Cancellazione%20account%20Enopera" style={{ color: ADM.carmine }}>
						info@enopera.com
					</a>{" "}
					con oggetto &quot;Cancellazione account&quot;, scrivendo
					<strong> dall&apos;indirizzo email collegato all&apos;account</strong> e
					indicando il nome del locale. In alternativa puoi farne richiesta
					direttamente all&apos;amministrazione Enopera. Verificata la titolarità
					dell&apos;account, procederemo con la cancellazione.
				</P>

				<H2>Quali dati vengono eliminati</H2>
				<ul
					style={{
						margin: "0 0 10px",
						paddingLeft: 20,
						lineHeight: 1.6,
						color: ADM.inkSoft,
					}}
				>
					<li>
						<strong>Account e credenziali di accesso</strong> (indirizzo email di
						login).
					</li>
					<li>
						<strong>Dati anagrafici e del locale</strong>: nome del referente,
						nome del locale, indirizzo, città, P.IVA, telefono.
					</li>
					<li>
						<strong>Cantina</strong>: giacenze e inventario collegati al tuo
						profilo.
					</li>
					<li>
						<strong>Storico ordini</strong> collegato all&apos;account, salvo
						quanto indicato al punto successivo.
					</li>
				</ul>

				<H2>Quali dati possono essere conservati e perché</H2>
				<P>
					Alcuni dati relativi agli ordini già evasi (es. documenti
					d&apos;ordine e di fatturazione) possono essere conservati per il
					periodo previsto dagli obblighi di legge, in particolare fiscali e
					contabili. Al termine di tale periodo vengono eliminati o resi anonimi.
				</P>

				<H2>Tempistiche</H2>
				<P>
					Le richieste verificate vengono evase entro 30 giorni. Riceverai una
					conferma all&apos;indirizzo email da cui hai inviato la richiesta.
				</P>

				<H2>Contatti e privacy</H2>
				<P>
					Titolare del trattamento: Fausto Battaglia, Via del Tintoretto 18,
					37010 Affi (VR), P.IVA 02612400818. Email{" "}
					<a href="mailto:info@enopera.com" style={{ color: ADM.carmine }}>
						info@enopera.com
					</a>
					, tel. +39 376 1255071. Per maggiori dettagli sul trattamento dei dati
					consulta l&apos;
					<a href="/privacy" style={{ color: ADM.carmine }}>
						Informativa sulla privacy
					</a>
					.
				</P>
			</main>
		</div>
	);
}
