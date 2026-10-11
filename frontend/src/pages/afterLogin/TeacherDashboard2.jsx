import React, { useState, useContext } from "react";
// import Fees from "../../components/Fees";
// import AdminPdf from "../../components/AdminPdf";
// import AdminVideo from "../../components/AdminVideo";
// import NewRegister from "../../components/NewStudentRegister";
// import TeacherRegister from "../../components/NewTeacherRegister";
// import GalleryDashboard from "../../components/GalleryDashboard";
// import TeacherDashboard from "../../components/TeachersEntry";
// import UserDashboard from "../../components/AdminUsers";
import { AuthContext } from "../../context/AuthContext";
// import AdminBirthday from "../../components/AdminBirthday";
// import TeacherBirthday from "../../components/TeacherBirthday";
// import ReportCard from "../../components/Reports";
// import Graph from "../../components/FeesOverviewPage";
// import CalendarPage from "../../components/CalendarPage";

// import { LiaBirthdayCakeSolid } from "react-icons/lia";
// import { FaRegFilePdf } from "react-icons/fa6";
// import { FiVideo } from "react-icons/fi";
// import { MdCurrencyRupee } from "react-icons/md";
// import { GrGallery } from "react-icons/gr";
// import { FaRegUser } from "react-icons/fa";
// import { TbReport } from "react-icons/tb";
import { FaPowerOff } from "react-icons/fa6";
import { IoAnalyticsOutline } from "react-icons/io5";
// import { SiReacthookform } from "react-icons/si";
// import { LuCalendarCheck } from "react-icons/lu";
// import { LuClipboardList } from "react-icons/lu";
// import { BsCake } from "react-icons/bs";
// import { MdCheckCircleOutline } from "react-icons/md";
// import { FaRegCheckCircle } from "react-icons/fa";
import { FaRegCircleCheck } from "react-icons/fa6";

// import StudentAttendance from "../../components/StudentAttendance";
// import AttendancePage from "../../components/AttendancePage";
import AttendanceEntryPage from "../../components/AttendanceEntryPage";
import WorkReport from "./TeacherDashboard";


function AdminDashboard() {
    const [activeComponent, setActiveComponent] = useState("WorkReport");
    const { user, logout } = useContext(AuthContext);

    const renderComponent = () => {
        switch (activeComponent) {
            case "WorkReport":
                return <WorkReport />;

            case "AttEntry":
                return <AttendanceEntryPage />;

            default:
                return <WorkReport />;
        }
    };
    return (
        <>
            <div className="d-flex" style={{ width: "100vw" }}>
                <nav className="bg-light border-end vh-auto p-3 min-vh-100">
                    <h4>Admin Dashboard</h4>
                    <ul className="nav flex-column row-gap-3">


                        <li className="nav-item">
                            <div
                                onClick={() => setActiveComponent("WorkReport")}
                                className="nav-link d-flex align-items-baseline gap-3"
                            >
                                <h2>
                                    <IoAnalyticsOutline />
                                </h2>
                                <h5>Work Report</h5>
                            </div>
                        </li>

                        <li className="nav-item">
                            <div
                                onClick={() => setActiveComponent("AttEntry")}
                                className="nav-link d-flex align-items-center gap-3"
                            >
                                <h2>
                                    <FaRegCircleCheck />
                                    {/* <FaRegCheckCircle /> */}
                                </h2>
                                <h5>Attendence Entry</h5>
                            </div>
                        </li>


                        <li className="nav-item">
                            <button onClick={logout} className="btn btn-danger w-75 gap-3 d-flex align-items-baseline">
                                <h5>
                                    <FaPowerOff />
                                </h5>
                                <h5>Logout</h5>
                            </button>
                        </li>
                    </ul>
                </nav>
                <main className="p-4 w-100 h-auto">{renderComponent()}</main>
            </div>
        </>
    );
}

export default AdminDashboard;
