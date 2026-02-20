import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const formatPrice = (n) => {
  if (n == null || n === "") return "";
  const num = Number(n);
  return isNaN(num) ? "" : `₹${num.toLocaleString("en-IN")}`;
};

const formatDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { dateStyle: "medium" });
};

const EventsPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'calendar' (calendar = list sorted by date)

  useEffect(() => {
    let cancelled = false;
    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${API_BASE}/api/v1/offers?limit=100&is_active=true&service_type=events`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || "Failed to load events");
          setEvents([]);
          return;
        }
        const list = (data.success && data.data) ? data.data : [];
        const sorted = [...list].sort((a, b) => {
          const sa = a.start_date ? new Date(a.start_date).getTime() : 0;
          const sb = b.start_date ? new Date(b.start_date).getTime() : 0;
          return sa - sb;
        });
        setEvents(sorted);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Something went wrong");
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchEvents();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="events-page">
      <header className="events-page-header">
        <button type="button" className="events-page-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Events</h1>
        <p className="events-page-subtitle">Discover and book events</p>
        <div className="events-page-view-toggle">
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
          <button
            type="button"
            className={viewMode === "calendar" ? "active" : ""}
            onClick={() => setViewMode("calendar")}
          >
            By date
          </button>
        </div>
      </header>

      {loading && <p className="events-page-loading">Loading events...</p>}
      {error && <p className="events-page-error">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <p className="events-page-empty">No events at the moment. Check back later.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <section className="events-page-list">
          {events.map((event) => (
            <article key={event.id} className="events-page-card">
              <div
                className="events-page-card-image"
                style={{
                  backgroundImage: `url(${
                    event.image_url ||
                    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80"
                  })`,
                }}
              />
              <div className="events-page-card-body">
                <h2 className="events-page-card-title">{event.title}</h2>
                {event.partner_name && (
                  <p className="events-page-card-venue">{event.partner_name}</p>
                )}
                {event.description && (
                  <p className="events-page-card-desc">{event.description}</p>
                )}
                <div className="events-page-card-meta">
                  {event.start_date && (
                    <span>📅 {formatDate(event.start_date)}</span>
                  )}
                  {(event.discounted_price != null || event.original_price != null) && (
                    <span className="events-page-card-price">
                      {formatPrice(event.discounted_price ?? event.original_price)}
                      {event.original_price != null &&
                        event.discounted_price != null &&
                        event.original_price > event.discounted_price && (
                          <span className="events-page-price-original">
                            {" "}
                            {formatPrice(event.original_price)}
                          </span>
                        )}
                    </span>
                  )}
                </div>
                <div className="events-page-card-actions">
                  <button
                    type="button"
                    className="events-page-btn events-page-btn-secondary"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    className="events-page-btn events-page-btn-primary"
                    onClick={() =>
                      navigate("/events/booking", {
                        state: {
                          deal: {
                            id: event.id,
                            title: event.title,
                            description: event.description,
                            service_type: "events",
                            partner_id: event.partner_id,
                            partner_name: event.partner_name,
                            discounted_price: event.discounted_price,
                            original_price: event.original_price,
                            start_date: event.start_date,
                            end_date: event.end_date,
                            image_url: event.image_url,
                          },
                          dealId: event.id,
                          serviceType: "events",
                        },
                      })
                    }
                  >
                    Book now
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <style>{`
        .events-page { max-width: 800px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
        .events-page-header { margin-bottom: 1.5rem; }
        .events-page-back { background: none; border: none; color: #333; cursor: pointer; font-size: 1rem; }
        .events-page-back:hover { text-decoration: underline; }
        .events-page-header h1 { margin: 0.5rem 0 0; font-size: 1.75rem; }
        .events-page-subtitle { color: #666; margin: 0.25rem 0 0; }
        .events-page-view-toggle { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .events-page-view-toggle button { padding: 6px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff; cursor: pointer; }
        .events-page-view-toggle button.active { background: var(--primary-color, #2563eb); color: #fff; border-color: var(--primary-color, #2563eb); }
        .events-page-loading, .events-page-error, .events-page-empty { color: #666; margin: 1rem 0; }
        .events-page-error { color: #b91c1c; }
        .events-page-list { display: flex; flex-direction: column; gap: 1.25rem; }
        .events-page-card { border: 1px solid #eee; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
        .events-page-card-image { height: 180px; background: #f0f0f0; background-size: cover; background-position: center; }
        .events-page-card-body { padding: 1rem; }
        .events-page-card-title { margin: 0 0 0.25rem 0; font-size: 1.2rem; }
        .events-page-card-venue { color: #666; font-size: 0.95rem; margin: 0 0 0.5rem 0; }
        .events-page-card-desc { color: #444; font-size: 0.9rem; margin: 0 0 0.75rem 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .events-page-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem; color: #555; }
        .events-page-card-price { font-weight: 600; }
        .events-page-price-original { color: #999; text-decoration: line-through; font-weight: normal; margin-left: 0.25rem; }
        .events-page-card-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .events-page-btn { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 500; border: none; }
        .events-page-btn-primary { background: var(--primary-color, #2563eb); color: #fff; }
        .events-page-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
      `}</style>
    </div>
  );
};

export default EventsPage;
