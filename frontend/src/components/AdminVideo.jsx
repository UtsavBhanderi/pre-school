import React, { useEffect, useState } from "react";
import axios from "axios";

const AdminVideo = () => {
  const linkone = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  const [videos, setVideos] = useState([]);
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
    axios.get(`${linkone}` + "/api/videos").then((response) => {
      setVideos(response.data);
    });
  }, []);

  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const filteredVideos = videos.filter(
    (video) =>
      video.title.includes(filter.title) &&
      video.standard.includes(filter.standard) &&
      video.subject.includes(filter.subject) &&
      video.chapter.includes(filter.chapter)
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
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error(error);
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
    <div className="mt-4">
      <h2>Admin Video Management</h2>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="mb-3 col-md-3">
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
                type="text"
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
                className="form-control"
                onChange={handleFileChange}
                required
              />
            </div>
          )}
        </div>
        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-secondary me-2"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
      <div className="row mb-3 mt-4">
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
      <table className="table table-striped table-bordered">
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
          {filteredVideos.map((video, index) => (
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
                  onClick={() => handleEdit(video)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  // onClick={() => handleDelete(video._id)}
                  onClick={() => confirm("Are you sure?") && handleDelete(video._id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminVideo;
