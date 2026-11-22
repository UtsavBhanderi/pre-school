import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const API_URL = API_BASE_URL;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOCUMENT_CATEGORIES = [
    { value: "birth_certificate", label: "Birth certificate" },
    { value: "address_proof", label: "Address proof" },
    { value: "transfer_certificate", label: "Transfer certificate" },
    { value: "previous_school_record", label: "Previous school record" },
    { value: "medical_record", label: "Medical record" },
    { value: "photo_identity", label: "Identity document" },
    { value: "other", label: "Other document" },
];

const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
};

const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function StudentDocumentsPanel({ student }) {
    const studentId = student?._id || "";
    const [documents, setDocuments] = useState([]);
    const [documentType, setDocumentType] = useState("birth_certificate");
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [busyDocumentId, setBusyDocumentId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const fileInputRef = useRef(null);

    const fetchDocuments = useCallback(async () => {
        if (!studentId) return;
        setLoading(true);
        setError("");
        try {
            const response = await axios.get(API_URL + "/api/student-documents/" + studentId);
            setDocuments(Array.isArray(response.data?.documents) ? response.data.documents : []);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to load admission documents.");
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleFileChange = (event) => {
        const file = event.target.files?.[0] || null;
        setSelectedFile(file);
        if (file) {
            setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 100));
            setError("");
        }
    };

    const uploadDocument = async (event) => {
        event.preventDefault();
        if (!selectedFile || uploading) return;
        if (selectedFile.size > MAX_FILE_BYTES) {
            setError("Choose a file smaller than 10 MB.");
            return;
        }

        setUploading(true);
        setError("");
        setSuccess("");
        try {
            const formData = new FormData();
            formData.append("document", selectedFile);
            formData.append("documentType", documentType);
            formData.append("title", title.trim());
            formData.append("notes", notes.trim());
            await axios.post(API_URL + "/api/student-documents/" + studentId, formData);
            setSelectedFile(null);
            setTitle("");
            setNotes("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            setSuccess("Document uploaded securely.");
            await fetchDocuments();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to upload this document.");
        } finally {
            setUploading(false);
        }
    };

    const downloadDocument = async (document) => {
        if (busyDocumentId) return;
        setBusyDocumentId(document._id);
        setError("");
        try {
            const response = await axios.get(
                API_URL + "/api/student-documents/" + studentId + "/" + document._id + "/download",
                { responseType: "blob" },
            );
            const objectUrl = URL.createObjectURL(response.data);
            const anchor = window.document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = document.originalFileName || "student-document";
            window.document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to download this document.");
        } finally {
            setBusyDocumentId("");
        }
    };

    const archiveDocument = async (document) => {
        if (busyDocumentId) return;
        const confirmed = window.confirm(
            "Archive “" + document.title + "”? The original file will be retained and can still be downloaded by an administrator.",
        );
        if (!confirmed) return;

        setBusyDocumentId(document._id);
        setError("");
        setSuccess("");
        try {
            await axios.patch(
                API_URL + "/api/student-documents/" + studentId + "/" + document._id + "/archive",
                {},
            );
            setSuccess("Document archived. Its file and history have been retained.");
            await fetchDocuments();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to archive this document.");
        } finally {
            setBusyDocumentId("");
        }
    };

    const activeCount = documents.filter((document) => document.status === "active").length;

    return (
        <section className="card border-0 shadow-sm mt-4" aria-labelledby="student-documents-title">
            <div className="card-body p-3 p-lg-4">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                    <div>
                        <h5 className="mb-1" id="student-documents-title">Admission documents</h5>
                        <p className="text-muted small mb-0">
                            Keep certificates, identity and school records together with this student’s profile.
                            Only school administrators can access these files.
                        </p>
                    </div>
                    <span className="badge rounded-pill text-bg-light border">
                        {activeCount} active {activeCount === 1 ? "document" : "documents"}
                    </span>
                </div>

                {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
                {success && <div className="alert alert-success py-2" role="status">{success}</div>}

                <form onSubmit={uploadDocument} className="rounded-3 border bg-light p-3 mb-4">
                    <div className="row g-3 align-items-end">
                        <div className="col-12 col-md-6 col-xl-3">
                            <label className="form-label" htmlFor="student-document-type">Document category</label>
                            <select
                                id="student-document-type"
                                className="form-select"
                                value={documentType}
                                onChange={(event) => setDocumentType(event.target.value)}
                            >
                                {DOCUMENT_CATEGORIES.map((category) => (
                                    <option key={category.value} value={category.value}>{category.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-12 col-md-6 col-xl-3">
                            <label className="form-label" htmlFor="student-document-title">Document name</label>
                            <input
                                id="student-document-title"
                                className="form-control"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                maxLength={100}
                                placeholder="e.g. Birth certificate"
                                required
                            />
                        </div>
                        <div className="col-12 col-xl-4">
                            <label className="form-label" htmlFor="student-document-file">Choose file</label>
                            <input
                                ref={fileInputRef}
                                id="student-document-file"
                                className="form-control"
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                onChange={handleFileChange}
                                required
                            />
                            <div className="form-text">PDF or JPG, PNG, WEBP · Maximum 10 MB</div>
                        </div>
                        <div className="col-12 col-xl-2">
                            <button className="btn btn-primary w-100" type="submit" disabled={!selectedFile || uploading || !title.trim()}>
                                {uploading ? "Uploading…" : "Upload document"}
                            </button>
                        </div>
                        <div className="col-12">
                            <label className="form-label" htmlFor="student-document-notes">Note (optional)</label>
                            <input
                                id="student-document-notes"
                                className="form-control"
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                maxLength={500}
                                placeholder="Add a useful note, such as issue date or renewal reminder"
                            />
                            {selectedFile && (
                                <div className="small text-muted mt-2">
                                    Selected: {selectedFile.name} · {formatBytes(selectedFile.size)}
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <h6 className="mb-0">Saved documents</h6>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchDocuments} disabled={loading}>
                        Refresh
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-muted py-4">
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Loading documents…
                    </div>
                ) : documents.length === 0 ? (
                    <div className="border rounded-3 text-center text-muted p-4">
                        <strong className="d-block text-body mb-1">No admission documents yet</strong>
                        <span className="small">Upload the first certificate or record using the form above.</span>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th scope="col">Document</th>
                                    <th scope="col">Category</th>
                                    <th scope="col">Added</th>
                                    <th scope="col">Size</th>
                                    <th scope="col">Status</th>
                                    <th scope="col" className="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((document) => {
                                    const category = DOCUMENT_CATEGORIES.find((item) => item.value === document.documentType);
                                    return (
                                        <tr key={document._id}>
                                            <td>
                                                <strong className="d-block">{document.title}</strong>
                                                <span className="small text-muted">{document.originalFileName}</span>
                                                {document.notes && <span className="small text-muted d-block">{document.notes}</span>}
                                            </td>
                                            <td>{category?.label || "Other document"}</td>
                                            <td>{formatDate(document.createdAt)}</td>
                                            <td>{formatBytes(document.sizeBytes)}</td>
                                            <td>
                                                {document.status === "archived"
                                                    ? <span className="badge text-bg-secondary">Archived</span>
                                                    : <span className="badge text-bg-success">Active</span>}
                                            </td>
                                            <td className="text-end text-nowrap">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-primary me-2"
                                                    onClick={() => downloadDocument(document)}
                                                    disabled={Boolean(busyDocumentId)}
                                                >
                                                    {busyDocumentId === document._id ? "Please wait…" : "Download"}
                                                </button>
                                                {document.status === "active" && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => archiveDocument(document)}
                                                        disabled={Boolean(busyDocumentId)}
                                                    >
                                                        Archive
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
