import React from 'react'
// import Header from './pages/beforeLogin/Header.jsx'
// import Footer from "./pages/beforeLogin/Footer.jsx";
import { Outlet } from 'react-router-dom'

function Layout() {
  return (
    <>
        {/* <Header /> */}
        <Outlet />
        {/* <Footer /> */}
    </>
  )
}

export default Layout