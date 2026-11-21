import React from 'react';
import { Link } from 'react-router-dom';
import { MdAdminPanelSettings, MdArrowBack } from 'react-icons/md';

export default function LoginRegister() {
  return (
    <main className="container py-5">
      <section className="page-card mx-auto text-center" style={{ maxWidth: 560 }}>
        <div className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary-subtle text-primary p-3 mb-3">
          <MdAdminPanelSettings size={30} aria-hidden="true" />
        </div>
        <h1 className="h3">Accounts are managed by your school</h1>
        <p className="text-secondary mb-4">For safety, teachers and administrators cannot create their own accounts here. Ask your preschool administrator to create your login and share your sign-in details privately.</p>
        <Link className="btn btn-primary" to="/login"><MdArrowBack className="me-2" aria-hidden="true" />Back to sign in</Link>
      </section>
    </main>
  );
}
