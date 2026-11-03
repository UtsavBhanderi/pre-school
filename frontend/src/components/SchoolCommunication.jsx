import React, { useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { MdAssignment, MdFeedback, MdPoll, MdRefresh, MdSend, MdCampaign } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import { AuthContext } from "../context/AuthContext.jsx";
import "../school-communication.css";

const INITIAL_HOMEWORK = { title: "", instructions: "", standard: "all", dueDate: "" };
const INITIAL_POLL = { question: "", description: "", standard: "all", audience: "parents", options: "", endsAt: "" };
const INITIAL_MESSAGE = { title: "", message: "", audience: "all", priority: "normal", startsAt: "", expiresAt: "" };
const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const categories = ["general", "fees", "classroom", "transport", "food", "health", "safety", "staff", "other"];

async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const response = await axios({
    url: API_BASE_URL + path,
    method: options.method || "GET",
    data: options.data,
    headers: token ? { "x-auth-token": token } : {},
  });
  return response.data;
}

function SectionTitle({ icon: Icon, title, description, count }) {
  return <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
    <div className="d-flex align-items-start gap-2">
      <span className="rounded-3 p-2 bg-light text-primary"><Icon size={22} /></span>
      <div><h3 className="h5 mb-1">{title}</h3><p className="text-secondary small mb-0">{description}</p></div>
    </div>
    {count !== undefined && <span className="badge text-bg-light border">{count}</span>}
  </div>;
}

export default function SchoolCommunication({ embedded = false }) {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("homework");
  const [classes, setClasses] = useState([]);
  const [homework, setHomework] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [polls, setPolls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageForm, setMessageForm] = useState(INITIAL_MESSAGE);
  const isAdmin = user?.role === "admin";
  const [homeworkForm, setHomeworkForm] = useState(INITIAL_HOMEWORK);
  const [pollForm, setPollForm] = useState(INITIAL_POLL);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [classResult, homeworkResult, complaintResult, pollResult, messageResult] = await Promise.all([
        api("/api/school-engagement/staff/classes"),
        api("/api/school-engagement/staff/homework"),
        api("/api/school-engagement/staff/complaints"),
        api("/api/school-engagement/staff/polls"),
        api("/api/school-engagement/staff/messages"),
      ]);
      setClasses(classResult.classes || []);
      setHomework(homeworkResult.homework || []);
      setComplaints(complaintResult.complaints || []);
      setPolls(pollResult.polls || []);
      setMessages(messageResult.messages || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "School communication records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publishHomework = async (event) => {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/homework", {
        method: "POST",
        data: {
          ...homeworkForm,
          dueDate: new Date(homeworkForm.dueDate + "T23:59:00").toISOString(),
        },
      });
      setHomeworkForm(INITIAL_HOMEWORK);
      setSuccess("Homework has been published to the selected class.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Homework could not be published.");
    } finally {
      setSaving(false);
    }
  };

  const publishPoll = async (event) => {
    event.preventDefault();
    const options = pollForm.options.split("\n").map((option) => option.trim()).filter(Boolean);
    setSaving(true); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/polls", {
        method: "POST",
        data: {
          question: pollForm.question,
          description: pollForm.description,
          standard: isAdmin && pollForm.audience === "parents" ? pollForm.standard : "all",
          audience: isAdmin ? pollForm.audience : "parents",
          options,
          endsAt: new Date(pollForm.endsAt + "T23:59:00").toISOString(),
        },
      });
      setPollForm(INITIAL_POLL);
      setSuccess("Poll published to the selected audience.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Poll could not be published.");
    } finally {
      setSaving(false);
    }
  };

  const sendSchoolMessage = async (event) => {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const startsAt = messageForm.startsAt ? new Date(messageForm.startsAt) : new Date();
      const expiresAt = messageForm.expiresAt ? new Date(messageForm.expiresAt) : null;
      await api("/api/school-engagement/staff/messages", {
        method: "POST",
        data: { ...messageForm, title: messageForm.title.trim(), message: messageForm.message.trim(), startsAt: startsAt.toISOString(), expiresAt: expiresAt ? expiresAt.toISOString() : null },
      });
      setMessageForm(INITIAL_MESSAGE);
      setSuccess("Message sent to the selected audience.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The school message could not be sent.");
    } finally { setSaving(false); }
  };

  const markMessageRead = async (item) => {
    setBusyId(item.id); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/messages/" + item.id + "/read", { method: "POST" });
      setMessages((current) => current.map((message) => message.id === item.id ? { ...message, hasRead: true } : message));
      setSuccess("Message marked as read.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The message could not be updated.");
    } finally { setBusyId(""); }
  };

  const voteInTeacherPoll = async (pollId) => {
    const selected = replyDrafts["poll:" + pollId];
    if (selected === undefined) { setError("Choose an option before submitting your vote."); return; }
    setBusyId(pollId); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/polls/" + pollId + "/votes", { method: "POST", data: { optionIndex: Number(selected) } });
      setSuccess("Your vote has been recorded.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Your vote could not be saved.");
    } finally { setBusyId(""); }
  };

  const updateComplaint = async (complaint) => {
    setBusyId(complaint.id); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/complaints/" + complaint.id, {
        method: "PATCH",
        data: {
          status: statusDrafts[complaint.id] || complaint.status,
          schoolReply: replyDrafts[complaint.id] ?? complaint.schoolReply ?? "",
        },
      });
      setSuccess("Parent message updated. The family can see the new status and reply.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The parent message could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  const setStatus = async (kind, id, isActive) => {
    setBusyId(id); setError(""); setSuccess("");
    try {
      await api("/api/school-engagement/staff/" + kind + "/" + id + "/status", {
        method: "PATCH", data: { isActive },
      });
      setSuccess(isActive ? "Item published." : "Item archived or closed.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The status could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  const nav = [
    { id: "homework", label: "Homework", Icon: MdAssignment },
    { id: "complaints", label: "Parent messages", Icon: MdFeedback },
    { id: "polls", label: "Polls", Icon: MdPoll },
    { id: "messages", label: "School messages", Icon: MdCampaign },
  ];

  return (
    <div className={embedded ? "school-communication embedded" : "school-communication container-fluid py-3"}>
      {!embedded && <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div><h2 className="h3 mb-1">School communication</h2><p className="text-secondary mb-0">Manage updates, homework, polls and conversations across your preschool community.</p></div>
        <span className="text-secondary small">Signed in as {user?.username || user?.role || "Staff"}</span>
      </div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
        <div className="school-communication-tabs" role="tablist" aria-label="School communication sections">
          {nav.map(({ id, label, Icon }) => <button type="button" key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon />{label}</button>)}
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}><MdRefresh className="me-1" />{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {activeTab === "homework" && <div className="row g-3">
        <div className="col-12 col-xl-5">
          <section className="card border-0 shadow-sm h-100">
            <div className="card-body p-3 p-lg-4">
              <SectionTitle icon={MdAssignment} title="Publish homework" description="Share an activity with one class or the whole preschool." />
              <form onSubmit={publishHomework} className="d-grid gap-3">
                <div><label className="form-label small fw-semibold">Homework title</label><input className="form-control" value={homeworkForm.title} onChange={(e) => setHomeworkForm({ ...homeworkForm, title: e.target.value })} minLength={3} maxLength={120} required placeholder="e.g. Practice letter A" /></div>
                <div><label className="form-label small fw-semibold">Instructions</label><textarea className="form-control" rows="4" value={homeworkForm.instructions} onChange={(e) => setHomeworkForm({ ...homeworkForm, instructions: e.target.value })} maxLength={3000} required placeholder="Explain what the child should practise or complete." /></div>
                <div className="row g-2">
                  <div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Send to</label><select className="form-select" value={homeworkForm.standard} onChange={(e) => setHomeworkForm({ ...homeworkForm, standard: e.target.value })}><option value="all">All classes</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Due date</label><input className="form-control" type="date" value={homeworkForm.dueDate} onChange={(e) => setHomeworkForm({ ...homeworkForm, dueDate: e.target.value })} required /></div>
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Publishing…" : "Publish homework"}</button>
              </form>
            </div>
          </section>
        </div>
        <div className="col-12 col-xl-7">
          <section className="card border-0 shadow-sm">
            <div className="card-body p-3 p-lg-4">
              <SectionTitle icon={MdAssignment} title="Published homework" description="See completion notes sent by parents." count={homework.length} />
              {loading ? <p className="text-secondary small mb-0">Loading homework…</p> : homework.length ? <div className="d-grid gap-3">
                {homework.map((item) => <article className="school-communication-item" key={item.id}>
                  <div className="d-flex justify-content-between gap-2 align-items-start"><div><h4>{item.title}</h4><p className="text-secondary small mb-1">{item.standard === "all" ? "All classes" : item.standard} · Due {dateLabel(item.dueDate)}</p></div><button type="button" className={"btn btn-sm " + (item.isActive ? "btn-outline-secondary" : "btn-outline-primary")} onClick={() => setStatus("homework", item.id, !item.isActive)} disabled={busyId === item.id}>{item.isActive ? "Archive" : "Republish"}</button></div>
                  <p className="school-communication-preserve">{item.instructions}</p>
                  <div className="small fw-semibold text-secondary mb-2">{item.submissionCount} completion response{item.submissionCount === 1 ? "" : "s"}</div>
                  {item.submissions?.length > 0 && <div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th>Child</th><th>Parent</th><th>Note</th><th>Submitted</th></tr></thead><tbody>{item.submissions.map((submission, index) => <tr key={item.id + "-" + index}><td>{submission.child}<small className="d-block text-secondary">{submission.admissionNumber}</small></td><td>{submission.parent}</td><td>{submission.responseText || "Completed"}</td><td>{dateLabel(submission.submittedAt)}</td></tr>)}</tbody></table></div>}
                </article>)}
              </div> : <div className="text-secondary small">No homework has been published yet.</div>}
            </div>
          </section>
        </div>
      </div>}

      {activeTab === "complaints" && <section className="card border-0 shadow-sm">
        <div className="card-body p-3 p-lg-4">
          <SectionTitle icon={MdFeedback} title="Messages from parents" description="These are private family messages. Reply here and update the follow-up status." count={complaints.length} />
          {loading ? <p className="text-secondary small">Loading parent messages…</p> : complaints.length ? <div className="d-grid gap-3">
            {complaints.map((item) => <article className="school-communication-item" key={item.id}>
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-2"><div><h4>{item.subject}</h4><div className="small text-secondary">{item.parent} · {item.parentEmail} · {item.child} · {item.className} · {dateLabel(item.createdAt)}</div></div><span className={"badge " + (item.status === "resolved" ? "text-bg-success" : item.status === "in_progress" ? "text-bg-warning" : "text-bg-danger")}>{item.status.replace("_", " ")}</span></div>
              <div className="small text-primary fw-semibold text-capitalize mt-2">{item.category}</div>
              <p className="school-communication-preserve mt-2 mb-3">{item.message}</p>
              <div className="row g-2 align-items-end">
                <div className="col-12 col-md-3"><label className="form-label small fw-semibold">Status</label><select className="form-select form-select-sm" value={statusDrafts[item.id] ?? item.status} onChange={(e) => setStatusDrafts((previous) => ({ ...previous, [item.id]: e.target.value }))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div>
                <div className="col-12 col-md-7"><label className="form-label small fw-semibold">Reply to parent</label><textarea className="form-control form-control-sm" rows="2" maxLength={3000} value={replyDrafts[item.id] ?? item.schoolReply ?? ""} onChange={(e) => setReplyDrafts((previous) => ({ ...previous, [item.id]: e.target.value }))} placeholder="Write a helpful response or update." /></div>
                <div className="col-12 col-md-2"><button type="button" className="btn btn-primary btn-sm w-100" onClick={() => updateComplaint(item)} disabled={busyId === item.id}>{busyId === item.id ? "Saving…" : <><MdSend className="me-1" />Save</>}</button></div>
              </div>
              {item.respondedAt && <small className="d-block text-secondary mt-2">Last reply: {dateLabel(item.respondedAt)}</small>}
            </article>)}
          </div> : <div className="text-secondary small">No parent messages have been received.</div>}
        </div>
      </section>}

      {activeTab === "polls" && <div className="row g-3">
        <div className="col-12 col-xl-5">
          <section className="card border-0 shadow-sm h-100"><div className="card-body p-3 p-lg-4">
            <SectionTitle icon={MdPoll} title={isAdmin ? "Create a poll" : "Create a parent poll"} description={isAdmin ? "Ask parents, teachers or both to vote. Parent polls can also target a class." : "Ask families to vote on an activity, event or school decision."} />
            <form className="d-grid gap-3" onSubmit={publishPoll}>
              <div><label className="form-label small fw-semibold">Question</label><input className="form-control" value={pollForm.question} onChange={(e) => setPollForm({ ...pollForm, question: e.target.value })} minLength={5} maxLength={240} required placeholder="e.g. Which day suits the family picnic?" /></div>
              <div><label className="form-label small fw-semibold">Description (optional)</label><textarea className="form-control" rows="2" value={pollForm.description} onChange={(e) => setPollForm({ ...pollForm, description: e.target.value })} maxLength={1200} /></div>
              <div><label className="form-label small fw-semibold">Options (one per line, 2–6)</label><textarea className="form-control" rows="4" value={pollForm.options} onChange={(e) => setPollForm({ ...pollForm, options: e.target.value })} required placeholder={"Saturday\nSunday"} /></div>
              <div className="row g-2">
                {isAdmin && <div className="col-12"><label className="form-label small fw-semibold">Poll audience</label><select className="form-select" value={pollForm.audience} onChange={(e) => setPollForm({ ...pollForm, audience: e.target.value, standard: e.target.value === "parents" ? pollForm.standard : "all" })}><option value="parents">Parents</option><option value="teachers">Teachers</option><option value="all">Both parents and teachers</option></select></div>}
                <div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Send to</label><select className="form-select" value={pollForm.standard} onChange={(e) => setPollForm({ ...pollForm, standard: e.target.value })} disabled={isAdmin && pollForm.audience !== "parents"}><option value="all">All classes</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Voting closes</label><input className="form-control" type="date" value={pollForm.endsAt} onChange={(e) => setPollForm({ ...pollForm, endsAt: e.target.value })} required /></div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Publishing…" : "Publish poll"}</button>
            </form>
          </div></section>
        </div>
        <div className="col-12 col-xl-7"><section className="card border-0 shadow-sm"><div className="card-body p-3 p-lg-4">
          <SectionTitle icon={MdPoll} title="Poll results" description="Only totals are shown. Individual parent votes are private." count={polls.length} />
          {loading ? <p className="text-secondary small">Loading polls…</p> : polls.length ? <div className="d-grid gap-3">
            {polls.map((poll) => <article className="school-communication-item" key={poll.id}>
              <div className="d-flex justify-content-between gap-2"><div><h4>{poll.question}</h4><p className="text-secondary small">{poll.audience === "all" ? "Parents & teachers" : poll.audience === "teachers" ? "Teachers" : "Parents"}{poll.audience !== "teachers" ? " · " + (poll.standard === "all" ? "All classes" : poll.standard) : ""} · Closes {dateLabel(poll.endsAt)}</p></div>{isAdmin && <button type="button" className={"btn btn-sm " + (poll.isActive ? "btn-outline-secondary" : "btn-outline-primary")} onClick={() => setStatus("polls", poll.id, !poll.isActive)} disabled={busyId === poll.id}>{poll.isActive ? "Close poll" : "Reopen poll"}</button>}</div>
              {poll.description && <p className="small text-secondary">{poll.description}</p>}
              {poll.options.map((option, index) => { const count = poll.results?.[index] || 0; const pct = poll.totalVotes ? Math.round(count / poll.totalVotes * 100) : 0; return <div className="school-communication-result" key={option}>{!isAdmin && !poll.hasVoted && poll.isActive ? <label className="d-flex gap-2 align-items-center"><input type="radio" name={"teacher-poll-" + poll.id} checked={String(replyDrafts["poll:" + poll.id]) === String(index)} onChange={() => setReplyDrafts((previous) => ({ ...previous, ["poll:" + poll.id]: String(index) }))} />{option}</label> : <div><span>{option}</span><strong>{count} · {pct}%</strong></div>}{(isAdmin || poll.hasVoted || !poll.isActive) && <i><b style={{ width: pct + "%" }} /></i>}</div>; })}
              <small className="text-secondary">{poll.totalVotes} total vote{poll.totalVotes === 1 ? "" : "s"} · {poll.audience === "all" ? "Parents & teachers" : poll.audience === "teachers" ? "Teachers" : "Parents"}</small>{!isAdmin && poll.isActive && !poll.hasVoted && <button type="button" className="btn btn-primary btn-sm mt-2" onClick={() => voteInTeacherPoll(poll.id)} disabled={busyId === poll.id}>{busyId === poll.id ? "Submitting…" : "Submit my vote"}</button>}{!isAdmin && poll.hasVoted && <small className="d-block text-success">Your vote is recorded.</small>}
            </article>)}
          </div> : <div className="text-secondary small">No polls created yet.</div>}
        </div></section></div>
      </div>}

      {activeTab === "messages" && <div className="row g-3">
        {isAdmin && <div className="col-12 col-xl-5"><section className="card border-0 shadow-sm h-100"><div className="card-body p-3 p-lg-4">
          <SectionTitle icon={MdCampaign} title="Send a school message" description="Send a message to parents, teachers or everyone." />
          <form className="d-grid gap-3" onSubmit={sendSchoolMessage}>
            <label className="form-label small fw-semibold mb-0">Title<input className="form-control mt-1" value={messageForm.title} onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })} minLength={3} maxLength={120} required placeholder="e.g. Tomorrow's school timing" /></label>
            <label className="form-label small fw-semibold mb-0">Message<textarea className="form-control mt-1" rows="5" value={messageForm.message} onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })} maxLength={3000} required placeholder="Write the update or instruction…" /></label>
            <label className="form-label small fw-semibold mb-0">Send to<select className="form-select mt-1" value={messageForm.audience} onChange={(e) => setMessageForm({ ...messageForm, audience: e.target.value })}><option value="all">Both parents and teachers</option><option value="parents">Parents only</option><option value="teachers">Teachers only</option></select></label>
            <label className="form-label small fw-semibold mb-0">Priority<select className="form-select mt-1" value={messageForm.priority} onChange={(e) => setMessageForm({ ...messageForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
            <div className="row g-2"><div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Show from<input className="form-control" type="datetime-local" value={messageForm.startsAt} onChange={(e) => setMessageForm({ ...messageForm, startsAt: e.target.value })} /></label></div><div className="col-12 col-sm-6"><label className="form-label small fw-semibold">Hide after<input className="form-control" type="datetime-local" min={messageForm.startsAt || undefined} value={messageForm.expiresAt} onChange={(e) => setMessageForm({ ...messageForm, expiresAt: e.target.value })} /></label></div></div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Sending…" : "Send message"}</button>
          </form>
        </div></section></div>}
        <div className={isAdmin ? "col-12 col-xl-7" : "col-12"}><section className="card border-0 shadow-sm"><div className="card-body p-3 p-lg-4">
          <SectionTitle icon={MdCampaign} title={isAdmin ? "Sent messages" : "Messages from your school"} description={isAdmin ? "Track which teachers and parents have read each message." : "Important updates shared by your administrator."} count={messages.length} />
          {loading ? <p className="small text-secondary">Loading messages…</p> : messages.length ? <div className="d-grid gap-3">
            {messages.map((item) => <article className="school-communication-item" key={item.id}>
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-2"><div><h4>{item.title}</h4><small className="text-secondary">{item.audience === "all" ? "Parents & teachers" : item.audience === "parents" ? "Parents" : "Teachers"} · {dateLabel(item.createdAt || item.startsAt)} · {item.priority}</small></div><span className={"badge " + (item.hasRead ? "text-bg-success" : "text-bg-light border text-dark")}>{isAdmin ? "Sent" : item.hasRead ? "Read" : "Unread"}</span></div>
              <p className="school-communication-preserve mt-2 mb-2">{item.message}</p>
              {isAdmin ? <small className="text-secondary">{item.readCount || 0} read confirmations</small> : !item.hasRead && <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => markMessageRead(item)} disabled={busyId === item.id}>Mark as read</button>}
            </article>)}
          </div> : <div className="text-secondary small">No school messages yet.</div>}
        </div></section></div>
      </div>}
      <div className="small text-secondary mt-3">School messages, notices and polls are delivered inside the relevant parent and teacher portals. Parent complaints remain private to each family and authorised school staff.</div>
    </div>
  );
}
