import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const STANDARDS = [
  "ENG Play Group", "ENG NR.", "ENG JR.", "ENG SR.",
  "GUJ Play Group", "GUJ NR.", "GUJ JR.", "GUJ SR.",
];

export default function SubjectManagement() {
  const [configs, setConfigs] = useState([]);
  const [selectedStandard, setSelectedStandard] = useState("");
  const [subjectsText, setSubjectsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const selectedConfig = useMemo(
    () => configs.find((config) => config.standard === selectedStandard) || null,
    [configs, selectedStandard],
  );

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/subjects");
      const items = Array.isArray(response.data) ? response.data : [];
      setConfigs(items);
      return items;
    } catch (error) {
      setPageError(error.response?.data?.message || "Class subjects could not be loaded.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleSelectStandard = (event) => {
    const standard = event.target.value;
    setSelectedStandard(standard);
    setConfirmDelete(false);
    setPageError("");
    setPageSuccess("");
    const config = configs.find((item) => item.standard === standard);
    setSubjectsText(config ? config.subjects.join("\n") : "");
  };

  const parsedSubjects = useMemo(
    () => subjectsText.split(/\r?\n/).map((subject) => subject.trim()).filter(Boolean),
    [subjectsText],
  );

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedStandard || !parsedSubjects.length || saving) return;

    const duplicateNames = parsedSubjects.filter((subject, index) =>
      parsedSubjects.findIndex((item) => item.toLocaleLowerCase() === subject.toLocaleLowerCase()) !== index
    );
    if (duplicateNames.length) {
      setPageError("Each subject should appear only once. Remove duplicate subject names and try again.");
      return;
    }
    if (selectedConfig?.hasSavedMarks) {
      setPageError("This class has saved marks. Its subject list is locked to protect report history.");
      return;
    }

    setSaving(true);
    setPageError("");
    setPageSuccess("");
    try {
      if (selectedConfig) {
        await axios.put(
          API_BASE_URL + "/api/subjects/" + encodeURIComponent(selectedStandard),
          { subjects: parsedSubjects },
        );
        setPageSuccess("Class subjects updated successfully.");
      } else {
        await axios.post(API_BASE_URL + "/api/subjects", {
          standard: selectedStandard,
          subjects: parsedSubjects,
        });
        setPageSuccess("Class subjects saved successfully.");
      }
      const updated = await loadConfigs();
      const savedConfig = updated.find((item) => item.standard === selectedStandard);
      if (savedConfig) setSubjectsText(savedConfig.subjects.join("\n"));
    } catch (error) {
      setPageError(error.response?.data?.message || "Class subjects could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedConfig || selectedConfig.hasSavedMarks || selectedConfig.hasReportTemplates || deleting) return;
    setDeleting(true);
    setPageError("");
    setPageSuccess("");
    try {
      await axios.delete(API_BASE_URL + "/api/subjects/" + encodeURIComponent(selectedStandard));
      setSelectedStandard("");
      setSubjectsText("");
      setConfirmDelete(false);
      setPageSuccess("Unused subject configuration deleted.");
      await loadConfigs();
    } catch (error) {
      setPageError(error.response?.data?.message || "Subject configuration could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const handleClear = () => {
    setSelectedStandard("");
    setSubjectsText("");
    setConfirmDelete(false);
    setPageError("");
    setPageSuccess("");
  };

  return (
    <div className="container-fluid px-0">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h2 className="mb-1">Class subjects</h2>
          <p className="page-subtitle mb-0">Set up the subjects teachers will use when entering student report-card marks.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={loadConfigs} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh list"}
        </button>
      </div>

      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}

      <section className="page-card mb-4">
        <div className="section-heading mt-0">
          <div>
            <h3>{selectedConfig ? "Manage class subjects" : "Set up a class"}</h3>
            <p className="page-subtitle">Enter one subject name per line. You can add or correct the list until marks are saved.</p>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-12 col-lg-4">
              <label htmlFor="subject-standard" className="form-label">Class / standard</label>
              <select
                id="subject-standard"
                className="form-select"
                value={selectedStandard}
                onChange={handleSelectStandard}
                required
              >
                <option value="">Choose a class</option>
                {STANDARDS.map((standard) => (
                  <option key={standard} value={standard}>{standard}</option>
                ))}
              </select>
              {selectedConfig && <div className="form-text">This class already has a subject setup.</div>}
            </div>

            <div className="col-12 col-lg-8">
              <label htmlFor="subject-list" className="form-label">Subjects</label>
              <textarea
                id="subject-list"
                className="form-control"
                rows={7}
                value={subjectsText}
                onChange={(event) => setSubjectsText(event.target.value)}
                placeholder={"English\nMathematics\nGujarati"}
                disabled={Boolean(selectedConfig?.hasSavedMarks)}
                maxLength={2600}
                required
              />
              <div className="form-text">{parsedSubjects.length} subject{parsedSubjects.length === 1 ? "" : "s"} entered · use a separate line for each subject.</div>
            </div>
          </div>

          {selectedConfig?.hasSavedMarks && (
            <div className="alert alert-info mt-3 mb-0" role="status">
              This class already has saved student marks. The subject list is locked so old report cards keep their original subjects.
            </div>
          )}
          {selectedConfig?.hasReportTemplates && !selectedConfig?.hasSavedMarks && (
            <div className="alert alert-warning mt-3 mb-0" role="status">
              Report-card templates already use this class. You may correct the subject list before marks are entered, but this configuration cannot be deleted.
            </div>
          )}

          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={!selectedStandard || !parsedSubjects.length || saving || loading || Boolean(selectedConfig?.hasSavedMarks)}>
                {saving ? "Saving…" : selectedConfig ? "Save subject changes" : "Save class subjects"}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={handleClear} disabled={saving || deleting}>
                Clear
              </button>
            </div>
            {selectedConfig && (
              <div className="d-flex align-items-center gap-2">
                {confirmDelete ? (
                  <>
                    <span className="small text-muted">Delete this unused subject setup?</span>
                    <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
                      {deleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving || deleting || Boolean(selectedConfig.hasSavedMarks) || Boolean(selectedConfig.hasReportTemplates)}
                    title={selectedConfig.hasSavedMarks || selectedConfig.hasReportTemplates ? "Keep this configuration because report history depends on it." : "Delete unused subject setup"}
                  >
                    Delete unused setup
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </section>

      <section className="page-card">
        <div className="section-heading mt-0">
          <div>
            <h3>Configured classes</h3>
            <p className="page-subtitle">Choose a class to review or manage its subject list.</p>
          </div>
          <span className="badge text-bg-light border">{configs.length} configured</span>
        </div>

        {loading ? (
          <div className="py-5 text-center" role="status">Loading class subject setups…</div>
        ) : configs.length === 0 ? (
          <div className="empty-state">
            <strong>No subject lists yet</strong>
            Choose a class above and add its subjects before creating report cards.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr><th scope="col">Class / standard</th><th scope="col">Subjects</th><th scope="col">Status</th><th scope="col" className="text-end">Action</th></tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config._id}>
                    <th scope="row">{config.standard}</th>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {config.subjects.map((subject) => <span key={subject} className="badge text-bg-light border fw-normal">{subject}</span>)}
                      </div>
                    </td>
                    <td>
                      {config.hasSavedMarks
                        ? <span className="badge text-bg-info">History locked</span>
                        : config.hasReportTemplates
                          ? <span className="badge text-bg-warning">Templates in use</span>
                          : <span className="badge text-bg-success">Ready to edit</span>}
                    </td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleSelectStandard({ target: { value: config.standard } })}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
