import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import {
  MdAdd, MdCampaign, MdCheckCircleOutline, MdEdit, MdOutlineArchive,
  MdRefresh, MdSearch, MdSchedule, MdPeopleAlt, MdClose,
} from "react-icons/md";
import "../operations.css";

const createLocalDateTime = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const initialForm = () => ({
  title: "",
  message: "",
  audience: "all",
  priority: "normal",
  startsAt: createLocalDateTime(),
  expiresAt: "",
});

const formatDateTime = (value) => {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date);
};

const PRIORITY_LABELS = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

export default function AnnouncementsPage({ readOnly = false }) {
  const [notices, setNotices] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = readOnly ? "/api/announcements" : "/api/announcements/manage";
      const response = await axios.get(`${API_BASE_URL}${endpoint}`);
      setNotices(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "School notices could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [readOnly]);

  useEffect(() => { loadNotices(); }, [loadNotices]);

  const visibleNotices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notices;
    return notices.filter((notice) =>
      [notice.title, notice.message, notice.audience, notice.priority, notice.createdByName]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [notices, query]);

  const resetForm = () => {
    setForm(initialForm());
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  const beginEdit = (notice) => {
    setForm({
      title: notice.title || "",
      message: notice.message || "",
      audience: notice.audience || "all",
      priority: notice.priority || "normal",
      startsAt: createLocalDateTime(notice.startsAt),
      expiresAt: notice.expiresAt ? createLocalDateTime(notice.expiresAt) : "",
    });
    setEditingId(notice._id);
    setShowForm(true);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const startsAt = new Date(form.startsAt);
    const expiresAt = form.expiresAt ? new Date(form.expiresAt) : null;
    if (Number.isNaN(startsAt.getTime())) {
      setError("Choose a valid start date and time.");
      return;
    }
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt)) {
      setError("The expiry date must be later than the start date.");
      return;
    }

    const payload = {
      ...form,
      title: form.title.trim(),
      message: form.message.trim(),
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = editingId
        ? await axios.put(`${API_BASE_URL}/api/announcements/${editingId}`, payload)
        : await axios.post(`${API_BASE_URL}/api/announcements`, payload);
      setSuccess(response.data?.message || "Notice saved successfully.");
      resetForm();
      await loadNotices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The notice could not be saved. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (notice) => {
    const nextActive = !notice.isActive;
    const action = nextActive ? "reactivate" : "archive";
    if (!window.confirm(`Do you want to ${action} “${notice.title}”? ${nextActive ? "It will be available according to its dates." : "It will no longer appear on the staff notice board."}`)) return;
    setBusyId(notice._id);
    setError("");
    setSuccess("");
    try {
      const response = await axios.patch(`${API_BASE_URL}/api/announcements/${notice._id}/status`, { isActive: nextActive });
      setSuccess(response.data?.message || "Notice status updated.");
      await loadNotices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Notice status could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="ops-page ops-notices-page">
      <section className="ops-help-hero ops-notices-hero">
        <div className="ops-help-hero-icon"><MdCampaign aria-hidden="true" /></div>
        <div>
          <span className="ops-eyebrow">{readOnly ? "FOR YOUR SCHOOL DAY" : "SCHOOL COMMUNICATION"}</span>
          <h2>{readOnly ? "School notices" : "Keep everyone informed."}</h2>
          <p>{readOnly
            ? "Read important reminders, event details and updates shared by your school administrator."
            : "Publish one clear message for staff. Notices can be scheduled, targeted to teachers or everyone, then archived without losing their history."}</p>
        </div>
      </section>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {!readOnly && (
        <section className="ops-notice-compose page-card mb-4">
          <div className="ops-section-heading">
            <div>
              <h3>{editingId ? "Edit notice" : "Create a school notice"}</h3>
              <p>Keep the title clear and the message focused on what staff need to know.</p>
            </div>
            {showForm && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetForm}><MdClose aria-hidden="true" /> Cancel</button>}
          </div>
          {!showForm ? (
            <button type="button" className="ops-button-primary" onClick={() => { setShowForm(true); setError(""); }}>
              <MdAdd aria-hidden="true" /> Write a notice
            </button>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="ops-notice-form-grid">
                <div className="ops-notice-field ops-notice-title-field">
                  <label htmlFor="notice-title" className="form-label">Notice title</label>
                  <input id="notice-title" className="form-control" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} maxLength={120} minLength={3} placeholder="e.g. Parent meeting on Friday" required />
                  <small>3–120 characters</small>
                </div>
                <div className="ops-notice-field">
                  <label htmlFor="notice-priority" className="form-label">Importance</label>
                  <select id="notice-priority" className="form-select" value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}>
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="ops-notice-field">
                  <label htmlFor="notice-audience" className="form-label">Who should see this?</label>
                  <select id="notice-audience" className="form-select" value={form.audience} onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}>
                    <option value="all">All staff</option>
                    <option value="teachers">Teachers</option>
                  </select>
                </div>
                <div className="ops-notice-field">
                  <label htmlFor="notice-start" className="form-label">Show from</label>
                  <input id="notice-start" className="form-control" type="datetime-local" value={form.startsAt} onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))} required />
                </div>
                <div className="ops-notice-field">
                  <label htmlFor="notice-expiry" className="form-label">Hide after <span className="muted fw-normal">(optional)</span></label>
                  <input id="notice-expiry" className="form-control" type="datetime-local" value={form.expiresAt} min={form.startsAt || undefined} onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))} />
                </div>
                <div className="ops-notice-field ops-notice-message-field">
                  <label htmlFor="notice-message" className="form-label">Message</label>
                  <textarea id="notice-message" className="form-control" value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={4} maxLength={3000} placeholder="Write the details in simple language. Include the date, time, place and anything staff need to do." required />
                  <small>{form.message.length}/3000 characters</small>
                </div>
              </div>
              <div className="d-flex gap-2 flex-wrap justify-content-end mt-3">
                <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Publish notice"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="ops-notice-list-section">
        <div className="ops-section-heading">
          <div>
            <h3>{readOnly ? "Latest notices" : "Manage notices"}</h3>
            <p>{readOnly ? "Only active notices within their scheduled dates appear here." : "Archived and scheduled notices remain available for review and editing."}</p>
          </div>
          <button type="button" className="ops-refresh-button" onClick={loadNotices} disabled={loading}>
            <MdRefresh aria-hidden="true" /> {loading ? "Updating…" : "Refresh"}
          </button>
        </div>

        <div className="ops-notice-search">
          <MdSearch aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a notice by title or words in the message" aria-label="Search school notices" />
        </div>

        {loading ? (
          <div className="ops-no-results" role="status">Loading school notices…</div>
        ) : visibleNotices.length ? (
          <div className="ops-notice-list">
            {visibleNotices.map((notice) => (
              <article className={"ops-notice-card" + (!notice.isActive ? " is-archived" : "")} key={notice._id}>
                <div className="ops-notice-card-top">
                  <div className="ops-notice-title-group">
                    <span className={"ops-priority-pill priority-" + (notice.priority || "normal")}>{PRIORITY_LABELS[notice.priority] || "Normal"}</span>
                    {!notice.isActive && <span className="ops-archived-pill">Archived</span>}
                    <h4>{notice.title}</h4>
                  </div>
                  {!readOnly && (
                    <div className="ops-notice-actions">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => beginEdit(notice)} aria-label={"Edit " + notice.title}><MdEdit aria-hidden="true" /> Edit</button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => toggleArchive(notice)} disabled={busyId === notice._id} aria-label={(notice.isActive ? "Archive " : "Reactivate ") + notice.title}>
                        <MdOutlineArchive aria-hidden="true" /> {busyId === notice._id ? "Updating…" : notice.isActive ? "Archive" : "Reactivate"}
                      </button>
                    </div>
                  )}
                </div>
                <p className="ops-notice-message">{notice.message}</p>
                <div className="ops-notice-meta">
                  <span><MdPeopleAlt aria-hidden="true" /> {notice.audience === "teachers" ? "Teachers" : "All staff"}</span>
                  <span><MdSchedule aria-hidden="true" /> From {formatDateTime(notice.startsAt)}</span>
                  <span>Until {formatDateTime(notice.expiresAt)}</span>
                  {notice.createdByName && <span>By {notice.createdByName}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="ops-no-results">
            <MdCampaign aria-hidden="true" />
            <strong>{query ? "No matching notice" : readOnly ? "No current notices" : "No notices yet"}</strong>
            <span>{query ? "Try another word or clear your search." : readOnly ? "When the administrator shares an update, it will appear here." : "Create a notice to keep staff informed about activities, changes and reminders."}</span>
            {query && <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={() => setQuery("")}>Clear search</button>}
          </div>
        )}
      </section>
      <p className="ops-footnote">This is an in-app notice board. It does not send SMS, WhatsApp or email notifications.</p>
    </div>
  );
}
