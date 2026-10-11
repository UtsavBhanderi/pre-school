import React from "react";
import { MdFactCheck, MdOutlineChecklist, MdLockOutline, MdSupportAgent } from "react-icons/md";
import "../operations.css";

const TEACHER_GUIDES = [
  {
    title: "Submit a daily work report",
    summary: "Record the classroom work you completed today.",
    steps: [
      "Enter your start and finish times. The finish time must be later than the start time.",
      "Choose the class and write a short subject or activity name.",
      "Enter the number of children who took part.",
      "Describe the lessons, activities and any follow-up the school should know about.",
      "Choose Submit once, then wait for the success message before leaving the page.",
    ],
    Icon: MdOutlineChecklist,
  },
  {
    title: "Record attendance",
    summary: "Mark the right class on the right date.",
    steps: [
      "Choose the class and check the date. Today is selected by default.",
      "Review the saved statuses if attendance has already been entered for this day.",
      "Mark each child present or absent. Add a reason for every absence.",
      "Use “Mark everyone present” only when every child in the selected class is present.",
      "Save the attendance and read the confirmation. Existing saved entries are updated rather than duplicated.",
    ],
    Icon: MdFactCheck,
  },
];

export default function TeacherHelp() {
  return (
    <div className="ops-page ops-teacher-help">
      <section className="ops-help-hero">
        <div className="ops-help-hero-icon"><MdSupportAgent aria-hidden="true" /></div>
        <div>
          <span className="ops-eyebrow">TEACHER QUICK GUIDE</span>
          <h2>Simple steps for your school day.</h2>
          <p>You can open this guide any time. It explains what to enter and what to check before saving.</p>
        </div>
      </section>
      <div className="ops-guide-grid">
        {TEACHER_GUIDES.map(({ title, summary, steps, Icon }) => (
          <section className="ops-guide-card ops-teacher-guide-card" key={title}>
            <div className="ops-guide-heading-row">
              <span className="ops-guide-icon"><Icon aria-hidden="true" /></span>
              <div className="ops-guide-heading">
                <strong>{title}</strong>
                <span>{summary}</span>
              </div>
            </div>
            <div className="ops-guide-content">
              <ol>{steps.map((step) => <li key={step}><span>{step}</span></li>)}</ol>
            </div>
          </section>
        ))}
      </div>
      <section className="ops-teacher-help-safety">
        <MdLockOutline aria-hidden="true" />
        <div>
          <strong>Keep student information safe</strong>
          <p>Check the child's name and class before saving. Never share your password. If something looks wrong or you are unsure, stop and contact your school administrator instead of creating another record.</p>
        </div>
      </section>
    </div>
  );
}
