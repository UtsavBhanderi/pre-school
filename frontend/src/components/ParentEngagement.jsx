import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { MdAssignment, MdFeedback, MdPoll, MdSend, MdRefresh, MdCampaign } from "react-icons/md";
import { API_BASE_URL } from "../api.js";

const CATEGORIES = [
  ["general", "General question"], ["fees", "Fees"], ["classroom", "Classroom / learning"],
  ["transport", "Transport"], ["food", "Food"], ["health", "Health"],
  ["safety", "Safety"], ["staff", "Staff"], ["other", "Other"],
];

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

async function request(path, method, data) {
  const token = localStorage.getItem("token");
  const response = await axios({
    url: API_BASE_URL + path,
    method: method || "GET",
    data,
    headers: token ? { "x-auth-token": token } : {},
  });
  return response.data;
}

function Empty({ title, detail }) {
  return <div className="legacy-parent-empty"><strong>{title}</strong><p className="mb-0 mt-1">{detail}</p></div>;
}

export default function ParentEngagement() {
  const [tab, setTab] = useState("homework");
  const [children, setChildren] = useState([]);
  const [homework, setHomework] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [polls, setPolls] = useState([]);
  const [schoolMessages, setSchoolMessages] = useState([]);
  const [form, setForm] = useState({ studentId: "", category: "general", subject: "", message: "" });
  const [notes, setNotes] = useState({});
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const childResult = await request("/api/parent-portal/children");
      const childRows = Array.isArray(childResult.children) ? childResult.children : [];
      setChildren(childRows);
      setForm((old) => ({ ...old, studentId: old.studentId || childRows[0]?.id || "" }));
      const [homeworkResult, complaintResult, pollResult, messageResult] = await Promise.all([
        request("/api/school-engagement/parent/homework"),
        request("/api/school-engagement/parent/complaints"),
        request("/api/school-engagement/parent/polls"),
        request("/api/school-engagement/parent/messages"),
      ]);
      setHomework(homeworkResult.homework || []);
      setComplaints(complaintResult.complaints || []);
      setPolls(pollResult.polls || []);
      setSchoolMessages(messageResult.messages || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Parent engagement information could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completeHomework = async (assignmentId, studentId) => {
    const key = assignmentId + ":" + studentId;
    setBusy(key); setError(""); setMessage("");
    try {
      const result = await request("/api/school-engagement/parent/homework/" + assignmentId + "/submissions", "POST", {
        studentId,
        responseText: notes[key] || "",
      });
      setMessage(result.message || "Homework marked as completed.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Homework response could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const sendComplaint = async (event) => {
    event.preventDefault();
    setBusy("complaint"); setError(""); setMessage("");
    try {
      const result = await request("/api/school-engagement/parent/complaints", "POST", form);
      setMessage(result.message || "Your message has been sent privately to the school.");
      setForm((old) => ({ ...old, subject: "", message: "" }));
      const resultList = await request("/api/school-engagement/parent/complaints");
      setComplaints(resultList.complaints || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your message could not be sent.");
    } finally {
      setBusy("");
    }
  };

  const markSchoolMessageRead = async (item) => {
    setBusy("message:" + item.id); setError(""); setMessage("");
    try {
      await request("/api/school-engagement/parent/messages/" + item.id + "/read", "POST");
      setSchoolMessages((current) => current.map((message) => message.id === item.id ? { ...message, hasRead: true } : message));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The message could not be updated.");
    } finally { setBusy(""); }
  };

  const vote = async (pollId) => {
    if (selections[pollId] === undefined) {
      setError("Choose an option before submitting your vote.");
      return;
    }
    setBusy("poll:" + pollId); setError(""); setMessage("");
    try {
      const result = await request("/api/school-engagement/parent/polls/" + pollId + "/votes", "POST", {
        optionIndex: Number(selections[pollId]),
      });
      setMessage(result.message || "Your vote has been recorded.");
      const resultList = await request("/api/school-engagement/parent/polls");
      setPolls(resultList.polls || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your vote could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const sections = [
    { id: "homework", label: "Homework", icon: MdAssignment },
    { id: "complaints", label: "Messages to school", icon: MdFeedback },
    { id: "polls", label: "Polls", icon: MdPoll },
    { id: "schoolMessages", label: "From school", icon: MdCampaign },
  ];

  return (
    <section className="legacy-parent-panel">
      <div className="legacy-parent-panel-heading">
        <div><h2>Family engagement</h2><p>Stay connected with your child’s classroom and preschool team.</p></div>
        <button type="button" className="legacy-parent-secondary-btn" onClick={load} disabled={loading}><MdRefresh /> Refresh</button>
      </div>
      <div className="parent-engagement-tabs" role="tablist" aria-label="Family engagement">
        {sections.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setError(""); setMessage(""); }}>
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {error && <div className="legacy-parent-alert error" role="alert">{error}</div>}
      {message && <div className="legacy-parent-alert success" role="status">{message}</div>}
      {loading ? <div className="legacy-parent-empty" role="status">Loading family engagement…</div> : (
        <>
          {tab === "homework" && (
            <div className="legacy-parent-card-list">
              {homework.length ? homework.map((item) => (
                <article className="legacy-parent-card" key={item.id}>
                  <div className="legacy-parent-panel-heading">
                    <div><h3>{item.title}</h3><small>{item.standard === "all" ? "All classes" : item.standard} · Due {formatDate(item.dueDate)}</small></div>
                    <span className="legacy-parent-status due">Homework</span>
                  </div>
                  <p className="parent-engagement-preserve">{item.instructions}</p>
                  <div className="parent-engagement-child-list">
                    {(item.children || []).map((child) => {
                      const key = item.id + ":" + child.id;
                      return (
                        <div className="parent-engagement-child" key={child.id}>
                          <div><strong>{child.name}</strong><small>GR No. {child.admissionNumber || "—"}</small></div>
                          {child.submitted ? (
                            <span className="legacy-parent-status paid">Completed · {formatDate(child.submittedAt)}</span>
                          ) : (
                            <div className="parent-engagement-homework-action">
                              <textarea rows="2" maxLength={1200} value={notes[key] || ""} onChange={(event) => setNotes((old) => ({ ...old, [key]: event.target.value }))} placeholder="Optional note for the teacher" aria-label={"Note for " + child.name} />
                              <button type="button" className="legacy-parent-primary-btn" disabled={busy === key} onClick={() => completeHomework(item.id, child.id)}>{busy === key ? "Saving…" : "Mark completed"}</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              )) : <Empty title="No homework right now" detail="New classwork and activities assigned to your children will appear here." />}
            </div>
          )}

          {tab === "complaints" && (
            <>
              <form className="legacy-parent-form parent-engagement-form" onSubmit={sendComplaint}>
                <h3>Send a private message</h3>
                <p>Messages are visible only to your family and authorised school staff.</p>
                <label>Child
                  <select value={form.studentId} onChange={(event) => setForm((old) => ({ ...old, studentId: event.target.value }))} required>
                    <option value="">Select child</option>
                    {children.map((child) => <option value={child.id} key={child.id}>{child.name} · {child.className || "Class not assigned"}</option>)}
                  </select>
                </label>
                <label>Category
                  <select value={form.category} onChange={(event) => setForm((old) => ({ ...old, category: event.target.value }))}>
                    {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Subject
                  <input value={form.subject} onChange={(event) => setForm((old) => ({ ...old, subject: event.target.value }))} minLength={3} maxLength={120} required placeholder="What would you like to discuss?" />
                </label>
                <label>Message
                  <textarea value={form.message} onChange={(event) => setForm((old) => ({ ...old, message: event.target.value }))} rows="4" minLength={5} maxLength={3000} required placeholder="Share the details so the preschool team can help." />
                </label>
                <button className="legacy-parent-primary-btn" type="submit" disabled={busy === "complaint" || !children.length}>{busy === "complaint" ? "Sending…" : "Send to school"}</button>
              </form>
              <div className="legacy-parent-panel-heading mt-3"><div><h3>Your messages</h3><p>Track the follow-up status and replies from the preschool.</p></div><span>{complaints.length} messages</span></div>
              {complaints.length ? <div className="legacy-parent-card-list">{complaints.map((item) => (
                <article className="legacy-parent-card" key={item.id}>
                  <div className="legacy-parent-panel-heading">
                    <div><h3>{item.subject}</h3><small>{item.child?.name || "Your child"} · {item.category} · {formatDate(item.createdAt)}</small></div>
                    <span className={"legacy-parent-status " + (item.status === "resolved" ? "paid" : item.status === "in_progress" ? "due" : "absent")}>{item.status.replace("_", " ")}</span>
                  </div>
                  <p className="parent-engagement-preserve">{item.message}</p>
                  {item.schoolReply && <div className="parent-engagement-reply"><strong>Reply from school</strong><p>{item.schoolReply}</p><small>{formatDate(item.respondedAt)}</small></div>}
                </article>
              ))}</div> : <Empty title="No messages yet" detail="Your private messages and school replies will appear here." />}
            </>
          )}

          {tab === "schoolMessages" && (
            <div className="legacy-parent-card-list">
              {schoolMessages.length ? schoolMessages.map((item) => (
                <article className="legacy-parent-card" key={item.id}>
                  <div className="legacy-parent-panel-heading">
                    <div><h3>{item.title}</h3><small>{item.priority} · {formatDate(item.createdAt)}</small></div>
                    <span className={"legacy-parent-status " + (item.hasRead ? "paid" : "due")}>{item.hasRead ? "Read" : "New"}</span>
                  </div>
                  <p className="parent-engagement-preserve">{item.message}</p>
                  {!item.hasRead && <button type="button" className="legacy-parent-primary-btn" disabled={busy === "message:" + item.id} onClick={() => markSchoolMessageRead(item)}>{busy === "message:" + item.id ? "Saving…" : "Mark as read"}</button>}
                </article>
              )) : <Empty title="No messages from school" detail="Notices and direct updates from your preschool will appear here." />}
            </div>
          )}

          {tab === "polls" && (
            <div className="legacy-parent-card-list">
              {polls.length ? polls.map((poll) => (
                <article className="legacy-parent-card" key={poll.id}>
                  <div className="legacy-parent-panel-heading">
                    <div><h3>{poll.question}</h3><small>{poll.standard === "all" ? "All classes" : poll.standard} · Closes {formatDate(poll.endsAt)}</small></div>
                    <span className={"legacy-parent-status " + (poll.isActive ? "present" : "due")}>{poll.status}</span>
                  </div>
                  {poll.description && <p>{poll.description}</p>}
                  {(poll.options || []).map((option, index) => {
                    const votes = poll.results?.[index] || 0;
                    const percent = poll.totalVotes ? Math.round(votes / poll.totalVotes * 100) : 0;
                    return (
                      <div className="parent-engagement-poll-option" key={option}>
                        {!poll.hasVoted && poll.isActive ? (
                          <label><input type="radio" name={"poll-" + poll.id} checked={String(selections[poll.id]) === String(index)} onChange={() => setSelections((old) => ({ ...old, [poll.id]: String(index) }))} /> <span>{option}</span></label>
                        ) : (
                          <div className="parent-engagement-poll-result"><span>{option}</span><strong>{votes} vote{votes === 1 ? "" : "s"} · {percent}%</strong><i><b style={{ width: percent + "%" }} /></i></div>
                        )}
                      </div>
                    );
                  })}
                  {poll.hasVoted && <small className="parent-engagement-note">Your vote has been recorded. Thank you for sharing your view.</small>}
                  {!poll.hasVoted && poll.isActive && <button type="button" className="legacy-parent-primary-btn mt-2" disabled={busy === "poll:" + poll.id} onClick={() => vote(poll.id)}>{busy === "poll:" + poll.id ? "Submitting…" : "Submit my vote"}</button>}
                  {!poll.isActive && <small className="parent-engagement-note">Voting is currently closed.</small>}
                </article>
              )) : <Empty title="No school polls" detail="Polls from your preschool will appear here when they are published." />}
            </div>
          )}
        </>
      )}
    </section>
  );
}
