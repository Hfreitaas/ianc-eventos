const CONFIG = window.IANC_CONFIG;
  if (!CONFIG) throw new Error("Configuração do IANC Eventos não carregada.");

  const db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  let EVENT = { ...CONFIG.event };

  let currentPixPayload = "";
  let currentReservation = null;
  let paymentTimerInterval = null;
  let adminReservations = [];
  const PAYMENT_LINKS = { ...CONFIG.paymentLinks };

  const currency = value =>
    Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[char]);

  const normalizePhone = phone => {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.startsWith("55") ? digits : "55" + digits;
  };

  function selectedPaymentMethod() {
    return document.querySelector('input[name="paymentMethod"]:checked')?.value || "Pix";
  }

  function paymentMethodFromReservation(item) {
    const note = String(item?.observacao || "");
    return note.includes("[Pagamento: Cartão de crédito]") ? "Cartão" : "Pix";
  }

  function updatePaymentUI() {
    const method = selectedPaymentMethod();
    const isCard = method === "Cartão de crédito";
    document.getElementById("paymentOptionPix").classList.toggle("selected", !isCard);
    document.getElementById("paymentOptionCard").classList.toggle("selected", isCard);
    document.getElementById("pixPaymentContent").style.display = isCard ? "none" : "grid";
    document.getElementById("cardPaymentContent").style.display = isCard ? "block" : "none";
    const button = document.querySelector("#reservationForm .submit-btn");
    if (button && !button.disabled) {
      const quantity = Number(document.getElementById("quantity").value || 1);
      button.textContent = isCard ? `PAGAR ${currency(quantity * EVENT.ticketPrice)} COM CARTÃO 🔒` : "CONTINUAR PARA PAGAMENTO PIX 🔒";
    }
  }

  function updateSummary() {
    const quantity = Number(document.getElementById("quantity").value);
    const total = quantity * EVENT.ticketPrice;
    document.getElementById("totalText").textContent = currency(total);
    document.getElementById("summaryQuantity").textContent =
      quantity + (quantity === 1 ? " convite" : " convites");
    document.getElementById("summaryTotal").textContent = currency(total);
    updatePaymentUI();
  }

  function copyPixKey() {
    navigator.clipboard.writeText(EVENT.pixKey)
      .then(() => alert("Chave Pix copiada!"))
      .catch(() => prompt("Copie a chave Pix:", EVENT.pixKey));
  }

  function copyPixCode() {
    if (!currentPixPayload) return;
    navigator.clipboard.writeText(currentPixPayload)
      .then(() => alert("Código Pix copia e cola copiado!"))
      .catch(() => prompt("Copie o código Pix:", currentPixPayload));
  }

  function startPaymentTimer() {
    clearInterval(paymentTimerInterval);
    let remaining = 10 * 60;
    const box = document.getElementById("paymentTimer");
    const text = document.getElementById("timerText");
    box.style.display = "block";
    box.classList.remove("expired");

    const draw = () => {
      const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
      const seconds = String(remaining % 60).padStart(2, "0");
      text.textContent = `${minutes}:${seconds}`;

      if (remaining <= 0) {
        clearInterval(paymentTimerInterval);
        box.classList.add("expired");
        return;
      }
      remaining--;
    };

    draw();
    paymentTimerInterval = setInterval(draw, 1000);
  }

  function emvField(id, value) {
    return id + String(value.length).padStart(2, "0") + value;
  }

  function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  function normalizePixPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("55") ? "+" + digits : "+55" + digits;
  }

  function pixPayload(amount) {
    const gui = emvField("00", "BR.GOV.BCB.PIX");
    const key = emvField("01", normalizePixPhone(EVENT.pixKey));
    const merchantAccount = emvField("26", gui + key);
    const name = EVENT.name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .toUpperCase().slice(0, 25) || "EVENTO";
    const city = "SAO PAULO";
    const additional = emvField("62", emvField("05", "***"));

    const base =
      emvField("00", "01") +
      merchantAccount +
      emvField("52", "0000") +
      emvField("53", "986") +
      emvField("54", Number(amount).toFixed(2)) +
      emvField("58", "BR") +
      emvField("59", name) +
      emvField("60", city) +
      additional +
      "6304";

    return base + crc16(base);
  }

  async function showPix(quantity) {
    const amount = quantity * EVENT.ticketPrice;
    currentPixPayload = pixPayload(amount);

    const qrContainer = document.getElementById("qrGenerated");
    qrContainer.innerHTML = "";

    try {
      new QRCode(qrContainer, {
        text: currentPixPayload,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });

      const generatedImage = qrContainer.querySelector("img");
      if (generatedImage) {
        generatedImage.alt = `QR Code Pix de ${currency(amount)}`;
        generatedImage.style.width = "100%";
        generatedImage.style.height = "auto";
      }

      const generatedCanvas = qrContainer.querySelector("canvas");
      if (generatedCanvas) {
        generatedCanvas.style.width = "100%";
        generatedCanvas.style.height = "auto";
      }
    } catch (error) {
      console.error("Erro ao gerar QR Code:", error);
      qrContainer.textContent = "Não foi possível gerar o QR Code.";
    }

    document.getElementById("paymentCode").textContent = currentPixPayload;
    document.getElementById("paymentCode").style.display = "block";
    document.getElementById("copyPixCodeButton").style.display = "block";
  }

  function reservationCode() {
    return "EM-" + Date.now().toString().slice(-7) + Math.floor(10 + Math.random() * 90);
  }


  function formatEventDate(dateISO, timeValue) {
    const date = new Date(dateISO + "T12:00:00");
    const dateText = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long"
    }).replace(/^0/, "");
    return `${dateText.charAt(0).toUpperCase() + dateText.slice(1)} às ${String(timeValue).slice(0,5).replace(":", "h")}`;
  }

  function applyEventToPage() {
    document.title = `${EVENT.name} | Reserva de Convites`;

    const title = document.querySelector(".event-title");
    if (title) {
      const words = EVENT.name.trim().split(/\s+/);
      const last = words.pop() || "";
      title.innerHTML = `${safe(words.join(" "))} <span>${safe(last)}</span>`;
    }

    const subtitle = document.querySelector(".hero-subtitle");
    if (subtitle && EVENT.description) subtitle.textContent = EVENT.description;

    const infoStrong = document.querySelectorAll(".hero-info-item strong");
    if (infoStrong[0]) infoStrong[0].textContent = EVENT.date.split(" às ")[0];
    if (infoStrong[1]) infoStrong[1].textContent = EVENT.time.replace(":", "h");
    if (infoStrong[2]) infoStrong[2].textContent = EVENT.address;

    const verseCard = document.querySelector(".verse-card");
    if (verseCard) {
      verseCard.innerHTML = `“${safe(EVENT.verse)}”<b>${safe(EVENT.verseReference)}</b>`;
    }

    const summaryLines = document.querySelectorAll(".summary-line span");
    if (summaryLines[0]) summaryLines[0].textContent = EVENT.name;
    if (summaryLines[1]) summaryLines[1].textContent = EVENT.date;
    if (summaryLines[2]) summaryLines[2].textContent = EVENT.address;

    const priceChip = document.querySelector(".price-chip");
    if (priceChip) priceChip.textContent = `${currency(EVENT.ticketPrice)} cada`;

    const pixKeyText = document.getElementById("pixKeyText");
    if (pixKeyText) pixKeyText.textContent = EVENT.pixKey;

    document.querySelectorAll(".footer-brand").forEach(el => el.textContent = EVENT.name);
    updateSummary();
  }

  async function loadActiveEvent() {
    const { data, error } = await db
      .from("eventos")
      .select("*")
      .eq("ativo", true)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar evento:", error);
      alert("O sistema abriu, mas não conseguiu buscar o evento ativo no Supabase.");
      return;
    }

    if (!data) {
      alert("Nenhum evento ativo foi encontrado no Supabase.");
      return;
    }

    EVENT = {
      id: data.id,
      name: data.nome,
      description: data.descricao || "",
      dateISO: data.data_evento,
      time: String(data.horario || "17:30").slice(0,5),
      date: formatEventDate(data.data_evento, data.horario || "17:30"),
      address: data.endereco,
      ticketPrice: Number(data.valor_convite || 0),
      pixKey: data.chave_pix,
      organizerWhatsApp: String(data.whatsapp || "").replace(/\D/g, ""),
      verse: data.versiculo || "",
      verseReference: data.referencia_versiculo || "",
      limit: data.limite_vagas
    };

    applyEventToPage();
  }

  document.getElementById("quantity").addEventListener("change", updateSummary);
  document.querySelectorAll('input[name="paymentMethod"]').forEach(input =>
    input.addEventListener("change", updatePaymentUI)
  );

  document.getElementById("reservationForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector(".submit-btn");
    const originalText = button.textContent;
    const formaPagamento = selectedPaymentMethod();
    const quantidade = Number(document.getElementById("quantity").value);
    const paymentLink = PAYMENT_LINKS[quantidade];
    let paymentWindow = null;

    if (formaPagamento === "Cartão de crédito") {
      if (!paymentLink) return alert("Não existe link de cartão configurado para esta quantidade.");
      paymentWindow = window.open("about:blank", "_blank");
      if (paymentWindow) paymentWindow.document.write("<p style='font-family:Arial;padding:24px'>Preparando pagamento seguro pelo Mercado Pago...</p>");
    }

    button.disabled = true;
    button.textContent = "SALVANDO RESERVA...";

    try {
      const nome = document.getElementById("name").value.trim();
      const whatsapp = document.getElementById("phone").value.trim();
      const email = document.getElementById("email").value.trim() || null;
      const observacaoOriginal = document.getElementById("note").value.trim();
      const marcadorPagamento = `[Pagamento: ${formaPagamento}]`;
      const observacao = observacaoOriginal ? `${marcadorPagamento} ${observacaoOriginal}` : marcadorPagamento;
      const valor_total = quantidade * EVENT.ticketPrice;
      const codigo = reservationCode();

      const { error } = await db.from("reservas").insert({
        evento_id: EVENT.id, codigo, nome, whatsapp, email, quantidade,
        valor_total, observacao, status: "Pendente"
      });
      if (error) throw error;

      currentReservation = {
        evento_id: EVENT.id, codigo, nome, whatsapp, email, quantidade,
        valor_total, observacao, forma_pagamento: formaPagamento, status: "Pendente"
      };

      document.getElementById("reservationCodeText").textContent = `Código da reserva: ${codigo}`;
      document.getElementById("pixArea").style.display = "block";

      if (formaPagamento === "Pix") {
        await showPix(quantidade);
        startPaymentTimer();
      } else {
        clearInterval(paymentTimerInterval);
        document.getElementById("paymentTimer").style.display = "none";
        document.getElementById("cardPaymentStatus").textContent =
          `Reserva ${codigo} criada. Conclua o pagamento de ${currency(valor_total)} no Mercado Pago e depois envie o comprovante.`;
        if (paymentWindow) paymentWindow.location.href = paymentLink;
        else window.open(paymentLink, "_blank", "noopener,noreferrer");
      }

      const message = encodeURIComponent(
        `Olá! Fiz uma reserva para o ${EVENT.name}.\n\n` +
        `Código: ${codigo}\nNome: ${nome}\nWhatsApp: ${whatsapp}\n` +
        `Quantidade: ${quantidade}\nValor total: ${currency(valor_total)}\n` +
        `Forma de pagamento: ${formaPagamento}\n\nEstou enviando o comprovante do pagamento.`
      );
      document.getElementById("whatsLink").href =
        `https://wa.me/${EVENT.organizerWhatsApp}?text=${message}`;

      document.getElementById("pixArea").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
      console.error(error);
      alert("Não foi possível salvar a reserva no Supabase. Verifique a internet e tente novamente.\n\nDetalhe: " + error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      updatePaymentUI();
    }
  });

  const adminCard = document.querySelector(".admin-card");
  const adminContent = document.getElementById("adminContent");
  const adminArrow = document.getElementById("adminArrow");
  const loginOverlay = document.getElementById("adminLoginOverlay");
  const loginError = document.getElementById("adminLoginError");

  function openLogin() {
    loginOverlay.classList.add("open");
    loginError.textContent = "";
    document.getElementById("adminEmail").focus();
  }

  function closeLogin() {
    loginOverlay.classList.remove("open");
    document.getElementById("adminPassword").value = "";
    loginError.textContent = "";
  }

  async function openAdmin() {
    adminCard.classList.add("admin-visible");
    adminContent.classList.add("open");
    adminArrow.textContent = "▲";
    document.getElementById("adminAccessButton").textContent = "✓ Painel aberto";
    await loadReservations();
    adminCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loginAdmin() {
    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    loginError.textContent = "Entrando...";

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      loginError.textContent = "E-mail ou senha inválidos.";
      return;
    }

    closeLogin();
    await openAdmin();
  }

  async function logoutAdmin() {
    await db.auth.signOut();
    adminCard.classList.remove("admin-visible");
    adminContent.classList.remove("open");
    adminArrow.textContent = "▼";
    document.getElementById("adminAccessButton").textContent = "⚙ Painel Administrativo";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.toggleAdmin = async function() {
    const { data: { session } } = await db.auth.getSession();
    session ? openAdmin() : openLogin();
  };

  document.getElementById("adminAccessButton").addEventListener("click", toggleAdmin);
  document.getElementById("adminLoginCancel").addEventListener("click", closeLogin);
  document.getElementById("adminLoginSubmit").addEventListener("click", loginAdmin);
  document.getElementById("adminPassword").addEventListener("keydown", event => {
    if (event.key === "Enter") loginAdmin();
  });
  loginOverlay.addEventListener("click", event => {
    if (event.target === loginOverlay) closeLogin();
  });

  function confirmationMessage(reservation) {
    const firstName = String(reservation.nome || "Participante").trim().split(/\s+/)[0];
    return `Olá, ${firstName}! 🌷

Seu pagamento foi confirmado com sucesso. Sua reserva para o Encontro de Mulheres está garantida.

Código da reserva: ${reservation.codigo}
Quantidade de convites: ${reservation.quantidade}
Valor confirmado: ${currency(reservation.valor_total)}
Data: 28 de Novembro, às 17h30.

Estamos felizes em receber você. Deus abençoe!`;
  }

  async function loadReservations() {
    const statusBox = document.getElementById("supabaseStatus");
    if (statusBox) {
      statusBox.className = "connection-status";
      statusBox.textContent = "Carregando reservas do Supabase...";
    }

    const { data, error } = await db
      .from("reservas")
      .select("*")
      .eq("evento_id", EVENT.id)
      .order("criado_em", { ascending: false });

    if (error) {
      if (statusBox) {
        statusBox.className = "connection-status error";
        statusBox.textContent = "Erro ao carregar reservas: " + error.message;
      }
      return;
    }

    adminReservations = data || [];
    renderAdmin();
  }

  window.adminSetStatus = async function(id, status, sendWhatsapp = false) {
    const { error } = await db
      .from("reservas")
      .update({ status, atualizado_em: new Date().toISOString() })
      .eq("id", id);

    if (error) return alert("Erro ao atualizar: " + error.message);

    const reservation = adminReservations.find(item => item.id === id);
    await loadReservations();

    if (sendWhatsapp && reservation) {
      window.open(
        `https://wa.me/${normalizePhone(reservation.whatsapp)}?text=${encodeURIComponent(confirmationMessage(reservation))}`,
        "_blank"
      );
    }
  };

  window.adminSendConfirmation = function(id) {
    const reservation = adminReservations.find(item => item.id === id);
    if (!reservation) return;
    window.open(
      `https://wa.me/${normalizePhone(reservation.whatsapp)}?text=${encodeURIComponent(confirmationMessage(reservation))}`,
      "_blank"
    );
  };

  window.adminEdit = async function(id) {
    const reservation = adminReservations.find(item => item.id === id);
    if (!reservation) return;

    const nome = prompt("Nome da participante:", reservation.nome || "");
    if (nome === null) return;

    const whatsapp = prompt("WhatsApp:", reservation.whatsapp || "");
    if (whatsapp === null) return;

    const quantityInput = prompt("Quantidade de convites:", reservation.quantidade || 1);
    if (quantityInput === null) return;

    const quantidade = Math.max(1, Math.min(20, parseInt(quantityInput, 10) || 1));

    const { error } = await db
      .from("reservas")
      .update({
        nome: nome.trim(),
        whatsapp: whatsapp.trim(),
        quantidade,
        valor_total: quantidade * EVENT.ticketPrice,
        atualizado_em: new Date().toISOString()
      })
      .eq("id", id);

    if (error) return alert("Erro ao editar: " + error.message);
    await loadReservations();
  };

  window.adminDelete = async function(id) {
    const reservation = adminReservations.find(item => item.id === id);
    if (!reservation) return;
    if (!confirm(`Excluir definitivamente a reserva de ${reservation.nome}?`)) return;

    const { error } = await db.from("reservas").delete().eq("id", id);
    if (error) return alert("Erro ao excluir: " + error.message);
    await loadReservations();
  };

  function renderAdmin() {
    const currentSearch = document.getElementById("adminSearch")?.value || "";
    const currentTab = document.querySelector(".admin-tab.active")?.dataset.view || "reservas";
    const term = currentSearch.trim().toLowerCase();

    const filtered = adminReservations.filter(item =>
      `${item.codigo || ""} ${item.nome || ""} ${item.whatsapp || ""} ${item.status || ""} ${paymentMethodFromReservation(item)}`
        .toLowerCase().includes(term)
    );

    const confirmed = adminReservations.filter(item => item.status === "Confirmado");
    const canceled = adminReservations.filter(item => item.status === "Cancelado");
    const pending = adminReservations.filter(item => item.status === "Pendente");
    const reservedTickets = adminReservations
      .filter(item => item.status !== "Cancelado")
      .reduce((sum,item) => sum + Number(item.quantidade || 0), 0);
    const available = EVENT.limit ? Math.max(0, EVENT.limit - reservedTickets) : null;
    const occupancy = EVENT.limit ? Math.min(100, (reservedTickets / EVENT.limit) * 100) : 0;

    adminContent.innerHTML = `
      <div id="supabaseStatus" class="connection-status ok">Conectado ao Supabase.</div>

      <div class="admin-head-actions">
        <button class="admin-exit" id="adminRefresh">Atualizar reservas</button>
        <button class="admin-exit" id="adminLogout">Sair do painel</button>
      </div>

      <div class="admin-tabs">
        <button class="admin-tab ${currentTab === "reservas" ? "active" : ""}" data-view="reservas">👥 Reservas</button>
        <button class="admin-tab ${currentTab === "configuracoes" ? "active" : ""}" data-view="configuracoes">⚙ Configurações do Evento</button>
      </div>

      <div id="adminViewReservas" class="admin-view ${currentTab === "reservas" ? "active" : ""}">
        <div class="admin-dashboard-grid">
          <div class="admin-stat"><small>Reservas</small><strong>${adminReservations.length}</strong></div>
          <div class="admin-stat"><small>Convites</small><strong>${reservedTickets}</strong></div>
          <div class="admin-stat"><small>Confirmadas</small><strong>${confirmed.length}</strong></div>
          <div class="admin-stat"><small>Pendentes / canceladas</small><strong>${pending.length} / ${canceled.length}</strong></div>
          <div class="admin-stat"><small>Valor recebido</small><strong>${currency(confirmed.reduce((sum,item) => sum + Number(item.valor_total || 0), 0))}</strong></div>
        </div>

        <div class="vacancy-card">
          <div class="vacancy-line">
            <div>
              <small style="color:var(--muted)">Controle de vagas</small>
              <div style="margin-top:5px;font-weight:800">${EVENT.limit ? `${reservedTickets} de ${EVENT.limit} vagas ocupadas` : "Sem limite definido"}</div>
            </div>
            <strong>${available === null ? "∞" : available}</strong>
          </div>
          <div class="vacancy-bar"><div class="vacancy-fill" style="width:${occupancy}%"></div></div>
        </div>

        <div class="admin-toolbar" style="margin-top:16px">
          <input id="adminSearch" type="search" placeholder="Pesquisar nome, WhatsApp, código ou status" value="${safe(currentSearch)}">
        </div>

        <div class="admin-table-wrap">
          ${filtered.length ? `
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Código</th><th>Nome</th><th>WhatsApp</th><th>Qtd.</th>
                  <th>Valor</th><th>Pagamento</th><th>Status</th><th>Data</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(item => {
                  const statusClass = item.status === "Confirmado" ? "status-confirmado" :
                    item.status === "Cancelado" ? "status-cancelado" : "status-pendente";

                  let buttons = "";
                  if (item.status === "Confirmado") {
                    buttons = `
                      <button class="admin-action-btn btn-pending" onclick="adminSetStatus(${item.id},'Pendente')">Pendente</button>
                      <button class="admin-action-btn btn-cancel" onclick="adminSetStatus(${item.id},'Cancelado')">Cancelar</button>
                      <button class="admin-action-btn btn-whatsapp" onclick="adminSendConfirmation(${item.id})">WhatsApp</button>`;
                  } else if (item.status === "Cancelado") {
                    buttons = `
                      <button class="admin-action-btn btn-pending" onclick="adminSetStatus(${item.id},'Pendente')">Reativar</button>
                      <button class="admin-action-btn btn-confirm" onclick="adminSetStatus(${item.id},'Confirmado',true)">Confirmar + WhatsApp</button>`;
                  } else {
                    buttons = `
                      <button class="admin-action-btn btn-confirm" onclick="adminSetStatus(${item.id},'Confirmado',true)">Confirmar + WhatsApp</button>
                      <button class="admin-action-btn btn-cancel" onclick="adminSetStatus(${item.id},'Cancelado')">Cancelar</button>`;
                  }

                  return `<tr>
                    <td>${safe(item.codigo || "-")}</td>
                    <td>${safe(item.nome || "-")}</td>
                    <td>${safe(item.whatsapp || "-")}</td>
                    <td>${Number(item.quantidade || 1)}</td>
                    <td>${currency(item.valor_total)}</td>
                    <td>${paymentMethodFromReservation(item) === "Cartão" ? "💳 Cartão" : "⚡ Pix"}</td>
                    <td><span class="status-badge ${statusClass}">${safe(item.status || "Pendente")}</span></td>
                    <td>${item.criado_em ? new Date(item.criado_em).toLocaleString("pt-BR") : "-"}</td>
                    <td><div class="admin-actions">
                      ${buttons}
                      <button class="admin-action-btn btn-edit" onclick="adminEdit(${item.id})">Editar</button>
                      <button class="admin-action-btn btn-delete" onclick="adminDelete(${item.id})">Excluir</button>
                    </div></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>` :
            `<div class="empty-admin">Nenhuma reserva encontrada.</div>`
          }
        </div>
      </div>

      <div id="adminViewConfiguracoes" class="admin-view ${currentTab === "configuracoes" ? "active" : ""}">
        <div class="event-config-card">
          <h3>Configurações do Evento</h3>
          <p>Altere as informações abaixo e salve. O site público será atualizado a partir do Supabase.</p>

          <div class="config-grid">
            <div class="full">
              <label for="cfgNome">Nome do evento</label>
              <input id="cfgNome" value="${safe(EVENT.name)}">
            </div>

            <div class="full">
              <label for="cfgDescricao">Descrição</label>
              <textarea id="cfgDescricao" rows="3">${safe(EVENT.description)}</textarea>
            </div>

            <div>
              <label for="cfgData">Data</label>
              <input id="cfgData" type="date" value="${safe(EVENT.dateISO)}">
            </div>

            <div>
              <label for="cfgHorario">Horário</label>
              <input id="cfgHorario" type="time" value="${safe(EVENT.time)}">
            </div>

            <div class="full">
              <label for="cfgEndereco">Endereço</label>
              <input id="cfgEndereco" value="${safe(EVENT.address)}">
            </div>

            <div>
              <label for="cfgValor">Valor do convite</label>
              <input id="cfgValor" type="number" min="0" step="0.01" value="${Number(EVENT.ticketPrice)}">
            </div>

            <div>
              <label for="cfgVagas">Limite de vagas</label>
              <input id="cfgVagas" type="number" min="1" value="${EVENT.limit || ""}">
            </div>

            <div>
              <label for="cfgPix">Chave Pix</label>
              <input id="cfgPix" value="${safe(EVENT.pixKey)}">
            </div>

            <div>
              <label for="cfgWhatsApp">WhatsApp</label>
              <input id="cfgWhatsApp" value="${safe(EVENT.organizerWhatsApp)}">
            </div>

            <div class="full">
              <label for="cfgVersiculo">Versículo</label>
              <textarea id="cfgVersiculo" rows="3">${safe(EVENT.verse)}</textarea>
            </div>

            <div class="full">
              <label for="cfgReferencia">Referência do versículo</label>
              <input id="cfgReferencia" value="${safe(EVENT.verseReference)}">
            </div>
          </div>

          <div class="config-actions">
            <button class="config-save" id="saveEventConfig">Salvar configurações</button>
            <button class="config-preview" id="previewEventConfig">Pré-visualizar no site</button>
          </div>
          <div id="configMessage" class="config-message"></div>
        </div>
      </div>
    `;

    document.querySelectorAll(".admin-tab").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(item => item.classList.remove("active"));
        document.querySelectorAll(".admin-view").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(
          button.dataset.view === "reservas" ? "adminViewReservas" : "adminViewConfiguracoes"
        ).classList.add("active");
      });
    });

    const search = document.getElementById("adminSearch");
    if (search) search.addEventListener("input", renderAdmin);

    document.getElementById("adminLogout").addEventListener("click", logoutAdmin);
    document.getElementById("adminRefresh").addEventListener("click", loadReservations);

    const saveConfig = document.getElementById("saveEventConfig");
    if (saveConfig) saveConfig.addEventListener("click", saveEventConfiguration);

    const previewConfig = document.getElementById("previewEventConfig");
    if (previewConfig) previewConfig.addEventListener("click", previewEventConfiguration);
  }

  function readConfigForm() {
    return {
      nome: document.getElementById("cfgNome").value.trim(),
      descricao: document.getElementById("cfgDescricao").value.trim(),
      data_evento: document.getElementById("cfgData").value,
      horario: document.getElementById("cfgHorario").value,
      endereco: document.getElementById("cfgEndereco").value.trim(),
      valor_convite: Number(document.getElementById("cfgValor").value || 0),
      limite_vagas: document.getElementById("cfgVagas").value
        ? Number(document.getElementById("cfgVagas").value)
        : null,
      chave_pix: document.getElementById("cfgPix").value.trim(),
      whatsapp: document.getElementById("cfgWhatsApp").value.replace(/\D/g, ""),
      versiculo: document.getElementById("cfgVersiculo").value.trim(),
      referencia_versiculo: document.getElementById("cfgReferencia").value.trim()
    };
  }

  function validateEventConfig(config) {
    if (!config.nome) return "Informe o nome do evento.";
    if (!config.data_evento) return "Informe a data do evento.";
    if (!config.horario) return "Informe o horário.";
    if (!config.endereco) return "Informe o endereço.";
    if (config.valor_convite < 0) return "O valor do convite não pode ser negativo.";
    if (!config.chave_pix) return "Informe a chave Pix.";
    if (!config.whatsapp) return "Informe o WhatsApp.";
    return "";
  }

  function applyConfigObject(config) {
    EVENT = {
      ...EVENT,
      name: config.nome,
      description: config.descricao,
      dateISO: config.data_evento,
      time: config.horario,
      date: formatEventDate(config.data_evento, config.horario),
      address: config.endereco,
      ticketPrice: config.valor_convite,
      limit: config.limite_vagas,
      pixKey: config.chave_pix,
      organizerWhatsApp: config.whatsapp,
      verse: config.versiculo,
      verseReference: config.referencia_versiculo
    };
    applyEventToPage();
  }

  function previewEventConfiguration() {
    const config = readConfigForm();
    const validation = validateEventConfig(config);
    const message = document.getElementById("configMessage");

    if (validation) {
      message.className = "config-message error";
      message.textContent = validation;
      return;
    }

    applyConfigObject(config);
    message.className = "config-message ok";
    message.textContent = "Pré-visualização aplicada apenas nesta tela. Clique em Salvar para gravar no Supabase.";
    document.querySelector(".hero").scrollIntoView({ behavior: "smooth" });
  }

  async function saveEventConfiguration() {
    const config = readConfigForm();
    const validation = validateEventConfig(config);
    const message = document.getElementById("configMessage");

    if (validation) {
      message.className = "config-message error";
      message.textContent = validation;
      return;
    }

    message.className = "config-message";
    message.style.display = "block";
    message.textContent = "Salvando configurações...";

    const { error } = await db
      .from("eventos")
      .update({
        ...config,
        atualizado_em: new Date().toISOString()
      })
      .eq("id", EVENT.id);

    if (error) {
      message.className = "config-message error";
      message.textContent = "Erro ao salvar: " + error.message;
      return;
    }

    applyConfigObject(config);
    message.className = "config-message ok";
    message.textContent = "Configurações salvas com sucesso no Supabase.";
    await loadReservations();
  }

  document.getElementById("bottomWhatsLink").addEventListener("click", event => {
    event.preventDefault();
    document.getElementById("reserva").scrollIntoView({ behavior: "smooth" });
  });

  loadActiveEvent().catch(console.error);

  db.auth.getSession().then(({ data: { session } }) => {
    if (session) document.getElementById("adminAccessButton").textContent = "⚙ Painel Administrativo";
  });
