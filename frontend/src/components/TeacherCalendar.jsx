import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { MdCalendarMonth, MdLocationOn, MdAccessTime, MdRefresh } from "react-icons/md";
import { API_BASE_URL } from "../api.js";

const dateTime = (value, allDay = false) => {
  if (!value) return "Date to be confirmed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-IN", allDay
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }
  ).format(date);
};

export default function TeacherCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/teacher-portal/calendar");
      setEvents(Array.isArray(response.data?.events) ? response.data.events : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "School calendar events could not be loaded.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  return (
    <section className="teacher-calendar-page" aria-label="School calendar events">
      <div className="teacher-calendar-toolbar">
        <div><strong>Events shared with teachers</strong><p>Only events addressed to everyone or teachers are shown here.</p></div>
        <button type="button" onClick={loadEvents} disabled={loading}><MdRefresh aria-hidden="true" /> {loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading ? (
        <div className="teacher-calendar-empty" role="status">Loading school events…</div>
      ) : events.length ? (
        <div className="teacher-calendar-list">
          {events.map((event) => (
            <article className="teacher-calendar-event" key={event.id}>
              <span className="teacher-calendar-event-icon"><MdCalendarMonth aria-hidden="true" /></span>
              <div className="teacher-calendar-event-copy">
                <strong>{event.title}</strong>
                <span><MdAccessTime aria-hidden="true" /> {dateTime(event.startsAt, event.allDay)}</span>
                {event.location && <small><MdLocationOn aria-hidden="true" /> {event.location}</small>}
                {event.description && <p>{event.description}</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="teacher-calendar-empty"><MdCalendarMonth aria-hidden="true" /><strong>No upcoming school events</strong><span>Events shared with teachers will appear here.</span></div>
      )}
    </section>
  );
}
