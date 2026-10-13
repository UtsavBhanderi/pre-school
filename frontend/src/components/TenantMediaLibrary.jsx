import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { MdAdd, MdArchive, MdDescription, MdErrorOutline, MdImage, MdMovie, MdOpenInNew, MdRefresh, MdShield, MdUploadFile } from "react-icons/md";
import { API_BASE_URL } from "../api.js";
import "./tenant-media-library.css";

const CATEGORIES = [
  { id: "gallery_image", label: "Gallery photos", shortLabel: "Photos", Icon: MdImage, accept: "image/jpeg,image/png,image/webp,image/gif", maxBytes: 8 * 1024 * 1024, maxLabel: "8 MB", description: "Share approved school-event photos with authorized staff." },
  { id: "learning_pdf", label: "PDF resources", shortLabel: "PDFs", Icon: MdDescription, accept: "application/pdf,.pdf", maxBytes: 20 * 1024 * 1024, maxLabel: "20 MB", description: "Store worksheets, learning notes and classroom documents." },
  { id: "learning_video", label: "Learning videos", shortLabel: "Videos", Icon: MdMovie, accept: "video/mp4,video/webm,video/quicktime", maxBytes: 100 * 1024 * 1024, maxLabel: "100 MB", description: "Keep classroom videos in organization- and branch-scoped private storage." },
];

const UPLOAD_ROLES = ["organization_owner", "head_office_admin", "branch_admin", "admissions"];
const ARCHIVE_ROLES = ["organization_owner", "head_office_admin", "branch_admin"];

const headersFor = (organizationId, branchId) => ({
  ...(localStorage.getItem("token") ? { "x-auth-token": localStorage.getItem("token") } : {}),
  ...(organizationId ? { "x-organization-id": organizationId } : {}),
  ...(branchId ? { "x-branch-id": branchId } : {}),
});

const displayError = (error) => error?.response?.data?.message || "The resource could not be loaded. Please try again.";
const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const sizeLabel = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export default function TenantMediaLibrary({ organizationId, branchId, role }) {
  const [category, setCategory] = useState("gallery_image");
  const [assets, setAssets] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archivingId, setArchivingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const fileInputRef = useRef(null);
  const activeCategory = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0];
  const canUpload = UPLOAD_ROLES.includes(role);
  const canArchive = ARCHIVE_ROLES.includes(role) && Boolean(branchId);
  const bytesUsed = useMemo(() => assets.reduce((total, asset) => total + (Number(asset.sizeBytes) || 0), 0), [assets]);

  const loadAssets = useCallback(async () => {
    if (!organizationId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(API_BASE_URL + "/api/saas/media", {
        headers: headersFor(organizationId, branchId),
        params: { category },
      });
      setAssets(Array.isArray(response.data?.assets) ? response.data.assets : []);
    } catch (requestError) {
      setAssets([]);
      setError(displayError(requestError));
    } finally {
      setLoading(false);
    }
  }, [organizationId, branchId, category]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets, refreshVersion]);

  const selectCategory = (nextCategory) => {
    setCategory(nextCategory);
    setSelectedFile(null);
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async (event) => {
    event.preventDefault();
    if (!organizationId) return;
    if (!branchId) {
      setError("Choose one branch at the top of the workspace before uploading a file.");
      return;
    }
    if (!canUpload) {
      setError("Your role can view this library but cannot upload resources.");
      return;
    }
    if (!selectedFile) {
      setError("Choose a file to upload first.");
      return;
    }
    if (selectedFile.size < 1 || selectedFile.size > activeCategory.maxBytes) {
      setError("Choose a file smaller than " + activeCategory.maxLabel + " for this category.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await axios.post(
        API_BASE_URL + "/api/saas/media/upload/" + activeCategory.id,
        formData,
        { headers: headersFor(organizationId, branchId) },
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess(response.data?.message || "File uploaded privately.");
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setUploading(false);
    }
  };

  const archiveAsset = async (asset) => {
    const reason = window.prompt("Why are you archiving “" + (asset.fileName || "this resource") + "”? Enter a reason (required).");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters before archiving.");
      return;
    }
    if (!window.confirm("Archive this resource? Its current private links will stop working.")) return;

    setArchivingId(asset.id);
    setError("");
    setSuccess("");
    try {
      const response = await axios.patch(
        API_BASE_URL + "/api/saas/media/" + asset.id + "/archive",
        { reason: reason.trim() },
        { headers: headersFor(organizationId, branchId) },
      );
      setSuccess(response.data?.message || "Resource archived.");
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setArchivingId("");
    }
  };

  return (
    <section className="saas-section tenant-media-library">
      <div className="tenant-media-heading">
        <div>
          <span className="saas-eyebrow">PRIVATE SCHOOL RESOURCES</span>
          <h2>Media and learning library</h2>
          <p>Upload and organize school photos, worksheets and learning videos. Files are kept private and access is checked for your organization and branch.</p>
        </div>
        <button type="button" className="saas-secondary-button" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading}>
          <MdRefresh /> Refresh
        </button>
      </div>

      {(error || success) && (
        <div className={"saas-message " + (error ? "error" : "success")} role={error ? "alert" : "status"}>
          {error ? <MdErrorOutline aria-hidden="true" /> : <MdShield aria-hidden="true" />}
          <span>{error || success}</span>
          <button type="button" onClick={() => { setError(""); setSuccess(""); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="tenant-media-category-tabs" role="tablist" aria-label="Resource type">
        {CATEGORIES.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={category === id} className={category === id ? "active" : ""} onClick={() => selectCategory(id)}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tenant-media-summary">
        <div><strong>{activeCategory.label}</strong><span>{activeCategory.description}</span></div>
        <div className="tenant-media-summary-count"><strong>{assets.length}</strong><span>visible item{assets.length === 1 ? "" : "s"}</span></div>
        <div className="tenant-media-summary-count"><strong>{sizeLabel(bytesUsed)}</strong><span>shown storage</span></div>
      </div>

      {canUpload && (
        <form className="tenant-media-upload-card" onSubmit={uploadFile}>
          <div className="tenant-media-upload-copy">
            <span className="tenant-media-upload-icon"><MdUploadFile aria-hidden="true" /></span>
            <div><h3>Upload to this branch</h3><p>Supported file types only · Maximum size {activeCategory.maxLabel}.</p></div>
          </div>
          {!branchId && <p className="tenant-media-inline-warning">Choose a specific branch from the workspace header before uploading.</p>}
          <div className="tenant-media-upload-controls">
            <label className="tenant-media-file-input">Choose a file
              <input
                ref={fileInputRef}
                type="file"
                accept={activeCategory.accept}
                onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setError(""); setSuccess(""); }}
                disabled={uploading}
              />
            </label>
            <div className="tenant-media-selected-file">
              {selectedFile ? <><strong>{selectedFile.name}</strong><span>{sizeLabel(selectedFile.size)}</span></> : <span>No file selected</span>}
            </div>
            <button type="submit" className="saas-primary-button" disabled={uploading || loading || !selectedFile || !branchId}>
              <MdAdd /> {uploading ? "Uploading privately…" : "Upload file"}
            </button>
          </div>
          <p className="tenant-media-privacy-note"><MdShield aria-hidden="true" /> Private links expire after two minutes. Don't copy or forward them. Parent access is independently checked and only consent-approved child photos may appear in the family portal.</p>
        </form>
      )}

      {loading ? (
        <div className="saas-loading" role="status">Loading private resources…</div>
      ) : assets.length ? (
        <div className="tenant-media-grid">
          {assets.map((asset) => (
            <article className="tenant-media-card" key={asset.id}>
              <div className={"tenant-media-preview " + category}>
                {category === "gallery_image" ? (
                  <img src={asset.url} alt={asset.fileName || "School gallery photo"} loading="lazy" referrerPolicy="no-referrer" />
                ) : category === "learning_video" ? (
                  <video src={asset.url} controls preload="metadata" aria-label={asset.fileName || "Learning video"} />
                ) : (
                  <span className="tenant-media-pdf-icon"><MdDescription aria-hidden="true" /><small>PDF</small></span>
                )}
              </div>
              <div className="tenant-media-card-body">
                <strong title={asset.fileName}>{asset.fileName || "School resource"}</strong>
                <div className="tenant-media-card-meta"><span>{sizeLabel(asset.sizeBytes)}</span><span>{dateLabel(asset.uploadedAt)}</span></div>
                <div className="tenant-media-card-actions">
                  {category === "learning_pdf" && (
                    <a className="saas-secondary-button" href={asset.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      Open PDF <MdOpenInNew aria-hidden="true" />
                    </a>
                  )}
                  {canArchive && (
                    <button type="button" className="saas-text-button tenant-media-archive-button" onClick={() => archiveAsset(asset)} disabled={archivingId === asset.id}>
                      <MdArchive aria-hidden="true" /> {archivingId === asset.id ? "Archiving…" : "Archive"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="saas-empty-state">
          <span className="saas-empty-icon"><activeCategory.Icon aria-hidden="true" /></span>
          <strong>No {activeCategory.shortLabel.toLowerCase()} in this view yet</strong>
          <p>{canUpload ? "Upload the first file for this branch. It will be private and available only to roles authorized to access it." : "No resources are available to your current role or branch scope."}</p>
        </div>
      )}
    </section>
  );
}
