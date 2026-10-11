import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../api.js";

const AdminVideo = () => {
  const linkone = API_BASE_URL;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [editingVideo, setEditingVideo] = useState(null);
  const [filter, setFilter] = useState({
    title: "",
    standard: "",
    subject: "",
    chapter: "",
  });

  const [formData, setFormData] = useState({
    title: "",
    standard: "",
    subject: "",
    chapter: "",
    url: "",
    file: null,
    uploadType: "url",
  });

  useEffect(() => {
    let active = true;
    axios.get(linkone + "/api/videos")
      .then((response) => {
        if (active) setVideos(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error("Unable to load video resources:", error);
        if (active) setPageError(error.response?.data?.message || "Unable to load video resources.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);


  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const filteredVideos = videos.filter((video) =>
    ["title", "standard", "subject", "chapter"].every((field) =>
      String(video[field] || "").toLowerCase().includes(filter[field].toLowerCase())
    )
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, file: e.target.files[0] });
  };

  const handleRadioChange = (e) => {
    setFormData({ ...formData, uploadType: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append("title", formData.title);
    form.append("standard", formData.standard);
    form.append("subject", formData.subject);
    form.append("chapter", formData.chapter);
    if (formData.uploadType === "file" && formData.file) {
      form.append("file", formData.file);
    } else {
      form.append("url", formData.url);
    }

    try {
      let response;
      if (editingVideo) {
        response = await axios.put(
          `${linkone}/api/videos/${editingVideo._id}`,
          form
        );
      } else {
        response = await axios.post(`${linkone}` + "/api/videos", form);
      }
      setVideos((prevVideos) => {
        const existingIndex = prevVideos.findIndex(
          (video) => video._id === response.data._id
        );
        if (existingIndex > -1) {
          const updatedVideos = [...prevVideos];
          updatedVideos[existingIndex] = response.data;
          return updatedVideos;
        } else {
          return [...prevVideos, response.data];
        }
      });
      setEditingVideo(null);
      setFormData({
        title: "",
        standard: "",
        subject: "",
        chapter: "",
        url: "",
        file: null,
        uploadType: "url",
      });
      setPageSuccess("Video resource saved successfully.");
      setPageError("");
    } catch (error) {
      console.error(error);
      setPageError(error.response?.data?.message || "Unable to save the video resource.");
    }
  };

  const handleEdit = (video) => {
    setEditingVideo(video);
    setFormData({
      title: video.title,
      standard: video.standard,
      subject: video.subject,
      chapter: video.chapter,
      url: video.url,
      file: null,
      uploadType: video.filePath ? "file" : "url",
    });
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${linkone}` + `/api/videos/${id}`);
      setVideos((prevVideos) => prevVideos.filter((video) => video._id !== id));
      setPageSuccess("Video resource deleted.");
      setPageError("");
    } catch (error) {
      console.error(error);
      setPageError(error.response?.data?.message || "Unable to delete the video resource.");
    }
  };

  const handleCancel = () => {
    setEditingVideo(null);
    setFormData({
      title: "",
      standard: "",
      subject: "",
      chapter: "",
      url: "",
      file: null,
      uploadType: "url",
    });
  };

  return (
    <div>
      {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
      <div className="page-header"><div><h2 className="mb-0">Video learning resources</h2><p className="page-subtitle">Manage classroom videos and links, grouped by class and subject.</p></div></div>
      <form className="page-card" onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="mb-3 col-12 col-md-6 col-xl-3">
            <label className="form-label">Title</label>
            <input
              type="text"
              name="title"
              className="form-control"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-3 col-md-3">
            <label className="form-label">Standard</label>
            <input
              type="text"
              name="standard"
              className="form-control"
              value={formData.standard}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-3 col-md-3">
            <label className="form-label">Subject</label>
            <input
              type="text"
              name="subject"
              className="form-control"
              value={formData.subject}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-3 col-md-3">
            <label className="form-label">Chapter</label>
            <input
              type="text"
              name="chapter"
              className="form-control"
              value={formData.chapter}
              onChange={handleChange}
              required
            />
          </div>
        </div>
        <div className="row">
          <div className="mb-3 col-md-3">
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="uploadType"
                value="url"
                checked={formData.uploadType === "url"}
                onChange={handleRadioChange}
              />
              <label className="form-check-label">URL</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="uploadType"
                value="file"
                checked={formData.uploadType === "file"}
                onChange={handleRadioChange}
              />
              <label className="form-check-label">File</label>
            </div>
          </div>
          {formData.uploadType === "url" ? (
            <div className="mb-3 col-md-3">
              <label className="form-label">URL</label>
              <input
                type="url"
                name="url"
                className="form-control"
                value={formData.url}
                onChange={handleChange}
                required
              />
            </div>
          ) : (
            <div className="mb-3 col-md-3">
              <label className="form-label">File</label>
              <input
                type="file"
                accept="video/*"
                className="form-control"
                onChange={handleFileChange}
                required
              />
            </div>
          )}
        </div>
        <div className="d-flex justify-content-end">
          {editingVideo && <button type="button" className="btn btn-outline-secondary me-2" onClick={handleCancel}>Cancel edit</button>}
          <button type="submit" className="btn btn-primary">
            {editingVideo ? "Save changes" : "Add video resource"}
          </button>
        </div>
      </form>
      <div className="filter-panel mb-3 mt-4" aria-label="Filter video resources">
        <div className="col">
          <input
            type="text"
            name="title"
            placeholder="Title"
            className="form-control"
            value={filter.title}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="text"
            name="standard"
            placeholder="Standard"
            className="form-control"
            value={filter.standard}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="text"
            name="subject"
            placeholder="Subject"
            className="form-control"
            value={filter.subject}
            onChange={handleFilterChange}
          />
        </div>
        <div className="col">
          <input
            type="text"
            name="chapter"
            placeholder="Chapter"
            className="form-control"
            value={filter.chapter}
            onChange={handleFilterChange}
          />
        </div>
      </div>
      <div className="table-responsive"><table className="table table-hover align-middle">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Standard</th>
            <th>Subject</th>
            <th>Chapter</th>
            <th>URL</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="text-center py-5">Loading video resources…</td></tr>
          ) : filteredVideos.length === 0 ? (
            <tr><td colSpan={7}><div className="empty-state"><strong>No matching video resources</strong>Add a resource or adjust your filters.</div></td></tr>
          ) : filteredVideos.map((video, index) => (
            <tr key={video._id}>
              <td>{index + 1}</td>
              <td>{video.title}</td>
              <td>{video.standard}</td>
              <td>{video.subject}</td>
              <td>{video.chapter}</td>
              <td>
                <a
                  href={video.url || `${linkone}/${String(video.filePath || "").replace(/^\/+/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Video
                </a>
              </td>
              <td>
                <button
                  className="btn btn-sm btn-primary me-2"
                  type="button" onClick={() => handleEdit(video)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  // onClick={() => handleDelete(video._id)}
                  type="button" onClick={() => confirm("Delete this video resource?") && handleDelete(video._id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
};

export default AdminVideo;
