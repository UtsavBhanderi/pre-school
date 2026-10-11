// import React, { useState, useEffect } from "react";
// import FullCalendar from "@fullcalendar/react";
// import dayGridPlugin from "@fullcalendar/daygrid";
// import timeGridPlugin from "@fullcalendar/timegrid";
// import interactionPlugin from "@fullcalendar/interaction";
// import axios from "axios";
// import { Modal, Button, Form } from "react-bootstrap";

// const CalendarPage = () => {
//   const [events, setEvents] = useState([]);
//   const [showModal, setShowModal] = useState(false);
//   const [modalEvent, setModalEvent] = useState({
//     id: null,
//     title: "",
//     start: "",
//     end: "",
//     isEdit: false,
//   });

//   // Fetch events from the database
//   useEffect(() => {
//     axios
//       .get("/api/events")
//       .then((response) => setEvents(response.data))
//       .catch((error) => console.error("Error fetching events:", error));
//   }, []);

//   // Open modal to create a new event
//   const handleDateClick = (info) => {
//     setModalEvent({
//       title: "",
//       start: info.dateStr,
//       end: info.dateStr,
//       isEdit: false,
//     });
//     setShowModal(true);
//   };

//   // Open modal to edit an existing event
//   const handleEventClick = (clickInfo) => {
//     console.log(clickInfo.event);  // Inspect the event object for correct ID field
//     setModalEvent({
//       id: clickInfo.event.extendedProps._id,
//       title: clickInfo.event.title,
//       start: clickInfo.event.startStr,
//       end: clickInfo.event.endStr || clickInfo.event.startStr,
//       isEdit: true,
//     });
//     setShowModal(true);
//   };

//   // Save or update the event
//   const handleSaveEvent = async () => {
//     const { title, start, end, isEdit, id } = modalEvent;

//     if (title.trim() === "") return alert("Event title is required");

//     const eventData = { title, start, end };

//     if (isEdit) {
//       // Update event
//       await axios.put(`/api/events/${id}`, eventData);
//       setEvents(events.map((event) => (event.id === id ? eventData : event)));
//     } else {
//       // Create event
//       const response = await axios.post("/api/events", eventData);
//       setEvents([...events, response.data]);
//     }

//     setShowModal(false);
//   };

//   // Function to handle event deletion
//   const handleEventDelete = async () => {
//     if (!modalEvent.id) {
//       console.error("Event ID not found");

//       return;
//     }
//     try {
//       console.log(modalEvent, "modalEvent");

//       await axios.delete(`/api/events/${modalEvent.id}`);
//       setEvents(events.filter((event) => event.id !== modalEvent.id)); // Remove the event from state
//       setShowModal(false); // Close the modal
//     } catch (error) {
//       console.error("Error deleting event:", error);
//     }
//   };

//   // Handle form input changes
//   const handleInputChange = (e) => {
//     setModalEvent({ ...modalEvent, [e.target.name]: e.target.value });
//   };

//   return (
//     <div className="my-2">
//       <h2 className="text-center mb-4">Event Calendar</h2>
//       <div className="">
//         <FullCalendar
//           plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
//           initialView="dayGridMonth"
//           events={events}
//           dateClick={handleDateClick}
//           eventClick={handleEventClick}
//           editable={true}
//           eventDrop={handleSaveEvent} // Drag & drop event update
//           eventResize={handleSaveEvent} // Resize event update
//           headerToolbar={{
//             left: "prev,next today",
//             center: "title",
//             right: "dayGridMonth,timeGridWeek,timeGridDay",
//           }}
//           contentHeight={850}
//         />
//       </div>

//       {/* Modal for creating/editing events */}
//       <Modal show={showModal} onHide={() => setShowModal(false)}>
//         <Modal.Header closeButton>
//           <Modal.Title>
//             {modalEvent.isEdit ? "Edit Event" : "Create Event"}
//           </Modal.Title>
//         </Modal.Header>
//         <Modal.Body>
//           <Form>
//             <Form.Group controlId="formEventTitle">
//               <Form.Label>Event Title</Form.Label>
//               <Form.Control
//                 type="text"
//                 placeholder="Enter event title"
//                 name="title"
//                 value={modalEvent.title}
//                 onChange={handleInputChange}
//               />
//             </Form.Group>

//             <Form.Group controlId="formEventStart" className="mt-3">
//               <Form.Label>Start Time</Form.Label>
//               <Form.Control
//                 type="datetime-local"
//                 name="start"
//                 value={modalEvent.start}
//                 onChange={handleInputChange}
//               />
//             </Form.Group>

//             <Form.Group controlId="formEventEnd" className="mt-3">
//               <Form.Label>End Time</Form.Label>
//               <Form.Control
//                 type="datetime-local"
//                 name="end"
//                 value={modalEvent.end}
//                 onChange={handleInputChange}
//               />
//             </Form.Group>
//           </Form>
//         </Modal.Body>
//         <Modal.Footer>
//           {modalEvent.isEdit && (
//             <Button variant="danger" onClick={handleEventDelete}>
//               Delete Event
//             </Button>
//           )}
//           <Button variant="secondary" onClick={() => setShowModal(false)}>
//             Close
//           </Button>
//           <Button variant="primary" onClick={handleSaveEvent}>
//             {modalEvent.isEdit ? "Update Event" : "Create Event"}
//           </Button>
//         </Modal.Footer>
//       </Modal>
//     </div>
//   );
// };

// export default CalendarPage;

import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { Modal, Button, Form } from "react-bootstrap";
import "./CalendarPage.css"; // Optional: custom CSS for additional tweaks

const CalendarPage = () => {
  const linkone = `https://api.kidzeranursery.com`;

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
      .get(`${linkone}` + "/api/events")
      .then((response) => setEvents(response.data))
      .catch((error) => console.error("Error fetching events:", error));
  }, []);

  // Open modal to create a new event
  const handleDateClick = (info) => {
    setModalEvent({
      title: "",
      start: info.dateStr,
      end: info.dateStr,
      color: "#3788d8", // Default color
      isEdit: false,
    });
    setShowModal(true);
  };

  // Open modal to edit an existing event
  const handleEventClick = (clickInfo) => {
    // id: clickInfo.event._id,
    setModalEvent({
      id: clickInfo.event._def.extendedProps._id,
      title: clickInfo.event.title,
      start: clickInfo.event.startStr || clickInfo.event.start,
      end: clickInfo.event.endStr || clickInfo.event.startStr,
      color: clickInfo.event.backgroundColor || "#3788d8",
      isEdit: true,
    });
    setShowModal(true);
  };

  // // Save or update the event
  // const handleSaveEvent = async () => {
  //   const { title, start, end, color, isEdit, id } = modalEvent;

  //   if (title.trim() === '') return alert('Event title is required');

  //   const eventData = { title, start, end, color };

  //   if (isEdit) {
  //     // Update event
  //     await axios.put(`/api/events/${id}`, eventData);
  //     setEvents(events.map(event => (event.id === id ? { ...eventData, id } : event)));
  //   } else {
  //     // Create event
  //     const response = await axios.post('/api/events', eventData);
  //     setEvents([...events, response.data]);
  //   }

  //   setShowModal(false);
  // };

  const handleSaveEvent = async () => {
    const { title, start, end, color, isEdit, id } = modalEvent;

    if (title.trim() === "") return alert("Event title is required");

    const eventData = { title, start, end, color };

    if (isEdit) {
      // Update existing event
      await axios
        .put(`${linkone}` + `/api/events/${id}`, eventData)
        .then((response) => {
          setEvents(
            events.map((event) =>
              event.id === id ? { ...response.data, id } : event
            )
          );
          window.location.reload();
        })
        .catch((error) => console.error("Error updating event:", error));
    } else {
      // Create new event
      await axios
        .post(`${linkone}` + "/api/events", eventData)
        .then((response) => {
          setEvents([...events, response.data]);
        })
        .catch((error) => console.error("Error creating event:", error));
    }

    setShowModal(false);
  };

  // Delete an event
  // const handleEventDelete = async () => {
  //   try {
  //     await axios.delete(`/api/events/${modalEvent.id}`);
  //     setEvents(events.filter(event => event.id !== modalEvent.id)); // Remove event from state
  //     setShowModal(false);
  //   } catch (error) {
  //     console.error('Error deleting event:', error);
  //   }
  // };

  const handleEventDelete = async () => {
    if (!modalEvent.id) {
      alert("No event ID found for deletion!");
      return;
    }

    try {
      await axios.delete(`${linkone}` + `/api/events/${modalEvent.id}`);
      setEvents(events.filter((event) => event.id !== modalEvent.id));
      setShowModal(false);
      window.location.reload();
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    setModalEvent({ ...modalEvent, [e.target.name]: e.target.value });
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
      setEvents(
        events.map((event) =>
          event.id === id
            ? { ...event, start: startStr, end: endStr || startStr }
            : event
        )
      );
    } catch (error) {
      console.error("Error updating event after drag:", error);
      info.revert(); // Revert to the original date if the update fails
    }
  };

  return (
    <div className="my-4">
      <div className="calendar-header">
        <h2 className="text-center mb-2">Event Calendar</h2>
      </div>

      <div className="calendar-container shadow-sm w-100 bg-white rounded">
        <FullCalendar
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
        />
      </div>

      {/* Modal for creating/editing events */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {modalEvent.isEdit ? "Edit Event" : "Create Event"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="d-flex gap-5">
              <Form.Group controlId="formEventTitle">
                <Form.Label>Event Title</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter event title"
                  name="title"
                  value={modalEvent.title}
                  onChange={handleInputChange}
                />
              </Form.Group>

              <Form.Group controlId="formEventColor" className="">
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
          <Button variant="primary" onClick={handleSaveEvent}>
            {modalEvent.isEdit ? "Update Event" : "Create Event"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CalendarPage;
