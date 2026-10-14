import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { MdRefresh, MdCheckCircle, MdErrorOutline, MdHistory, MdShield, MdSave } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import "../family-data-requests.css";

const STATUSES = [
  ["submitted", "Submitted"],
  ["under_review", "Under review"],
  ["action_required", "Action required"],
  ["completed", "Completed"],
  ["declined", "Declined"],
];
const TYPES = {
  access_copy: "Copy of records",
  correction: "Record correction",
  consent_withdrawal: "Consent update",
  retention_review: "Retention review",
};
const CLOSED_STATUSES = new Set(["completed", "declined"]);

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
function errorText(error) {
  const errors = error?.response?.data?.errors;
  const fieldError = errors && Object.values(errors).find(Boolean);
  return fieldError || error?.response?.data?.message || "The request could not be updated. Please try again.";
}
function headersFor(organizationId, branchId) {
  return {
    "x-auth-token": localStorage.getItem("token") || "",
    ...(organizationId ? { "x-organization-id": organizationId } : {}),
    ...(branchId ? { "x-branch-id": branchId } : {}),
  };
}

export default function FamilyDataRequestsPanel({ organizationId, branchId }) {
  const [requests, setRequests] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/saas/privacy-requests", {
        headers: headersFor(organizationId, branchId),
        params: {
          limit: 100,
          ...(filter === "open" ? {} : { status: filter }),
        },
      });
      const loaded = Array.isArray(response.data?.requests) ? response.data.requests : [];
      setRequests(loaded);
      setDrafts((current) => {
        const next = {};
        for (const request of loaded) {
          next[request.id] = current[request.id] || {
            status: request.status,
            publicResponse: request.publicResponse || "",
            internalNotes: request.internalNotes || "",
          };
        }
        return next;
      });
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [organizationId, branchId, filter]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const updateDraft = (requestId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] || {}), [field]: value },
    }));
    setSuccess("");
  };

  const saveReview = async (request) => {
    const draft = drafts[request.id];
    if (!draft) return;
    setSavingId(request.id);
    setError("");
    setSuccess("");
    try {
      const response = await axios.patch(
        API_BASE_URL + "/api/saas/privacy-requests/" + encodeURIComponent(request.id) + "/status",
        {
          status: draft.status,
          publicResponse: draft.publicResponse,
          internalNotes: draft.internalNotes,
        },
        { headers: headersFor(organizationId, branchId) },
      );
      setRequests((current) => current.map((item) => item.id === request.id ? response.data.request : item));
      setDrafts((current) => ({
        ...current,
        [request.id]: {
          status: response.data.request.status,
          publicResponse: response.data.request.publicResponse || "",
          internalNotes: response.data.request.internalNotes || "",
        },
      }));
      setSuccess("Review update saved. The family can see the public response and status.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSavingId("");
    }
  };

  const openCount = requests.filter((request) => !CLOSED_STATUSES.has(request.status)).length;

  return (
    <section className="saas-section family-data-requests-panel">
      <div className="saas-section-heading">
        <div>
          <h2>Family data requests</h2>
          <p>Review requests from verified parents, post a family-facing update and keep private staff notes separate.</p>
        </div>
        <button type="button" className="saas-secondary-button" onClick={loadRequests} disabled={loading || Boolean(savingId)}><MdRefresh aria-hidden="true" /> Refresh</button>
      </div>

      {(error || success) && (
        <div className={"saas-message " + (error ? "error" : "success")} role={error ? "alert" : "status"}>
          {error ? <MdErrorOutline aria-hidden="true" /> : <MdCheckCircle aria-hidden="true" />}
          <span>{error || success}</span>
          <button type="button" onClick={() => { setError(""); setSuccess(""); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="family-request-trust-note">
        <MdShield aria-hidden="true" />
        <div><strong>Review requests manually</strong><p>This queue does not automatically export, change or erase child records. Verify the requester and applicable retention requirements before fulfilling a request. Do not copy medical, password or payment-card details into the public reply or internal notes.</p></div>
      </div>

      <div className="family-request-filter-row">
        <label>Show requests
          <select value={filter} onChange={(event) => setFilter(event.target.value)} disabled={loading || Boolean(savingId)}>
            <option value="open">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="action_required">Action required</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <span>{requests.length} shown {filter === "open" ? "· " + openCount + " still open" : ""}</span>
      </div>

      {loading && !requests.length ? <div className="saas-loading" role="status">Loading family requests…</div> : requests.length ? (
        <div className="family-data-request-list">
          {requests.map((request) => {
            const draft = drafts[request.id] || { status: request.status, publicResponse: request.publicResponse || "", internalNotes: request.internalNotes || "" };
            const closed = CLOSED_STATUSES.has(request.status);
            const label = TYPES[request.requestType] || request.requestType;
            return (
              <article className="family-staff-request-card" key={request.id}>
                <div className="family-staff-request-header">
                  <div>
                    <span className="family-staff-request-type">{label}</span>
                    <h3>{request.child?.name || "Child record"}{request.child?.className ? " · " + request.child.className : ""}</h3>
                    <p>{request.branch?.name || "Branch"} · Submitted {dateLabel(request.submittedAt)}</p>
                  </div>
                  <span className={"saas-pill " + request.status}>{request.status.replaceAll("_", " ")}</span>
                </div>

                <div className="family-staff-request-meta">
                  <div><span>Parent account</span><strong>{request.requester?.name || "Verified parent"}</strong><small>{request.requester?.email || ""}</small></div>
                  <div><span>Preferred reply</span><strong>{({ portal: "Parent portal", email: "Verified email", phone: "Verified phone" })[request.contactPreference] || "Parent portal"}</strong></div>
                </div>

                <div className="family-staff-request-description"><strong>Request details</strong><p>{request.description}</p></div>
                {request.history?.length > 0 && (
                  <details className="family-staff-request-history">
                    <summary><MdHistory aria-hidden="true" /> Status history ({request.history.length})</summary>
                    {request.history.map((item, index) => (
                      <div key={item.status + index}><span className={"saas-pill " + item.status}>{item.status.replaceAll("_", " ")}</span><small>{dateLabel(item.createdAt)}</small>{item.publicMessage && <p>{item.publicMessage}</p>}</div>
                    ))}
                  </details>
                )}

                {request.status !== "completed" && request.status !== "declined" && (
                  <div className="family-request-review-form">
                    <div className="family-request-review-heading"><h4>Review and respond</h4><p>Public response is visible to the parent. Internal notes stay staff-only.</p></div>
                    <label>Request status
                      <select value={draft.status} onChange={(event) => updateDraft(request.id, "status", event.target.value)} disabled={savingId === request.id}>
                        {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                      </select>
                    </label>
                    <label>Message for the family
                      <textarea value={draft.publicResponse} onChange={(event) => updateDraft(request.id, "publicResponse", event.target.value)} rows="3" maxLength={600} placeholder="Explain the next step or how the request was handled." disabled={savingId === request.id} />
                      <small>Required when asking the family for more information, completing or declining a request.</small>
                    </label>
                    <label>Internal staff note
                      <textarea value={draft.internalNotes} onChange={(event) => updateDraft(request.id, "internalNotes", event.target.value)} rows="2" maxLength={2000} placeholder="Minimal operational notes, no medical details or secrets." disabled={savingId === request.id} />
                    </label>
                    <div className="family-request-review-footer"><span>Every status update is recorded in the audit trail.</span><button type="button" className="saas-primary-button" onClick={() => saveReview(request)} disabled={savingId === request.id}><MdSave aria-hidden="true" /> {savingId === request.id ? "Saving…" : "Save review"}</button></div>
                  </div>
                )}

                {request.status === "completed" && <div className="family-request-terminal-note"><MdCheckCircle aria-hidden="true" /><span>Request completed {request.completedAt ? "· " + dateLabel(request.completedAt) : ""}. The family-facing response is shown in its portal.</span></div>}
                {request.status === "declined" && <div className="family-request-terminal-note declined"><MdShield aria-hidden="true" /><span>Request declined {request.completedAt ? "· " + dateLabel(request.completedAt) : ""}. The family-facing response is shown in its portal.</span></div>}
              </article>
            );
          })}
        </div>
      ) : !loading ? (
        <div className="saas-empty-state"><span className="saas-empty-icon"><MdShield aria-hidden="true" /></span><strong>No family requests found</strong><p>Parent requests will appear here after a verified guardian submits one. Try a different status filter or refresh.</p></div>
      ) : <div className="saas-loading" role="status">Loading family requests…</div>}
    </section>
  );
}
