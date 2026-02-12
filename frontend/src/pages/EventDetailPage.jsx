import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const formatPrice = (n) => {
  if (n == null || n === "") return "";
  const num = Number(n);
  return isNaN(num) ? "" : `₹${num.toLocaleString("en-IN")}`;
};

const formatDateTime = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const EventDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchEvent() {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/v1/offers/${id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || "Event not found");
          setEvent(null);
          return;
        }
        if (data.success && data.data) {
          setEvent(data.data);
        } else {
          setEvent(null);
          setError("Event not found");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Something went wrong");
          setEvent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchEvent();
    return () => { cancelled = true; };
  }, [id]);

  const handleBookNow = () => {
    if (!event) return;
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
    });
  };

  if (loading) return <div className="event-detail-page"><p className="event-detail-loading">Loading...</p></div>;
  if (error || !event) {
    return (
      <div className="event-detail-page">
        <button type="button" className="event-detail-back" onClick={() => navigate(-1)}>← Back</button>
        <p className="event-detail-error">{error || "Event not found"}</p>
      </div>
    );
  }

  return (
    <div className="event-detail-page">
      <button type="button" className="event-detail-back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="event-detail-hero">
        <div
          className="event-detail-image"
          style={{
            backgroundImage: `url(${
              event.image_url ||
              "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80"
            })`,
          }}
        />
        <h1 className="event-detail-title">{event.title}</h1>
        {event.partner_name && (
          <p className="event-detail-venue">
            At {event.partner_name}
            {event.partner_id && (
              <button
                type="button"
                className="event-detail-venue-link"
                onClick={() => navigate(`/venue/${event.partner_id}`)}
              >
                View venue
              </button>
            )}
          </p>
        )}
      </div>

      <section className="event-detail-section">
        {(event.start_date || event.end_date) && (
          <div className="event-detail-meta">
            {event.start_date && (
              <p><strong>Start:</strong> {formatDateTime(event.start_date)}</p>
            )}
            {event.end_date && (
              <p><strong>End:</strong> {formatDateTime(event.end_date)}</p>
            )}
          </div>
        )}

        {(event.discounted_price != null || event.original_price != null) && (
          <div className="event-detail-price">
            <span className="event-detail-price-current">
              {formatPrice(event.discounted_price ?? event.original_price)}
            </span>
            {event.original_price != null &&
              event.discounted_price != null &&
              event.original_price > event.discounted_price && (
                <span className="event-detail-price-original">
                  {formatPrice(event.original_price)}
                </span>
              )}
          </div>
        )}

        {event.description && (
          <div className="event-detail-description">
            <h2>About</h2>
            <p>{event.description}</p>
          </div>
        )}

        {event.terms_conditions && (
          <div className="event-detail-terms">
            <h2>Terms</h2>
            <p>{event.terms_conditions}</p>
          </div>
        )}

        <div className="event-detail-actions">
          <button type="button" className="event-detail-btn-primary" onClick={handleBookNow}>
            Book now
          </button>
          <button type="button" className="event-detail-btn-secondary" onClick={() => navigate("/events")}>
            View all events
          </button>
        </div>
      </section>

      <style>{`
        .event-detail-page { max-width: 700px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
        .event-detail-back { background: none; border: none; color: #333; cursor: pointer; font-size: 1rem; margin-bottom: 0.5rem; }
        .event-detail-back:hover { text-decoration: underline; }
        .event-detail-loading, .event-detail-error { color: #666; margin: 1rem 0; }
        .event-detail-error { color: #b91c1c; }
        .event-detail-hero { margin-bottom: 1.5rem; }
        .event-detail-image { height: 280px; border-radius: 12px; background: #f0f0f0; background-size: cover; background-position: center; }
        .event-detail-title { margin: 1rem 0 0.25rem 0; font-size: 1.75rem; }
        .event-detail-venue { color: #666; font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .event-detail-venue-link { background: none; border: none; color: var(--primary-color, #2563eb); cursor: pointer; text-decoration: underline; font-size: 0.95rem; }
        .event-detail-section { margin-top: 1rem; }
        .event-detail-meta { margin-bottom: 1rem; color: #444; }
        .event-detail-meta p { margin: 0.25rem 0; }
        .event-detail-price { margin-bottom: 1rem; }
        .event-detail-price-current { font-weight: 700; font-size: 1.25rem; }
        .event-detail-price-original { color: #999; text-decoration: line-through; margin-left: 0.5rem; font-size: 1rem; }
        .event-detail-description, .event-detail-terms { margin-bottom: 1.5rem; }
        .event-detail-description h2, .event-detail-terms h2 { font-size: 1.1rem; margin: 0 0 0.5rem 0; }
        .event-detail-description p, .event-detail-terms p { color: #444; line-height: 1.5; margin: 0; }
        .event-detail-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.5rem; }
        .event-detail-btn-primary { padding: 12px 24px; border-radius: 8px; background: var(--primary-color, #2563eb); color: #fff; border: none; font-weight: 600; cursor: pointer; }
        .event-detail-btn-secondary { padding: 12px 24px; border-radius: 8px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; font-weight: 500; cursor: pointer; }
      `}</style>
    </div>
  );
};

export default EventDetailPage;
