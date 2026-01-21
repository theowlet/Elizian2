(function () {
  const globalNS = (window.UIComponents = window.UIComponents || {});

  const currency = (value) =>
    typeof value === 'number'
      ? `₹${value.toLocaleString('en-IN')}`
      : value || '—';

  function OfferCard(offer) {
    const img =
      offer.image_url && offer.image_url.startsWith('http')
        ? offer.image_url
        : `${window.API_BASE || ''}${offer.image_url || '/assets/default-offer.jpg'}`;

    const discountLabel =
      offer.discount_percent && Number(offer.discount_percent) > 0
        ? `${offer.discount_percent}% OFF`
        : offer.discount_amount
        ? `${currency(offer.discount_amount)} OFF`
        : 'Exclusive';

    return `
      <article class="modern-offer-card" data-offer="${offer.id}">
        <img class="card-image" src="${img}" alt="${offer.title || offer.partner_name}">
        <header>
          <div class="pill badge">${offer.category || 'Experience'}</div>
          <h3 class="card-title">${offer.title || offer.partner_name || 'Offer'}</h3>
          <p class="card-meta">${offer.partner_name || ''}</p>
        </header>
        <div class="card-meta">
          <span>${discountLabel}</span>
          <span>⭐ ${offer.rating || '4.8'}</span>
        </div>
        <div class="cta-row">
          <button class="btn-primary" onclick="window.confirmBooking?.('${offer.id}')">
            Book Now
          </button>
          <button class="btn-secondary" onclick="window.openOfferDetails?.('${offer.id}')">
            Details
          </button>
        </div>
      </article>
    `;
  }

  function VoucherCard(voucher) {
    const expires = voucher.expiry_date
      ? new Date(voucher.expiry_date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
        })
      : '—';

    return `
      <article class="voucher-card-modern">
        <span class="state-pill">${voucher.status || 'ACTIVE'}</span>
        <h3>${voucher.partner_name || 'Partner'}</h3>
        <p class="card-meta">Value: ${currency(voucher.value) || '—'}</p>
        <p class="card-meta">Expires ${expires}</p>
        <button class="qr-btn" onclick="window.viewVoucherQR?.('${voucher.id}')">
          View QR
        </button>
      </article>
    `;
  }

  function TokenWidget({ balance = 0, earned = 0, spent = 0 } = {}) {
    return `
      <section class="token-dashboard" aria-label="EZT Token Wallet">
        <div class="token-title">EZT Tokens</div>
        <div class="token-balance">${balance.toFixed(2)}</div>
        <div class="token-meta">
          <span>Earned: ${earned.toFixed(2)}</span>
          <span>Spent: ${spent.toFixed(2)}</span>
        </div>
        <p style="margin-top: 1rem; font-size: 0.9rem; opacity: .85;">
          1 EZT = ₹100. Redeem instantly on any experience.
        </p>
      </section>
    `;
  }

  function QRScannerShell() {
    return `
      <section class="qr-scanner-shell">
        <header>
          <h2>Scan & Redeem</h2>
          <p style="opacity:.8">Align the QR within the frame to validate vouchers.</p>
        </header>
        <div class="qr-viewfinder" id="qrViewfinder">
          <span style="font-size:1.5rem; opacity:.6;">▢</span>
        </div>
        <button class="qr-scan-btn" onclick="window.startCameraScanner?.()">
          Start Scanner
        </button>
      </section>
    `;
  }

  globalNS.OfferCard = OfferCard;
  globalNS.VoucherCard = VoucherCard;
  globalNS.TokenWidget = TokenWidget;
  globalNS.QRScannerShell = QRScannerShell;
})();

