import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { API_BASE_URL } from "../api.js";
import { Modal, Button, Form } from "react-bootstrap";
import "./CalendarPage.css"; // Optional: custom CSS for additional tweaks

const CalendarPage = () => {
  const linkone = API_BASE_URL;
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalEvent, setModalEvent] = useState({
    id: null,
    title: "",
    start: "",
    end: "",
    color: "#3788d8", // Default color
    isEdit: false,
  });

  // Fetch events from the database
  useEffect(() => {
    axios
      .get(`${linkone}/api/events`)
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setEvents(rows.map((event) => ({
          ...event,
          id: event._id || event.id,
          color: event.color || "#3788d8",
        })));
      })
      .catch((error) => {
        console.error("Error fetching events:", error);
        setPageError(error.response?.data?.message || "Unable to load the school calendar.");
      })
      .finally(() => setLoadingEvents(false));
  }, []);

  // Open modal to create a new event
  const handleDateClick = (info) => {
    setModalEvent({
      title: "",
      start: info.dateStr.length === 10 ? info.dateStr + "T09:00" : info.dateStr.slice(0, 16),
      end: info.dateStr.length === 10 ? info.dateStr + "T10:00" : info.dateStr.slice(0, 16),
      color: "#3788d8", // Default color
      isEdit: false,
    });
    setShowModal(true);
  };

  // Open modal to edit an existing event
  const handleEventClick = (clickInfo) => {
      setModalEvent({
      id: clickInfo.event.id || clickInfo.event._def.extendedProps._id,
      title: clickInfo.event.title,
      start: (() => { const raw = String(clickInfo.event.startStr || clickInfo.event.start || ""); return raw.length === 10 ? raw + "T09:00" : raw.slice(0, 16); })(),
      end: (() => { const raw = String(clickInfo.event.endStr || clickInfo.event.startStr || ""); return raw.length === 10 ? raw + "T10:00" : raw.slice(0, 16); })(),
      color: clickInfo.event.backgroundColor || "#3788d8",
      isEdit: true,
    });
    setShowModal(true);
  };

  const handleSaveEvent = async () => {
    const { title, start, end, color, isEdit, id } = modalEvent;
    if (!title.trim()) {
      setPageError("Enter an event title before saving.");
      return;
    }
    if (!start || !end) {
      setPageError("Add both a start and end time.");
      return;
    }
    if (new Date(end) < new Date(start)) {
      setPageError("The event end time must be after its start time.");
      return;
    }

    setSavingEvent(true);
    setPageError("");
    setPageSuccess("");
    const eventData = { title: title.trim(), start, end, color };
    try {
      if (isEdit) {
        const response = await axios.put(`${linkone}/api/events/${id}`, eventData);
        const savedEvent = { ...response.data, id: response.data._id || id };
        setEvents((previous) => previous.map((event) =>
          String(event._id || event.id) === String(id) ? savedEvent : event
        ));
      } else {
        const response = await axios.post(`${linkone}/api/events`, eventData);
        setEvents((previous) => [...previous, { ...response.data, id: response.data._id }]);
      }
      setPageSuccess(isEdit ? "Calendar event updated." : "Calendar event created.");
      setPageError("");
      setShowModal(false);
    } catch (error) {
      console.error("Unable to save calendar event:", error);
      setPageError(error.response?.data?.message || "Unable to save the calendar event.");
    } finally {
      setSavingEvent(false);
    }
  };

  // Delete an event
  const handleEventDelete = async () => {
    if (!modalEvent.id) {
      alert("No event ID is available for deletion.");
      return;
    }

    try {
      await axios.delete(`${linkone}/api/events/${modalEvent.id}`);
      setEvents((previous) => previous.filter(
        (event) => String(event._id || event.id) !== String(modalEvent.id)
      ));
      setShowModal(false);
    } catch (error) {
      console.error("Unable to delete calendar event:", error);
      alert(error.response?.data?.message || "Unable to delete the calendar event.");
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    setPageError("");
    setModalEvent((previous) => ({ ...previous, [e.target.name]: e.target.value }));
  };

  const handleEventDrop = async (info) => {
    const { id, startStr, endStr } = info.event;

    try {
      // Update the event's new start and end dates on the backend
      await axios.put(`${linkone}` + `/api/events/${id}`, {
        start: startStr,
        end: endStr || startStr, // Handle case where there's no end date
      });

      // Update the event in the local state to reflect the new date
      setEvents((previous) => previous.map((event) =>
        String(event._id || event.id) === String(id)
          ? { ...event, start: startStr, end: endStr || startStr }
          : event
      ));
    } catch (error) {
      console.error("Error updating event after drag:", error);
      info.revert(); // Revert to the original date if the update fails
    }
  };

  return (
    <div className="my-4">
            {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
      {pageSuccess && <div className="alert alert-success" role="status">{pageSuccess}</div>}
      <div className="page-header">
        <div>
          <h2 className="mb-0">School calendar</h2>
          <p className="page-subtitle">Plan events and important dates. Select a day to add an event, or choose an existing event to edit it.</p>
        </div>
      </div>

      <div className="page-card calendar-container">
        {loadingEvents ? (
          <div className="text-center py-5"><span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading school events…</div>
        ) : <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          editable={true}
          eventDrop={handleEventDrop} // Drag-and-drop event handling
          eventResize={handleEventDrop} // Handle resizing as well
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
        />}
      </div>

      {/* Modal for creating/editing events */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {modalEvent.isEdit ? "Edit Event" : "Create Event"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {pageError && <div className="alert alert-danger" role="alert">{pageError}</div>}
          <Form>
            <div className="row g-3">
              <Form.Group controlId="formEventTitle" className="col-12 col-md-8">
                <Form.Label>Event Title</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter event title"
                  name="title"
                  value={modalEvent.title}
                  onChange={handleInputChange}
                />
              </Form.Group>

              <Form.Group controlId="formEventColor" className="col-12 col-md-4">
                <Form.Label>Event Color</Form.Label>
                <Form.Control
                  type="color"
                  name="color"
                  value={modalEvent.color}
                  onChange={handleInputChange}
                />
              </Form.Group>
            </div>

            <Form.Group controlId="formEventStart" className="mt-3">
              <Form.Label>Start Time</Form.Label>
              <Form.Control
                type="datetime-local"
                name="start"
                value={modalEvent.start}
                onChange={handleInputChange}
              />
            </Form.Group>

            <Form.Group controlId="formEventEnd" className="mt-3">
              <Form.Label>End Time</Form.Label>
              <Form.Control
                type="datetime-local"
                name="end"
                value={modalEvent.end}
                onChange={handleInputChange}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          {modalEvent.isEdit && (
            // <Button variant="danger" onClick={handleEventDelete}>
            <Button
              variant="danger"
              onClick={() =>
                confirm("Are you sure you want to delete this event?") &&
                handleEventDelete()
              }
            >
              Delete Event
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={handleSaveEvent} disabled={savingEvent}>
            {savingEvent ? "Saving…" : modalEvent.isEdit ? "Save changes" : "Create event"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CalendarPage;
