// ==================================
// EVENTS MODULE
// ==================================

import { apiCall } from '../core/api.jsx';
import { escapeHtml } from '../utils/utils.jsx';
import { getUserInfo } from '../core/storage.jsx';

// API Base URL for image loading
const API_BASE = "http://localhost:3000";

// ==================================
// EVENT DISCOVERY & RENDERING (ES MODULE EXPORTS)
// ==================================
export async function loadEventsFromBackend() {
  try {
    console.log('🔄 Loading events from backend...');
    const result = await apiCall('/events');
    console.log('📡 API Response:', result);
    if (result.success && Array.isArray(result.data)) {
      console.log(`✅ Loaded ${result.data.length} events successfully`);
      return result.data;
    }
    console.error('❌ Failed to load events:', result.error);
    return [];
  } catch (error) {
    console.error('💥 Error loading events:', error);
    return [];
  }
}

export function renderEventsList(events) {
  const container = document.getElementById('eventsList');
  if (!container) return;

  console.log('🎨 Rendering events list:', events);

  // Remove loading class to enable carousel display
  container.classList.remove('loading');
  console.log('✅ Removed loading class from eventsList');

  if (!events || events.length === 0) {
    console.log('⚠️ No events to display');
    container.innerHTML = `
      <div class="no-events-modal" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
        min-height: 400px;
        background: linear-gradient(135deg, rgba(94, 23, 235, 0.05), rgba(36, 16, 95, 0.05));
        border-radius: 16px;
        margin: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      ">
        <div style="
          font-size: 80px;
          margin-bottom: 24px;
          animation: float 3s ease-in-out infinite;
        ">
          🎭
        </div>
        <h2 style="
          font-size: 28px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        ">
          No Events Available
        </h2>
        <p style="
          font-size: 16px;
          color: var(--muted);
          max-width: 400px;
          line-height: 1.6;
          margin-bottom: 32px;
        ">
          Check back soon for new experiences! We're working on bringing you amazing events.
        </p>
        <button onclick="window.location.reload()" style="
          background: linear-gradient(135deg, #5E17EB, #24105F);
          color: white;
          padding: 14px 32px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(94, 23, 235, 0.3);
          transition: all 0.3s ease;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(94, 23, 235, 0.4)'" 
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(94, 23, 235, 0.3)'">
          🔄 Refresh
        </button>
      </div>
      <style>
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      </style>
    `;
    return;
  }

  console.log(`🎯 Rendering ${events.length} events in carousel`);

  container.innerHTML = events.map((evt) => {
    const rawImage = evt.image_url && String(evt.image_url).trim();
    const imgSrc = rawImage
      ? (rawImage.startsWith('http') ? rawImage : `${API_BASE}${rawImage}`)
      : '/assets/event-default.jpg';

    return `
    <div class="event-card" onclick="showEventBookingModal('${evt.id}')">
      <div class="event-image">
        <img src="${imgSrc}" alt="${escapeHtml(evt.title || 'Event')}">
        ${evt.price_per_ticket && parseFloat(evt.price_per_ticket) === 0 ? 
          '<div class="event-badge">FREE</div>' : 
          `<div class="event-badge">₹${evt.price_per_ticket}</div>`
        }
      </div>
      <div class="event-info">
        <h3 class="event-title">${escapeHtml(evt.title || 'Untitled Event')}</h3>
        <p class="event-description">${escapeHtml(evt.description || 'Exclusive Elizian experience')}</p>
        <div class="event-meta">
          ${evt.start_time ? `<span>📅 ${new Date(evt.start_time).toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
          })}</span>` : ''}
          ${evt.start_time ? `<span>🕐 ${new Date(evt.start_time).toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}</span>` : ''}
          ${evt.organizer_name ? `<span>📍 ${escapeHtml(evt.organizer_name)}</span>` : ''}
          ${evt.price_per_ticket && parseFloat(evt.price_per_ticket) > 0 ? 
            `<span class="price">₹${evt.price_per_ticket}</span>` : 
            '<span class="price">FREE</span>'
          }
        </div>
        <button class="event-button" onclick="event.stopPropagation(); showEventBookingModal('${evt.id}')">
          Book Now
        </button>
      </div>
    </div>
  `;}).join('');

  // Add touch/swipe functionality
  addSwipeFunctionality(container);
}

function addSwipeFunctionality(container) {
  let startX = 0;
  let scrollLeft = 0;
  let isDown = false;

  // Mouse events
  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  container.addEventListener('mouseleave', () => {
    isDown = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mouseup', () => {
    isDown = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    container.scrollLeft = scrollLeft - walk;
  });

  // Touch events for mobile
  container.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  container.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const x = e.touches[0].pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5; // Slower scroll for touch
    container.scrollLeft = scrollLeft - walk;
  });

  // Add grab cursor
  container.style.cursor = 'grab';
}

// ==================================
// EVENT BOOKING FUNCTIONS (GLOBAL HELPERS)
// ==================================
async function showEventBookingModal(eventId) {
  console.log('🎫 Showing event booking modal for:', eventId);
  
  try {
    // Get user info for booking
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.id) {
      alert('Please log in to book events.');
      return;
    }
    
    // Fetch event details from individual event endpoint
    const eventResult = await apiCall(`/events/${eventId}`);
    if (!eventResult.success || !eventResult.data) {
      console.error('❌ Failed to fetch event details:', eventResult.error);
      alert('Failed to load event details. Please try again.');
      return;
    }
    
    const event = eventResult.data;
    
    console.log('📋 Event details:', event);
    console.log('👤 User info:', userInfo);
    
    // Show the modal
    const modal = document.getElementById('eventBookingModal');
    if (!modal) {
      console.error('❌ Event booking modal not found');
      return;
    }
    
    modal.style.display = 'flex';
    
    // Create booking form
    const bookingContent = `
      <div class="modal-content" style="background: white; border-radius: 16px; padding: 24px; max-width: 500px; width: 90%; position: relative; max-height: 80vh; overflow-y: auto;">
        <button onclick="closeEventBookingModal()" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666; z-index: 10;">&times;</button>
        
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px 0; color: #333; font-size: 24px; font-weight: 700;">Book Your Ticket</h2>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 12px; border-left: 4px solid #5E17EB;">
            <div style="font-weight: 600; color: #333; margin-bottom: 8px; font-size: 18px;">${escapeHtml(event.title || 'Event')}</div>
            <div style="font-size: 14px; color: #666; margin-bottom: 8px;">${escapeHtml(event.organizer_name || 'Elizian')}</div>
            <div style="font-size: 14px; color: #666; margin-bottom: 12px;">
              📅 ${event.start_time ? new Date(event.start_time).toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              }) : 'TBD'} 
              🕐 ${event.start_time ? new Date(event.start_time).toLocaleTimeString('en-IN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : 'TBD'}
            </div>
            <div style="font-size: 20px; color: #5E17EB; font-weight: bold;">
              ${event.price_per_ticket && parseFloat(event.price_per_ticket) > 0 ? `₹${event.price_per_ticket} per ticket` : 'FREE'}
            </div>
          </div>
        </div>
        
        <form id="eventBookingForm" onsubmit="submitEventBooking(event, '${eventId}'); return false;">
          <div style="margin-bottom: 20px; background: #f8f9fa; padding: 16px; border-radius: 12px; border-left: 4px solid #28a745;">
            <div style="font-weight: 600; color: #333; margin-bottom: 8px;">Booking for:</div>
            <div style="font-size: 14px; color: #666;">
              <div><strong>Name:</strong> ${userInfo.first_name || ''} ${userInfo.last_name || ''}</div>
              <div><strong>Email:</strong> ${userInfo.email || ''}</div>
              <div><strong>Phone:</strong> ${userInfo.phone_number || ''}</div>
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">Number of Tickets</label>
            <input type="number" id="ticketCount" min="1" max="${event.booking_cap || 10}" value="1" required 
                   onchange="updateBookingTotal('${eventId}')"
                   style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
          </div>
          
          <div id="bookingTotal" style="background: #e3f2fd; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Subtotal:</span>
              <span id="subtotal">₹${event.price_per_ticket || '0'}</span>
            </div>
            <div style="font-size: 14px; color: #666;">
              Total: <span id="total" style="font-weight: 600; color: #5E17EB; font-size: 18px;">₹${event.price_per_ticket || '0'}</span>
            </div>
          </div>
          
          <button type="submit" style="width: 100%; padding: 16px; background: linear-gradient(135deg, #5E17EB, #7C3AED); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
            Confirm Booking
          </button>
        </form>
      </div>
    `;
    
    modal.innerHTML = bookingContent;
    
    // Update total on page load
    updateBookingTotal(eventId);
    
  } catch (error) {
    console.error('💥 Error showing event booking modal:', error);
    alert('Failed to load event details. Please try again.');
  }
}

function closeEventBookingModal() {
  const modal = document.getElementById('eventBookingModal');
  if (modal) {
    modal.style.display = 'none';
    modal.innerHTML = '';
  }
}

function updateBookingTotal(eventId) {
  // This will be called when ticket count changes
  // For now, just show the basic calculation
  const ticketCount = document.getElementById('ticketCount')?.value || 1;
  const pricePerTicket = parseFloat(document.querySelector('#bookingTotal').textContent.match(/₹(\d+)/)?.[1] || 0);
  const subtotal = pricePerTicket * ticketCount;
  
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  
  if (subtotalEl) subtotalEl.textContent = `₹${subtotal}`;
  if (totalEl) totalEl.textContent = `₹${subtotal}`;
}

async function submitEventBooking(event, eventId) {
  event.preventDefault();
  console.log('🎫 Submitting event booking for:', eventId);
  
  const userInfo = getUserInfo();
  if (!userInfo || !userInfo.id) {
    alert('Please log in to book events.');
    return;
  }
  
  const ticketCount = parseInt(document.getElementById('ticketCount').value) || 1;
  
  const bookingData = {
    event_id: eventId,
    attendee_name: `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim(),
    attendee_email: userInfo.email || '',
    attendee_phone: userInfo.phone_number || '',
    ticket_count: ticketCount
  };
  
  console.log('📋 Booking data:', bookingData);
  
  try {
    // Call the backend API to create the booking
    const result = await apiCall(`/events/${eventId}/tickets`, 'POST', bookingData);
    
    if (result.success) {
      alert(`Booking submitted successfully!\n\nEvent: ${bookingData.attendee_name}\nTickets: ${bookingData.ticket_count}\nEmail: ${bookingData.attendee_email}`);
      
      // Close the modal
      closeEventBookingModal();
      
      // Refresh the user's tickets if on profile screen
      if (typeof loadUserTickets === 'function') {
        loadUserTickets();
      }
    } else {
      throw new Error(result.error || 'Booking failed');
    }
    
  } catch (error) {
    console.error('💥 Error submitting booking:', error);
    alert('Failed to submit booking: ' + error.message);
  }
}

// ==================================
// USER TICKETS MANAGEMENT
// ==================================
export async function loadUserTickets() {
  try {
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.id) {
      console.log('⚠️ No user info available for loading tickets');
      return [];
    }
    
    console.log('🎫 Loading tickets for user:', userInfo.id);
    const result = await apiCall(`/users/${userInfo.id}/tickets`);
    
    if (result.success && result.data) {
      console.log(`✅ Loaded ${result.data.length} tickets`);
      return result.data;
    } else {
      console.error('❌ Failed to load tickets:', result.error);
      return [];
    }
  } catch (error) {
    console.error('💥 Error loading tickets:', error);
    return [];
  }
}

export function renderUserTickets(tickets) {
  const ticketsContainer = document.getElementById('userTicketsList');
  if (!ticketsContainer) {
    console.log('⚠️ User tickets container not found');
    return;
  }
  
  console.log('🎨 Rendering user tickets:', tickets);
  
  if (!tickets || tickets.length === 0) {
    ticketsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">🎫</div>
        <p>No tickets booked yet</p>
        <p>Book your first event to see tickets here!</p>
      </div>
    `;
    return;
  }
  
  ticketsContainer.innerHTML = tickets.map(ticket => `
    <div class="ticket-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #5E17EB;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <h3 style="margin: 0 0 8px 0; color: #333; font-size: 18px;">${escapeHtml(ticket.event_title || 'Event')}</h3>
          <p style="margin: 0; color: #666; font-size: 14px;">${escapeHtml(ticket.organizer_name || 'Elizian')}</p>
        </div>
        <div style="text-align: right;">
          <div style="background: #f8f9fa; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #5E17EB; margin-bottom: 8px;">
            ${ticket.payment_status === 'paid' ? '✅ Confirmed' : '⏳ Pending'}
          </div>
          <div style="font-size: 12px; color: #666;">${ticket.ticket_code}</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Date & Time</div>
          <div style="font-size: 14px; color: #333;">
            ${ticket.start_time ? new Date(ticket.start_time).toLocaleDateString('en-IN', { 
              day: '2-digit', 
              month: 'short', 
              year: 'numeric' 
            }) : 'TBD'} 
            ${ticket.start_time ? new Date(ticket.start_time).toLocaleTimeString('en-IN', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }) : ''}
          </div>
        </div>
        <div>
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Price Paid</div>
          <div style="font-size: 14px; color: #333; font-weight: 600;">₹${ticket.price_paid || '0'}</div>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 12px; color: #666;">
          Booked on: ${ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-IN') : 'Unknown'}
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="showTicketDetails('${ticket.ticket_code}')" style="padding: 6px 12px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; cursor: pointer;">
            View Details
          </button>
          ${ticket.qr_code ? `
            <button onclick="showQRCode('${ticket.qr_code}')" style="padding: 6px 12px; background: #5E17EB; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
              QR Code
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function showTicketDetails(ticketCode) {
  console.log('🎫 Showing ticket details for:', ticketCode);
  alert(`Ticket Details\n\nCode: ${ticketCode}\n\nThis would show detailed ticket information.`);
}

function showQRCode(qrCode) {
  console.log('📱 Showing QR code for:', qrCode);
  alert(`QR Code\n\n${qrCode}\n\nThis would display the QR code for check-in.`);
}

// ==================================
// EVENT FILTERING AND SEARCH
// ==================================
function filterEvents() {
  // Implementation for filtering events
  console.log('Filtering events');
}

function searchEvents(query) {
  // Implementation for searching events
  console.log('Searching events:', query);
}

// ==================================
// EXPORTS
// ==================================
window.showEventBookingModal = showEventBookingModal;
window.closeEventBookingModal = closeEventBookingModal;
window.updateBookingTotal = updateBookingTotal;
window.submitEventBooking = submitEventBooking;
window.loadUserTickets = loadUserTickets;
window.renderUserTickets = renderUserTickets;
window.showTicketDetails = showTicketDetails;
window.showQRCode = showQRCode;
window.filterEvents = filterEvents;
window.searchEvents = searchEvents;
