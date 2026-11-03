import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { MdCampaign, MdPoll, MdRefresh, MdSend, MdMarkEmailRead } from "react-icons/md";
import { API_BASE_URL } from "../api.js";

const emptyMessage = { title: "", message: "", audience: "all", priority: "normal", startsAt: "", expiresAt: "" };
const emptyPoll = { title: "", message: "", audience: "all", options: "", endsAt: "" };
const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const localDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

async function request(path, { method = "GET", data, organizationId, branchId } = {}) {
  const token = localStorage.getItem("token");
  const response = await axios({
    url: API_BASE_URL + path,
    method,
    data,
    headers: {
      ...(token ? { "x-auth-token": token } : {}),
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
      ...(branchId ? { "x-branch-id": branchId } : {}),
    },
  });
  return response.data;
}

export default function TenantCommunicationPanel({ organizationId, branchId, role, canManage = false }) {
  const [tab, setTab] = useState("messages");
  const [items, setItems] = useState([]);
  const [messageDraft, setMessageDraft] = useState(emptyMessage);
  const [pollDraft, setPollDraft] = useState(emptyPoll);
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = canManage ? "/api/saas/communications/manage" : "/api/saas/communications";
      const result = await request(endpoint, { organizationId, branchId: branchId || undefined });
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "School communications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, branchId, canManage]);

  useEffect(() => { load(); }, [load]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!canManage || !branchId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await request("/api/saas/communications/messages", {
        method: "POST",
        organizationId,
        branchId,
        data: {
          ...messageDraft,
          startsAt: messageDraft.startsAt ? new Date(messageDraft.startsAt).toISOString() : new Date().toISOString(),
          expiresAt: messageDraft.expiresAt ? new Date(messageDraft.expiresAt).toISOString() : null,
        },
      });
      setMessageDraft(emptyMessage);
      setSuccess("Message published to the selected audience in this branch.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The message could not be sent.");
    } finally { setSaving(false); }
  };

  const publishPoll = async (event) => {
    event.preventDefault();
    if (!canManage || !branchId) return;
    const options = pollDraft.options.split("\n").map((value) => value.trim()).filter(Boolean);
    setSaving(true); setError(""); setSuccess("");
    try {
      await request("/api/saas/communications/polls", {
        method: "POST",
        organizationId,
        branchId,
        data: {
          title: pollDraft.title,
          message: pollDraft.message,
          audience: pollDraft.audience,
          options,
          endsAt: new Date(pollDraft.endsAt + "T23:59:00").toISOString(),
        },
      });
      setPollDraft(emptyPoll);
      setSuccess("Poll published to the selected audience in this branch.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The poll could not be published.");
    } finally { setSaving(false); }
  };

  const markRead = async (item) => {
    setBusyId(item.id); setError(""); setSuccess("");
    try {
      await request("/api/saas/communications/" + item.id + "/read", { method: "POST", organizationId, branchId });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, hasRead: true } : entry));
      setSuccess("Message marked as read.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The message could not be updated.");
    } finally { setBusyId(""); }
  };

  const vote = async (item) => {
    const optionIndex = selections[item.id];
    if (optionIndex === undefined) { setError("Choose an option before submitting your vote."); return; }
    setBusyId(item.id); setError(""); setSuccess("");
    try {
      await request("/api/saas/communications/" + item.id + "/vote", {
        method: "POST", organizationId, branchId, data: { optionIndex: Number(optionIndex) },
      });
      setSuccess("Your vote has been recorded.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your vote could not be saved.");
    } finally { setBusyId(""); }
  };

  const changeStatus = async (item) => {
    setBusyId(item.id); setError(""); setSuccess("");
    try {
      await request("/api/saas/communications/" + item.id + "/status", {
        method: "PATCH", organizationId, branchId,
        data: { status: item.status === "archived" ? "active" : "archived" },
      });
      setSuccess(item.status === "archived" ? "Communication restored." : "Communication archived.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The communication could not be updated.");
    } finally { setBusyId(""); }
  };

  const visibleItems = items.filter((item) => item.type === (tab === "messages" ? "message" : "poll"));
  const audienceLabel = (value) => value === "all" ? "Parents & staff" : value === "parents" ? "Parents" : "Staff";
  const activeCount = items.filter((item) => item.status === "active").length;

  return (
    <section className="saas-section tenant-notices-section">
      <div className="saas-section-heading">
        <div><h2>Messages & polls</h2><p>Share school updates and collect feedback inside the parent and staff portals.</p></div>
        <button type="button" className="saas-secondary-button" onClick={load} disabled={loading || saving}><MdRefresh aria-hidden="true" /> Refresh</button>
      </div>
      {error && <div className="saas-message error" role="alert">{error}</div>}
      {success && <div className="saas-message success" role="status">{success}</div>}
      {canManage && !branchId && <div className="saas-message error" role="status">Choose a branch above to send a message or publish a poll. You can still review communications across your accessible branches.</div>}
      <div className="tenant-communication-tabs" role="tablist" aria-label="School communication types">
        <button type="button" role="tab" aria-selected={tab === "messages"} className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}><MdCampaign /> Messages</button>
        <button type="button" role="tab" aria-selected={tab === "polls"} className={tab === "polls" ? "active" : ""} onClick={() => setTab("polls")}><MdPoll /> Polls</button>
      </div>

      {canManage && tab === "messages" && (
        <form className="saas-form-card tenant-notice-form mt-3" onSubmit={sendMessage}>
          <div className="saas-form-heading"><div><h3>Send a school message</h3><p>Publish an update to parents, staff or everyone at the selected branch.</p></div></div>
          <div className="saas-form-grid">
            <label>Title *<input value={messageDraft.title} onChange={(event) => setMessageDraft({ ...messageDraft, title: event.target.value })} required minLength={3} maxLength={160} placeholder="e.g. Updated school timings" /></label>
            <label>Audience *<select value={messageDraft.audience} onChange={(event) => setMessageDraft({ ...messageDraft, audience: event.target.value })}><option value="all">Parents and staff</option><option value="parents">Parents only</option><option value="staff">Staff only</option></select></label>
            <label>Priority<select value={messageDraft.priority} onChange={(event) => setMessageDraft({ ...messageDraft, priority: event.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
            <label>Show from<input type="datetime-local" value={messageDraft.startsAt} onChange={(event) => setMessageDraft({ ...messageDraft, startsAt: event.target.value })} /></label>
            <label>Hide after (optional)<input type="datetime-local" min={messageDraft.startsAt || undefined} value={messageDraft.expiresAt} onChange={(event) => setMessageDraft({ ...messageDraft, expiresAt: event.target.value })} /></label>
          </div>
          <label className="tenant-notice-message-field">Message *<textarea value={messageDraft.message} onChange={(event) => setMessageDraft({ ...messageDraft, message: event.target.value })} rows={4} required maxLength={3000} placeholder="Write the update or instruction…" /></label>
          <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving || !branchId}>{saving ? "Sending…" : "Send message"}</button></div>
        </form>
      )}

      {canManage && tab === "polls" && (
        <form className="saas-form-card tenant-notice-form mt-3" onSubmit={publishPoll}>
          <div className="saas-form-heading"><div><h3>Create a poll</h3><p>Ask parents, staff or everyone at the selected branch to vote. Individual votes remain private.</p></div></div>
          <div className="saas-form-grid">
            <label>Question *<input value={pollDraft.title} onChange={(event) => setPollDraft({ ...pollDraft, title: event.target.value })} required minLength={5} maxLength={160} placeholder="e.g. Which day works for the family event?" /></label>
            <label>Audience *<select value={pollDraft.audience} onChange={(event) => setPollDraft({ ...pollDraft, audience: event.target.value })}><option value="all">Parents and staff</option><option value="parents">Parents only</option><option value="staff">Staff only</option></select></label>
            <label>Voting closes *<input type="date" value={pollDraft.endsAt} onChange={(event) => setPollDraft({ ...pollDraft, endsAt: event.target.value })} required /></label>
          </div>
          <label className="tenant-notice-message-field">Description (optional)<textarea value={pollDraft.message} onChange={(event) => setPollDraft({ ...pollDraft, message: event.target.value })} rows={2} maxLength={3000} /></label>
          <label className="tenant-notice-message-field">Options (one per line, 2–6) *<textarea value={pollDraft.options} onChange={(event) => setPollDraft({ ...pollDraft, options: event.target.value })} rows={4} required placeholder={"Saturday\nSunday"} /></label>
          <div className="saas-form-actions"><button type="submit" className="saas-primary-button" disabled={saving || !branchId}>{saving ? "Publishing…" : "Publish poll"}</button></div>
        </form>
      )}

      <div className="tenant-notice-list-heading mt-4">
        <div><h3>{canManage ? "Communication history" : tab === "messages" ? "Messages from school" : "School polls"}</h3><p>{canManage ? "Manage messages and polls for branches within your access scope." : "Items are limited to your organization, role and connected branches."}</p></div>
        <span className="tenant-notice-count">{visibleItems.length} {visibleItems.length === 1 ? "item" : "items"} · {activeCount} active</span>
      </div>
      {loading ? <div className="saas-loading" role="status">Loading communications…</div> : visibleItems.length ? (
        <div className="tenant-notice-list">
          {visibleItems.map((item) => (
            <article className={"tenant-notice-card priority-" + (item.priority || "normal") + (item.status === "archived" ? " archived" : "")} key={item.id}>
              <div className="tenant-notice-card-top"><div className="tenant-notice-badges">
                <span className="tenant-notice-priority">{item.priority || "normal"}</span>
                <span className="tenant-notice-audience">{audienceLabel(item.audience)}</span>
                {item.status === "archived" && <span className="saas-pill archived">Archived</span>}
                {item.branch?.name && <span className="tenant-notice-branch">{item.branch.name}</span>}
              </div></div>
              <h3>{item.title}</h3>
              {item.message && <p className="tenant-notice-message">{item.message}</p>}
              <div className="tenant-notice-meta"><span>Posted {dateLabel(item.createdAt)}</span><span>{item.type === "poll" ? "Voting closes " + dateLabel(item.endsAt) : item.expiresAt ? "Hide after " + dateLabel(item.expiresAt) : "No end date"}</span></div>
              {item.type === "message" && !canManage && !item.hasRead && item.status === "active" && <button type="button" className="saas-secondary-button mt-2" onClick={() => markRead(item)} disabled={busyId === item.id}><MdMarkEmailRead /> Mark as read</button>}
              {item.type === "message" && canManage && <small className="text-secondary">{item.readCount || 0} read confirmations</small>}
              {item.type === "poll" && (
                <div className="mt-3">
                  {(item.options || []).map((option, index) => {
                    const count = item.results?.[index] || 0;
                    const percent = item.totalVotes ? Math.round(count / item.totalVotes * 100) : 0;
                    const canVote = !canManage && !item.hasVoted && item.status === "active" && item.endsAt && new Date(item.endsAt).getTime() > Date.now();
                    return (
                      <div className="school-communication-result" key={option}>
                        {canVote
                          ? <label className="d-flex align-items-center gap-2"><input type="radio" name={"tenant-poll-" + item.id} checked={String(selections[item.id]) === String(index)} onChange={() => setSelections((current) => ({ ...current, [item.id]: String(index) }))} />{option}</label>
                          : <div><span>{option}</span><strong>{count} · {percent}%</strong></div>}
                        {!canVote && <i><b style={{ width: percent + "%" }} /></i>}
                      </div>
                    );
                  })}
                  <small className="d-block text-secondary mt-2">{item.totalVotes || 0} vote{item.totalVotes === 1 ? "" : "s"} · {item.hasVoted ? "Your vote is recorded" : item.status === "archived" ? "Archived" : "Results shown as totals"}</small>
                  {!canManage && !item.hasVoted && item.status === "active" && item.endsAt && new Date(item.endsAt).getTime() > Date.now() && <button type="button" className="saas-primary-button mt-2" onClick={() => vote(item)} disabled={busyId === item.id}>{busyId === item.id ? "Submitting…" : "Submit vote"}</button>}
                </div>
              )}
              {canManage && <div className="tenant-notice-actions"><button type="button" className="saas-text-button" onClick={() => changeStatus(item)} disabled={busyId === item.id}>{item.status === "archived" ? "Restore" : "Archive"}</button></div>}
            </article>
          ))}
        </div>
      ) : <div className="saas-empty-state"><strong>No {tab === "messages" ? "school messages" : "polls"} yet</strong><p>{canManage ? "Publish an update or create a poll for this branch." : "Updates shared with your role will appear here."}</p></div>}
    </section>
  );
}
