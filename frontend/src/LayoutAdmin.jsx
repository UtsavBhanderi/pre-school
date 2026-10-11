import React from "react";
// import Header from "./pages/beforeLogin/Header.jsx";
import SideNav from "./pages/afterLogin/SideNav.jsx";
import { Outlet } from "react-router-dom";

function Layout() {
  return (
    <>
      {/* <Header /> */}
      <div className="d-inline-flex overflow-x-hidden">
        <div className="w-auto" style={{maxWidth:"200px"}}>
        <SideNav />
        </div>
        <div className="p-3" style={{width:"calc(100vw - 217px)"}}>
        <Outlet />
        </div>
      </div>
    </>
  );
}

export default Layout;
