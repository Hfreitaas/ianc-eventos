/**
 * IANC Eventos v2 — configuração central.
 * Edite este arquivo para atualizar evento, Pix e links de pagamento.
 * A chave Supabase abaixo é a chave pública (publishable/anon) usada no navegador.
 */
window.IANC_CONFIG = Object.freeze({
  supabaseUrl: "https://vgeafuabzgznaygusiqe.supabase.co",
  supabaseKey: "sb_publishable_ugRokC7oGHhgNQk_BAZ3LQ_V5ctj1n-",
  event: {
    id: null,
    name: "Encontro de Mulheres",
    description: "",
    dateISO: "2026-11-28",
    time: "17:30",
    date: "28 de Novembro às 17h30",
    address: "Av. Padre Arlindo Vieira, 3389 - Pq Bristol - São Paulo - SP",
    ticketPrice: 100,
    pixKey: "(11) 94559-3558",
    organizerWhatsApp: "5511945593558",
    verse: "Mulher virtuosa, quem a achará? O seu valor muito excede ao de rubis.",
    verseReference: "Provérbios 31:10",
    limit: 300
  },
  paymentLinks: {
    1: "https://mpago.la/2rkMWD9",
    2: "https://mpago.la/1YQAzDE",
    3: "https://mpago.la/1FAJFFA",
    4: "https://mpago.la/1pwtBSY"
  }
});
