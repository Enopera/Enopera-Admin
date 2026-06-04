export const ADM = {
  // surfaces
  bg: "#f6efe4",
  panel: "#fbf8f1",
  panelAlt: "#f3ecde",
  white: "#ffffff",
  // ink
  ink: "#2a1a1d",
  inkSoft: "#6b5a5c",
  inkMuted: "#a59a94",
  inkSubtle: "#c8b9b1",
  // lines
  line: "#e8dec9",
  lineSoft: "#efe6d3",
  // brand
  carmine: "#7a1a2c",
  carmineSoft: "#a93348",
  carmineWash: "#f1d9de",
  gold: "#c48a48",
  goldWash: "#f5e6d0",
  // status
  green: "#5a7a3a",
  greenWash: "#e2ebd2",
  red: "#a63a35",
  redWash: "#f1dad7",
  amber: "#b87a2a",
  amberWash: "#f6e6cb",
  // type
  serif: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
  sans: 'var(--font-dm-sans), "DM Sans", ui-sans-serif, system-ui, sans-serif',
  mono: 'var(--font-jetbrains), "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
} as const;

export type StatusKey = "attivo" | "sospeso" | "invitato" | "emessa" | "inviata" | "pagata" | "scaduta" | "effettuato" | "inConsegna" | "consegnato";
