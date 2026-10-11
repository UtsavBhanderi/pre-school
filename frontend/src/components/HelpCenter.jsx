import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MdArrowForward, MdSearch, MdFactCheck, MdCurrencyRupee, MdPersonAddAlt1,
  MdCalendarMonth, MdAssessment, MdHelpOutline, MdOutlineSchool, MdSupportAgent,
} from "react-icons/md";
import "../operations.css";

const GUIDES = [
  {
    title: "Take daily attendance",
    category: "Daily tasks",
    summary: "Mark children present or absent for a chosen class and date.",
    keywords: "roll call present absent class date reason",
    steps: [
      "Open “Take attendance” from the left menu or choose it on the Start here page.",
      "Choose the school date and the child's class. Check that the correct class is selected.",
      "Mark each child Present or Absent. Add a reason when a child is absent.",
      "Review the list once from top to bottom, then press the save button.",
      "Wait for the success message. If you see an error, correct the highlighted information and try again.",
    ],
    to: "/dashboard/attendanceEntryPage",
    linkText: "Open attendance",
    Icon: MdFactCheck,
  },
  {
    title: "Add a new student",
    category: "People",
    summary: "Create a child's record with class and family contact details.",
    keywords: "admission register child parent guardian gr number photo",
    steps: [
      "Open “Students” and choose the option to add/register a student.",
      "Enter the child's name, date of birth, class and the required contact details.",
      "Check spelling and phone numbers carefully. Add photos and other details when available.",
      "Save the form and read the on-screen confirmation.",
      "Find the child in the student list and verify that the class and contact details are correct.",
    ],
    to: "/dashboard/studentRegister",
    linkText: "Open student records",
    Icon: MdPersonAddAlt1,
  },
  {
    title: "Record a fee payment",
    category: "Money",
    summary: "Enter money received and verify the remaining balance.",
    keywords: "fees amount rupees receipt payment balance due discount",
    steps: [
      "Open “Fees & payments”. Find the correct child using the available filters or search.",
      "Before editing, check the child's name and class so the payment is added to the right record.",
      "Add the amount received and confirm the payment date and any discount details.",
      "Check the amount and the remaining balance shown on screen, then save.",
      "Wait for the success message. Keep any school-required receipt or payment reference with your records.",
    ],
    to: "/dashboard/fees",
    linkText: "Open fees & payments",
    Icon: MdCurrencyRupee,
  },
  {
    title: "Check pending fee balances",
    category: "Money",
    summary: "Review total collection and the amounts still due.",
    keywords: "outstanding pending balance collection fee summary",
    steps: [
      "Open “Fee overview” from the left menu.",
      "Review the collection summary and the total outstanding amount.",
      "Use the date or class-related filters available on the page to narrow the view.",
      "Open the relevant details and verify the child's record before following up with a family.",
    ],
    to: "/dashboard/feesOverview",
    linkText: "Open fee overview",
    Icon: MdCurrencyRupee,
  },
  {
    title: "Add or update a teacher",
    category: "People",
    summary: "Keep staff details and contact information up to date.",
    keywords: "teacher staff faculty phone photo edit update",
    steps: [
      "Open “Teachers” from the left menu.",
      "Choose the add option for a new teacher, or use the edit action on the correct row.",
      "Enter the staff details and recheck contact information.",
      "Save and wait for the confirmation message.",
    ],
    to: "/dashboard/teacherRegister",
    linkText: "Open teacher records",
    Icon: MdOutlineSchool,
  },
  {
    title: "Prepare a report card",
    category: "Learning",
    summary: "Set up an assessment and enter children's learning progress.",
    keywords: "marks grade result assessment subject report print progress",
    steps: [
      "Open “Report cards” and create or choose the relevant class report.",
      "Open the students for that report and check that the class is correct.",
      "Enter marks carefully, following the maximum marks defined by your school.",
      "Save, then review the calculated totals and displayed student details.",
      "Use the print option when the report is ready. Preview it before printing multiple copies.",
    ],
    to: "/dashboard/createReport",
    linkText: "Open report cards",
    Icon: MdAssessment,
  },
  {
    title: "Add a calendar event",
    category: "Planning",
    summary: "Record a holiday, celebration, meeting or school activity.",
    keywords: "holiday festival event function date meeting reminder",
    steps: [
      "Open “School calendar” and select the date for the activity.",
      "Enter a short, clear event title and the correct date or time details.",
      "Check the date carefully, then save the event.",
      "Return to the calendar and confirm the event appears on the expected day.",
    ],
    to: "/dashboard/calendar",
    linkText: "Open school calendar",
    Icon: MdCalendarMonth,
  },
  {
    title: "Upload a learning resource",
    category: "Learning",
    summary: "Make a PDF or video link available for classroom use.",
    keywords: "pdf video homework worksheet file upload link subject chapter",
    steps: [
      "Open “PDF resources” or “Video resources”.",
      "Choose the add option and enter a descriptive title.",
      "Select the relevant class, subject and chapter where those fields are available.",
      "Choose a file or provide a valid resource link, as supported on that page.",
      "Save and verify that the resource appears in the list.",
    ],
    to: "/dashboard/pdf",
    linkText: "Open learning resources",
    Icon: MdAssessment,
  },
];

const TROUBLESHOOTING = [
  {
    title: "I cannot sign in",
    body: "Check that your username and password are correct and that Caps Lock is not changing the password. If you still cannot sign in, ask the school administrator to check your account. Never share your password in a message.",
  },
  {
    title: "A page keeps loading or shows an error",
    body: "Check the internet connection and try once more. If the same error continues, note the page name and the exact message, then contact the person who manages the school software. Avoid clicking Save repeatedly while a request is still processing.",
  },
  {
    title: "I saved something but cannot find it",
    body: "Return to the list and clear any filters or search text. Check the selected class/date and confirm the success message appeared. If the record still cannot be found, ask an administrator before creating a duplicate.",
  },
  {
    title: "I am unsure before editing or deleting",
    body: "Verify the child or teacher name, class and details before making a change. If you are uncertain, cancel and ask the administrator. Do not use another person's account to get around access restrictions.",
  },
];

export default function HelpCenter() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const categories = ["All", ...new Set(GUIDES.map((guide) => guide.category))];
  const filteredGuides = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GUIDES.filter((guide) => {
      const categoryMatches = activeCategory === "All" || guide.category === activeCategory;
      const queryMatches = !needle || [
        guide.title, guide.summary, guide.category, guide.keywords, ...guide.steps,
      ].join(" ").toLowerCase().includes(needle);
      return categoryMatches && queryMatches;
    });
  }, [query, activeCategory]);

  return (
    <div className="ops-page ops-help-page">
      <section className="ops-help-hero">
        <div className="ops-help-hero-icon"><MdHelpOutline aria-hidden="true" /></div>
        <div>
          <span className="ops-eyebrow">HELP & SUPPORT</span>
          <h2>Let’s get it done, step by step.</h2>
          <p>Find simple instructions for common school tasks. No technical knowledge needed.</p>
        </div>
      </section>

      <div className="ops-help-search">
        <MdSearch aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help, e.g. “absent”, “payment”, “marks”"
          aria-label="Search help articles"
        />
      </div>

      <div className="ops-help-categories" role="group" aria-label="Filter help by topic">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={activeCategory === category ? "ops-category-chip is-active" : "ops-category-chip"}
            onClick={() => setActiveCategory(category)}
            aria-pressed={activeCategory === category}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="ops-guide-grid">
        {filteredGuides.map(({ title, summary, steps, to, linkText, Icon, category }) => (
          <details className="ops-guide-card" key={title}>
            <summary>
              <span className="ops-guide-icon"><Icon aria-hidden="true" /></span>
              <span className="ops-guide-heading">
                <span className="ops-guide-category">{category}</span>
                <strong>{title}</strong>
                <span>{summary}</span>
              </span>
              <span className="ops-guide-toggle" aria-hidden="true">+</span>
            </summary>
            <div className="ops-guide-content">
              <ol>{steps.map((step, index) => <li key={step}><span>{step}</span></li>)}</ol>
              <Link className="ops-button-primary" to={to}>{linkText} <MdArrowForward aria-hidden="true" /></Link>
            </div>
          </details>
        ))}
        {filteredGuides.length === 0 && (
          <div className="ops-no-results">
            <MdSearch aria-hidden="true" />
            <strong>No guide matches that search</strong>
            <span>Try a different word or select “All” topics.</span>
            <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={() => { setQuery(""); setActiveCategory("All"); }}>Clear search</button>
          </div>
        )}
      </div>

      <section className="ops-troubleshooting">
        <div className="ops-section-heading">
          <div>
            <h3>Something not working?</h3>
            <p>Try these safe checks before making the same change again.</p>
          </div>
          <MdSupportAgent aria-hidden="true" />
        </div>
        <div className="ops-troubleshooting-grid">
          {TROUBLESHOOTING.map((item) => (
            <details key={item.title} className="ops-trouble-item">
              <summary>{item.title}</summary>
              <p>{item.body}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="ops-help-footer">
        <div>
          <strong>Still not sure where to start?</strong>
          <span>Return to the task menu and choose the closest match.</span>
        </div>
        <Link to="/dashboard/home" className="ops-button-primary">Go to Start here <MdArrowForward aria-hidden="true" /></Link>
      </div>
      <p className="ops-footnote">These guides describe the intended workflow. Follow your school's policies for fees, student information and record corrections.</p>
    </div>
  );
}
