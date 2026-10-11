import React, { useState, useEffect } from "react";
import axios from "axios";

const GalleryDashboard = () => {
 const linkone = `http://localhost:5000`;

  const [photos, setPhotos] = useState([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    photo: null,
    sequence: "",
  });
  const [currentPhoto, setCurrentPhoto] = useState(null);

  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${linkone}` + "/api/gallery");
      setPhotos(response.data);
    } catch (error) {
      console.error("Error fetching photos:", error);
    }
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, photo: e.target.files[0] });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formDataObj = new FormData();
    formDataObj.append("title", formData.title);
    formDataObj.append("description", formData.description);
    formDataObj.append("sequence", formData.sequence);
    if (formData.photo) formDataObj.append("photo", formData.photo);

    try {
      if (currentPhoto) {
        await axios.put(
          `${linkone}` + `/api/gallery/${currentPhoto._id}`,
          formDataObj
        );
      } else {
        await axios.post(`${linkone}` + "/api/gallery", formDataObj);
      }
      fetchPhotos();
      setFormData({ title: "", description: "", photo: null, sequence: "" });
      setCurrentPhoto(null);
    } catch (error) {
      console.error("Error saving photo:", error);
    }
  };

  const handleEdit = (photo) => {
    setCurrentPhoto(photo);
    setFormData({
      title: photo.title,
      description: photo.description,
      photo: null,
      sequence: photo.sequence,
    });
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${linkone}` + `/api/gallery/${id}`);
      fetchPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
    }
  };

  const movePhoto = async (id, direction) => {
    const index = photos.findIndex((photo) => photo._id === id);

    if (index < 0) return;

    let newSequence = photos[index].sequence;

    if (direction === "up" && index > 0) {
      newSequence = photos[index - 1].sequence;
      photos[index - 1].sequence = photos[index].sequence;
    } else if (direction === "down" && index < photos.length - 1) {
      newSequence = photos[index + 1].sequence;
      photos[index + 1].sequence = photos[index].sequence;
    }

    photos[index].sequence = newSequence;

    await axios.put(`${linkone}` + `/api/gallery/sequence/${id}`, {
      sequence: newSequence,
    });

    fetchPhotos();
  };

  return (
    <div className="">
      <h1>Manage Gallery</h1>
      <form onSubmit={handleSubmit} className="mb-4 row">
        <div className="mb-3 col-3">
          <label htmlFor="title" className="form-label">
            Title
          </label>
          <input
            type="text"
            className="form-control"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
          />
        </div>
        <div className="mb-3 col-3">
          <label htmlFor="description" className="form-label">
            Description
          </label>
          <input
            type="text"
            className="form-control"
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
          />
        </div>
        <div className="mb-3 col-3">
          <label htmlFor="sequence" className="form-label">
            sequence
          </label>
          <input
            type="text"
            className="form-control"
            id="sequence"
            name="sequence"
            value={formData.sequence}
            onChange={handleChange}
          />
        </div>
        <div className="mb-3 col-3">
          <label htmlFor="photo" className="form-label">
            Photo
          </label>
          <input
            type="file"
            className="form-control"
            id="photo"
            name="photo"
            onChange={handleFileChange}
          />
        </div>
        <div>
          <button type="submit" className="btn btn-primary">
            {currentPhoto ? "Update" : "Add"} Photo
          </button>
        </div>
      </form>
      <table className="table table-bordered table-striped">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Image</th>
            <th scope="col">Title</th>
            <th scope="col">Description</th>
            <th scope="col">sequence</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {photos.map((photo, index) => (
            <tr key={photo._id}>
              <th scope="row">{index + 1}</th>
              <td>
                <img
                  src={`${linkone}` + photo.url}
                  alt={photo.title}
                  style={{ width: "50px", height: "50px" }}
                />
              </td>
              <td>{photo.title}</td>
              <td>{photo.description}</td>
              <td>{photo.sequence}</td>
              <td>
                <button
                  className="btn btn-primary me-2"
                  onClick={() => handleEdit(photo)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger me-2"
                  onClick={() =>
                    confirm("Are you sure you want to delete this photo?") &&
                    handleDelete(photo._id)
                  }
                >
                  Delete
                </button>
                {/* <button className="btn btn-secondary me-2" onClick={() => movePhoto(photo._id, 'up')}>Move Up</button> */}
                {/* <button className="btn btn-secondary" onClick={() => movePhoto(photo._id, 'down')}>Move Down</button> */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default GalleryDashboard;
