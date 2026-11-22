import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api.js';
const STANDARD_OPTIONS = ['ENG Play Group', 'ENG NR.', 'ENG JR.', 'ENG SR.', 'GUJ Play Group', 'GUJ NR.', 'GUJ JR.', 'GUJ SR.'];
const today = () => { const date = new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); };
const displayDate = (value) => { if (!value) return '—'; const parts = String(value).split('-'); return parts.length === 3 ? parts[2] + '-' + parts[1] + '-' + parts[0] : value; };
const fullName = (student) => [student?.firstName, student?.middleName, student?.lastName].filter(Boolean).join(' ') || 'Unnamed student';
export default function StudentLifecyclePanel({ students = [], onRefresh }) {
  const [studentId, setStudentId] = useState('');
  const [action, setAction] = useState('promotion');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [targetStandard, setTargetStandard] = useState('');
  const [targetBatchYear, setTargetBatchYear] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selected = useMemo(() => students.find((item) => String(item._id) === String(studentId)) || null, [students, studentId]);
  const withdrawn = (selected?.status || 'active') === 'withdrawn';
  const needsDestination = action === 'promotion' || action === 'transfer';
  const history = [...(selected?.academicHistory || [])].sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')));
  const chooseStudent = (id) => {
    const next = students.find((item) => String(item._id) === String(id));
    setStudentId(id); setTargetStandard(next?.standard || ''); setTargetBatchYear(next?.batchYear || '');
    setError(''); setSuccess(''); setAction(next?.status === 'withdrawn' ? 'reactivate' : 'promotion');
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = { action, effectiveDate, reason: reason.trim(), notes: notes.trim() };
      if (needsDestination) { payload.targetStandard = targetStandard; payload.targetBatchYear = targetBatchYear; }
      const response = await axios.patch(API_BASE_URL + '/api/students/' + selected._id + '/lifecycle', payload);
      setSuccess(response.data?.warning ? 'Class history saved. Fee register labels need an administrator review.' : response.data?.message || 'Student history updated.');
      setReason(''); setNotes('');
      await onRefresh?.();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this student update.');
    } finally { setSaving(false); }
  };
  const actionOptions = withdrawn ? [{ value: 'reactivate', label: 'Reactivate student' }] : [
    { value: 'promotion', label: 'Promote to next class' },
    { value: 'transfer', label: 'Transfer to another class / year' },
    { value: 'withdraw', label: 'Record leaving / withdrawal' },
  ];
  return (
    <section className="card border-0 shadow-sm mb-4">
      <div className="card-body p-3 p-lg-4">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div><h3 className="h5 mb-1">Student lifecycle</h3><p className="text-muted small mb-0">Promote, transfer, withdraw or reactivate students while preserving their records and history.</p></div>
          <span className="badge rounded-pill text-bg-light border">History protected</span>
        </div>
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {success && <div className="alert alert-success py-2" role="status">{success}</div>}
        <form onSubmit={submit}>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-lg-5"><label className="form-label" htmlFor="lifecycle-student">Select student</label>
              <select id="lifecycle-student" className="form-select" value={studentId} onChange={(event) => chooseStudent(event.target.value)} required>
                <option value="">Choose a student…</option>
                {students.map((item) => <option key={item._id} value={item._id}>{(item.stuNo ? item.stuNo + ' · ' : '') + fullName(item) + ' · ' + (item.standard || 'No class') + ((item.status || 'active') === 'withdrawn' ? ' · Withdrawn' : '')}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-6 col-lg-3"><label className="form-label" htmlFor="lifecycle-action">Action</label>
              <select id="lifecycle-action" className="form-select" value={action} onChange={(event) => setAction(event.target.value)} disabled={!selected}>
                {actionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-6 col-lg-4"><label className="form-label" htmlFor="lifecycle-date">Effective date</label>
              <input id="lifecycle-date" className="form-control" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required disabled={!selected} />
            </div>
            {needsDestination && <>
              <div className="col-12 col-md-6"><label className="form-label" htmlFor="lifecycle-standard">Destination class</label>
                <select id="lifecycle-standard" className="form-select" value={targetStandard} onChange={(event) => setTargetStandard(event.target.value)} required disabled={!selected}>
                  <option value="">Choose class…</option>{STANDARD_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-6"><label className="form-label" htmlFor="lifecycle-year">Academic year</label>
                <input id="lifecycle-year" className="form-control" value={targetBatchYear} onChange={(event) => setTargetBatchYear(event.target.value)} placeholder="2026-2027" pattern="\\d{4}-\\d{4}" maxLength="9" required disabled={!selected} />
              </div>
            </>}
            <div className="col-12 col-lg-6"><label className="form-label" htmlFor="lifecycle-reason">Reason</label>
              <input id="lifecycle-reason" className="form-control" value={reason} onChange={(event) => setReason(event.target.value)} maxLength="250" placeholder={action === 'withdraw' ? 'e.g. Family relocation' : action === 'reactivate' ? 'e.g. Rejoined the school' : 'e.g. Annual class promotion'} required disabled={!selected} />
            </div>
            <div className="col-12 col-lg-6"><label className="form-label" htmlFor="lifecycle-notes">Additional notes (optional)</label>
              <input id="lifecycle-notes" className="form-control" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength="1000" placeholder="Add any useful administrative note" disabled={!selected} />
            </div>
            <div className="col-12 d-flex justify-content-end"><button type="submit" className="btn btn-primary" disabled={!selected || saving}>{saving ? 'Saving…' : action === 'withdraw' ? 'Save withdrawal record' : action === 'reactivate' ? 'Reactivate student' : 'Save class change'}</button></div>
          </div>
        </form>
        {selected && <div className="border-top mt-4 pt-3">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
            <strong>{fullName(selected)}</strong><span className="text-muted small">GR: {selected.stuNo || '—'}</span>
            <span className={'badge ' + (withdrawn ? 'text-bg-secondary' : 'text-bg-success')}>{withdrawn ? 'Withdrawn' : 'Active'}</span>
            <span className="small text-muted">Current class: {selected.standard || '—'} · {selected.batchYear || 'Year not set'}</span>
          </div>
          <h4 className="small fw-semibold mb-2">Admission and class history</h4>
          {history.length ? <div className="table-responsive"><table className="table table-sm align-middle mb-0">
            <thead><tr><th>Date</th><th>Action</th><th>Class / year</th><th>Reason</th></tr></thead>
            <tbody>{history.map((entry, index) => <tr key={entry._id || index}>
              <td>{displayDate(entry.effectiveDate)}</td><td className="text-capitalize">{entry.action === 'withdrawal' ? 'Withdrawal' : entry.action}</td>
              <td>{entry.fromStandard ? entry.fromStandard + ' → ' : ''}{entry.toStandard || entry.fromStandard || selected.standard || '—'}{entry.toBatchYear ? ' · ' + entry.toBatchYear : ''}</td>
              <td>{entry.reason || '—'}{entry.notes ? <div className="small text-muted">{entry.notes}</div> : null}</td>
            </tr>)}</tbody>
          </table></div> : <p className="small text-muted mb-0">No lifecycle changes have been recorded yet.</p>}
        </div>}
      </div>
    </section>
  );
}
