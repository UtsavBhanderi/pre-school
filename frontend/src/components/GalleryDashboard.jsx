import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const EMPTY_FORM = { title: "", description: "", photo: null, sequence: "" };

export default function GalleryDashboard() {
  const [photos, setPhotos] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(API_BASE_URL + "/api/gallery");
      setPhotos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setPageError(error.response?.data?.message || error.response?.data?.error || "Unable to load the school gallery.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!currentPhoto && !formData.photo) {
      setPageError("Choose an image to add a gallery item.");
      return;
    }

    setSaving(true);
    setPageError("");
    setPageSuccess("");
    const payload = new FormData();
    payload.append("title", formData.title.trim());
    payload.append("description", formData.description.trim());
    payload.append("sequence", String(formData.sequence || photos.length + 1));
    if (formData.photo) payload.append("photo", formData.photo);

    try {
      if (currentPhoto) {
        await axios.put(API_BASE_URL + "/api/gallery/" + currentPhoto._id, payload);
      } else {
        await axios.post(API_BASE_URL + "/api/gallery", payload);
      }
      setFormData(EMPTY_FORM);
      setCurrentPhoto(null);
      setPageSuccess(currentPhoto ? "Gallery item updated." : "Gallery item added.");
      await fetchPhotos();
    } catch (error) {
      setPageError(error.response?.data?.message || error.response?.data?.error || "Unable to save the gallery item.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (photo) => {
    setCurrentPhoto(photo);
    setFormData({
      title: photo.title || "",
      description: photo.description || "",
      photo: null,
      sequence: photo.sequence ?? "",
    });
    setPageError("");
    setPageSuccess("");
    document.getElementById("gallery-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCancel = () => {
    setCurrentPhoto(null);
    setFormData(EMPTY_FORM);
    setPageError("");
    setPageSuccess("");
  };

  const handleDelete = async (photo) => {
    if (!window.confirm("Delete “" + (photo.title || "this image") + "” from the gallery?")) return;
    setPageError("");
    setPageSuccess("");
    try {
      await axios.delete(API_BASE_URL + "/api/gallery/" + photo._id);
      setPhotos((previous) => previous.filter((item) => item._id !== photo._id));
      if (currentPhoto?._id === photo._id) handleCancel();
      setPageSuccess("Gallery item deleted.");
    } catch (error) {
      setPageError(error.response?.data?.message || error.response?.data?.error || "Unable to delete this image.");
    }
  };

  const imageUrl = (photo) => {
    if (!photo?.url) return "";
    return photo.url.startsWith("http") ? photo.url : API_BASE_URL + (photo.url.startsWith("/") ? "" : "/") + photo.url;
  };

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}

      <div className="page-header">
        <div>
          <h2 className="mb-0">School photo gallery</h2>
          <p className="page-subtitle">Keep school memories organized. Add a photo, write a helpful caption, and set its display order.</p>
        </div>
        <div className="page-actions">
          <span className="badge rounded-pill text-bg-light border px-3 py-2">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <section className="page-card mb-4" id="gallery-editor" aria-labelledby="gallery-editor-title">
        <div className="section-heading mt-0">
          <h3 id="gallery-editor-title">{currentPhoto ? "Edit gallery item" : "Add a gallery item"}</h3>
          {currentPhoto && <span className="muted small">Photo file is optional when editing</span>}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-12 col-md-6 col-xl-3">
              <label htmlFor="gallery-title" className="form-label">Photo title</label>
              <input id="gallery-title" type="text" className="form-control" name="title" value={formData.title} onChange={(e) => setFormData((previous) => ({ ...previous, title: e.target.value }))} maxLength={120} required />
            </div>
            <div className="col-12 col-md-6 col-xl-5">
              <label htmlFor="gallery-description" className="form-label">Caption / description</label>
              <input id="gallery-description" type="text" className="form-control" name="description" value={formData.description} onChange={(e) => setFormData((previous) => ({ ...previous, description: e.target.value }))} maxLength={300} placeholder="Describe the activity or event" />
            </div>
            <div className="col-12 col-md-6 col-xl-1">
              <label htmlFor="gallery-sequence" className="form-label">Order</label>
              <input id="gallery-sequence" type="number" min="1" step="1" className="form-control" name="sequence" value={formData.sequence} onChange={(e) => setFormData((previous) => ({ ...previous, sequence: e.target.value }))} placeholder={String(photos.length + 1)} />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <label htmlFor="gallery-photo" className="form-label">Image file {currentPhoto ? "(optional)" : ""}</label>
              <input id="gallery-photo" type="file" accept="image/*" className="form-control" onChange={(e) => setFormData((previous) => ({ ...previous, photo: e.target.files?.[0] || null }))} required={!currentPhoto} />
              <div className="form-text">Use a clear image, up to 5 MB.</div>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            {currentPhoto && <button type="button" className="btn btn-outline-secondary" onClick={handleCancel}>Cancel edit</button>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : currentPhoto ? "Save changes" : "Add photo"}
            </button>
          </div>
        </form>
      </section>

      <div className="section-heading">
        <h3>Gallery collection</h3>
        <span className="muted small">Items are shown in display order.</span>
      </div>

      {loading ? (
        <div className="page-card text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading gallery…</div>
      ) : photos.length === 0 ? (
        <div className="page-card"><div className="empty-state"><strong>Your gallery is ready for its first photo</strong>Add a school event or classroom moment using the form above.</div></div>
      ) : (
        <div className="gallery-grid">
          {photos.map((photo, index) => (
            <article className="gallery-card" key={photo._id}>
              {photo.url ? (
                <img className="gallery-card-image" src={imageUrl(photo)} alt={photo.title || "School gallery photo"} loading="lazy" />
              ) : (
                <div className="gallery-card-image gallery-card-placeholder">No image available</div>
              )}
              <div className="gallery-card-body">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <h4 className="gallery-card-title">{photo.title || "Untitled photo"}</h4>
                  <span className="badge text-bg-light border">#{photo.sequence || index + 1}</span>
                </div>
                <p className="gallery-card-description">{photo.description || "No caption added."}</p>
                <div className="d-flex gap-2 mt-auto">
                  <button type="button" className="btn btn-outline-primary btn-sm flex-grow-1" onClick={() => handleEdit(photo)}>Edit</button>
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(photo)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
