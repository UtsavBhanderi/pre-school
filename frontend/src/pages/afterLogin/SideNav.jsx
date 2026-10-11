import React, { useState, useContext } from "react";
import { AuthContext } from "../../context/AuthContext";
import { NavLink } from "react-router-dom";

import { FaRegFilePdf } from "react-icons/fa6";
import { FiVideo } from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { GrGallery } from "react-icons/gr";
import { FaRegUser } from "react-icons/fa";
import { TbReport } from "react-icons/tb";
import { FaPowerOff } from "react-icons/fa6";
import { IoAnalyticsOutline } from "react-icons/io5";
import { SiReacthookform } from "react-icons/si";
import { LuCalendarCheck } from "react-icons/lu";
import { LuClipboardList } from "react-icons/lu";
import { BsCake } from "react-icons/bs";
import { MdCheckCircleOutline } from "react-icons/md";
import { FaRegCheckCircle } from "react-icons/fa";
import { FaRegCircleCheck } from "react-icons/fa6";

function SideNav() {
  const [activeComponent, setActiveComponent] = useState("fees");
  const { user, logout } = useContext(AuthContext);
  return (
    <>
      <nav className="bg-light border-end vh-auto p-3 min-vh-100">
        <h4>Admin Dashboard</h4>
        <ul className="nav flex-column row-gap-3">
          {/* <li className="nav-item">
              <div
                onClick={() => setActiveComponent("StuAtt")}
                className="nav-link d-inline-flex align-items-center gap-3"
              >
                <h2>
                  <IoAnalyticsOutline  />
                </h2>
                <h5>Student attendence</h5>
              </div>
            </li> */}
          <li className="nav-item">
            <div
              // onClick={() => setActiveComponent("graph")}
              className="nav-link d-inline-flex align-items-center gap-3"
            >
              <h2>
                <IoAnalyticsOutline />
              </h2>
              <NavLink
                className="active"
                aria-current="page"
                to="/dashboard/feesOverview"
              >
                <h5>Dashboard</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
            // onClick={() => setActiveComponent("AttPage")}
            >
              <NavLink
                className="nav-link d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/attendanceOverview"
              >
                <h2>
                  <IoAnalyticsOutline />
                </h2>
                <h5>Attendence</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
            // onClick={() => setActiveComponent("fees")}
            >
              <NavLink
                className="nav-link d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/fees"
              >
                <h2>
                  <MdCurrencyRupee />
                </h2>
                <h5>Fees</h5>
              </NavLink>
            </div>
          </li>

          <li className="nav-item">
            <div
              className="dropdown-toggle d-inline-flex align-items-center nav-link gap-3"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              {/* <NavLink className="nav-link" aria-current="page" to="/dashboard/attendanceOverview">
              </NavLink> */}
              <h2>
                <LuClipboardList />
              </h2>
              <h5>Register</h5>
            </div>
            <ul className="dropdown-menu dropdown-menu-dark">
              <li>
                <NavLink
                  className="dropdown-item"
                  to="/dashboard/studentRegister"
                >
                  Student
                </NavLink>
              </li>
              <li>
                <NavLink
                  className="dropdown-item"
                  to="/dashboard/teacherRegister"
                >
                  Teacher
                </NavLink>
              </li>
            </ul>
          </li>
          <li className="nav-item">
            <div
              className="dropdown-toggle d-inline-flex align-items-center nav-link gap-3"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <h2>
                <BsCake />
              </h2>
              <h5>Birthday</h5>
            </div>
            <ul className="dropdown-menu dropdown-menu-dark">
              {/* <li>
                  <NavLink className="dropdown-item" to="Management/Trustee">
                    Trustee
                  </NavLink>
                </li> */}
              <li>
                <NavLink
                  className="dropdown-item"
                  to="/dashboard/studentBirthday"
                >
                  Student
                </NavLink>
                {/* <span
                  onClick={() => setActiveComponent("Birthday")}
                  className="nav-link dropdown-item"
                >
                </span> */}
              </li>
              <li>
                <NavLink
                  className="dropdown-item"
                  to="/dashboard/teacherBirthday"
                >
                  Teacher
                </NavLink>
              </li>
            </ul>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("calendar")}
              // className="nav-link"
            >
              <NavLink
                className="nav-link d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/calendar"
              >
                <h2>
                  <LuCalendarCheck />
                </h2>
                <h5>Calendar</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("AttEntry")}
              // className="nav-link d-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/attendanceEntryPage"
              >
                <h2>
                  <FaRegCircleCheck />
                  {/* <FaRegCheckCircle /> */}
                </h2>
                <h5>Attendence Entry</h5>
              </NavLink>
            </div>
          </li>

          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("pdf")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/pdf"
              >
                <h2>
                  <FaRegFilePdf />
                </h2>
                <h5>PDF</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("video")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/video"
              >
                <h2>
                  <FiVideo />
                </h2>
                <h5>Videos</h5>
              </NavLink>
            </div>
          </li>

          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("GalleryDashboard")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/gallery"
              >
                <h2>
                  <GrGallery />
                </h2>
                <h5>Gallery</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("ReportCard")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/createReport"
              >
                <h2>
                  <TbReport />
                </h2>
                <h5>Report card</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("TeacherDashboard")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/teacherWorkReport"
              >
                <h2>
                  <TbReport />
                </h2>
                <h5>Work Report</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <div
              onClick={() => setActiveComponent("UserDashboard")}
              // className="nav-link d-inline-flex align-items-center gap-3"
            >
              <NavLink
                className="nav-link active d-inline-flex align-items-center gap-3"
                aria-current="page"
                to="/dashboard/users"
              >
                <h2>
                  <FaRegUser />
                </h2>
                <h5>User</h5>
              </NavLink>
            </div>
          </li>
          <li className="nav-item">
            <button
              onClick={logout}
              className="btn btn-danger w-75 gap-3 d-inline-flex align-items-center"
            >
              <h5>
                <FaPowerOff />
              </h5>
              <h5>Logout</h5>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

export default SideNav;
